export type AudioPacketRange = {
	endSeconds: number;
	startSeconds: number;
};

export type AudioPacketTimelineOptions = {
	/**
	 * Containers often derive a packet's duration from the next packet's
	 * timestamp (Matroska block timing, ffmpeg-written MP4 sample tables), so
	 * the packet before a gap appears to span the whole gap.
	 */
	packetDurationsMaySpanGaps: boolean;
	sampleRate: number;
};

/**
 * Compressed codecs use near-constant frame sizes, which exposes a packet that
 * spans a gap. PCM packet sizes legitimately vary, so they stay as declared.
 */
export function audioPacketDurationsMaySpanGaps(codec: string | null) {
	return (
		codec !== null &&
		!codec.startsWith("pcm-") &&
		codec !== "ulaw" &&
		codec !== "alaw"
	);
}

// Legitimate audio packets in one stream stay within a small factor of each
// other (Vorbis long/short blocks are the widest common spread).
const GAP_SPANNING_DURATION_FACTOR = 3;
const TYPICAL_DURATION_WINDOW = 64;

/**
 * Encoded audio packet timing used to find real gaps that decoded sample
 * timestamps collapse.
 */
export class AudioPacketTimeline {
	private readonly ranges: AudioPacketRange[] = [];
	private readonly recentDurations: number[] = [];
	private cachedGaps: AudioPacketRange[] | null = null;

	constructor(private readonly options: AudioPacketTimelineOptions) {}

	add(range: AudioPacketRange) {
		// Packets arrive in scan order, so only a re-read lookahead can repeat.
		if (this.ranges.at(-1)?.startSeconds === range.startSeconds) {
			return;
		}
		this.cachedGaps = null;
		this.ranges.push(range);
		this.recentDurations.push(range.endSeconds - range.startSeconds);
		if (this.recentDurations.length > TYPICAL_DURATION_WINDOW) {
			this.recentDurations.shift();
		}
	}

	sort() {
		this.cachedGaps = null;
		this.ranges.sort((left, right) => left.startSeconds - right.startSeconds);
	}

	clear() {
		this.cachedGaps = null;
		this.ranges.length = 0;
	}

	/** Packet ranges as declared by the demuxer, which decoding follows. */
	declaredRanges(): readonly AudioPacketRange[] {
		return this.ranges;
	}

	/** Packet ranges that actually carry audio. */
	presentedRanges(): AudioPacketRange[] {
		const typicalDuration = this.typicalGapSpanningDuration();
		if (typicalDuration === null) {
			return [...this.ranges];
		}

		return this.ranges.map((range) =>
			range.endSeconds - range.startSeconds >
			typicalDuration * GAP_SPANNING_DURATION_FACTOR
				? {
						endSeconds: range.startSeconds + typicalDuration,
						startSeconds: range.startSeconds,
					}
				: range,
		);
	}

	gaps(): readonly AudioPacketRange[] {
		if (this.cachedGaps) {
			return this.cachedGaps;
		}

		const gaps: AudioPacketRange[] = [];
		const toleranceSeconds = 2 / this.options.sampleRate;
		let previousEndSeconds: number | null = null;

		for (const range of this.presentedRanges()) {
			if (
				previousEndSeconds !== null &&
				range.startSeconds - previousEndSeconds > toleranceSeconds
			) {
				gaps.push({
					endSeconds: range.startSeconds,
					startSeconds: previousEndSeconds,
				});
			}
			previousEndSeconds = Math.max(
				previousEndSeconds ?? Number.NEGATIVE_INFINITY,
				range.endSeconds,
			);
		}

		this.cachedGaps = gaps;
		return gaps;
	}

	/**
	 * Where to start decoding so `startSeconds` decodes correctly. Decoder
	 * pre-roll that reaches back across a gap would collapse it before the
	 * sink's start filter, dropping the first samples after the gap, so decoding
	 * starts at the packet before such a gap instead.
	 */
	decodeStartFor(startSeconds: number, preRollSeconds: number) {
		const preRollStartSeconds = startSeconds - preRollSeconds;
		for (const gap of this.gaps()) {
			if (gap.startSeconds >= startSeconds) {
				break;
			}
			if (gap.endSeconds <= preRollStartSeconds) {
				continue;
			}

			const beforeGap = this.presentedRanges()
				.filter((range) => range.endSeconds <= gap.startSeconds)
				.at(-1);
			return Math.min(startSeconds, beforeGap?.startSeconds ?? startSeconds);
		}

		return startSeconds;
	}

	/** Drops ranges ending by `throughSeconds`, keeping the latest one as context. */
	prune(throughSeconds: number) {
		let predecessor: AudioPacketRange | null = null;
		const futureRanges: AudioPacketRange[] = [];

		for (const range of this.ranges) {
			if (range.endSeconds <= throughSeconds) {
				if (!predecessor || range.endSeconds > predecessor.endSeconds) {
					predecessor = range;
				}
				continue;
			}
			futureRanges.push(range);
		}

		this.cachedGaps = null;
		this.ranges.length = 0;
		if (predecessor) {
			this.ranges.push(predecessor);
		}
		this.ranges.push(...futureRanges);
	}

	private typicalGapSpanningDuration() {
		if (
			!this.options.packetDurationsMaySpanGaps ||
			this.recentDurations.length === 0
		) {
			return null;
		}

		const sorted = [...this.recentDurations].sort(
			(left, right) => left - right,
		);
		// The lower median ignores a gap-spanning outlier even among two packets.
		return sorted[Math.floor((sorted.length - 1) / 2)] ?? null;
	}
}

/**
 * Maps decoded sample timestamps back onto the media timeline.
 *
 * Chromium's AudioDecoder stamps output from the first input timestamp plus
 * decoded frames, ignoring later input timestamps, and Mediabunny 1.65.0
 * passes that through. Decoded timestamps therefore run straight across
 * encoded packet gaps, so the first sample decoded after a gap is moved to the
 * gap's end.
 */
export class DecodedAudioTimestampProjector {
	private calibrated = false;
	private offsetSeconds = 0;
	private throughGapEndSeconds = Number.NEGATIVE_INFINITY;

	/** `decodeStartSeconds` is where the sample sink was asked to start. */
	constructor(private readonly decodeStartSeconds: number) {}

	project(
		decodedTimestampSeconds: number,
		decodedDurationSeconds: number,
		timeline: AudioPacketTimeline,
	) {
		if (!this.calibrated) {
			// The sink starts at the declared packet covering the decode start, so
			// gaps collapsed during decoder pre-roll show up as a leading offset.
			const anchor = timeline
				.declaredRanges()
				.find((range) => range.endSeconds > this.decodeStartSeconds);
			if (anchor) {
				this.offsetSeconds = Math.max(
					0,
					anchor.startSeconds - decodedTimestampSeconds,
				);
				this.throughGapEndSeconds = anchor.startSeconds;
			}
			this.calibrated = true;
		}

		let projectedSeconds = decodedTimestampSeconds + this.offsetSeconds;
		for (const gap of timeline.gaps()) {
			if (gap.endSeconds <= this.throughGapEndSeconds) {
				continue;
			}
			// A sample mostly past the gap start was decoded after the gap.
			if (projectedSeconds + decodedDurationSeconds / 2 < gap.startSeconds) {
				break;
			}

			this.throughGapEndSeconds = gap.endSeconds;
			if (projectedSeconds >= gap.endSeconds) {
				continue;
			}

			this.offsetSeconds += gap.endSeconds - projectedSeconds;
			projectedSeconds = gap.endSeconds;
		}

		return projectedSeconds;
	}
}
