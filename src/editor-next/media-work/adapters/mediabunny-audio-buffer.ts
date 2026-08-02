import { AudioSampleSink, EncodedPacketSink } from "mediabunny";

export type MediabunnyAudioFormat = {
	numberOfChannels: number;
	sampleRate: number;
};

export type DecodeMediabunnyAudioTrackRangeOptions = {
	endSeconds: number;
	format: MediabunnyAudioFormat;
	signal: AbortSignal;
	startSeconds: number;
	track: ConstructorParameters<typeof AudioSampleSink>[0];
};

export async function decodeMediabunnyAudioTrackRange({
	endSeconds,
	format,
	signal,
	startSeconds,
	track,
}: DecodeMediabunnyAudioTrackRangeOptions): Promise<AudioBuffer> {
	throwIfAborted(signal);
	validateRange(startSeconds, endSeconds);
	validateFormat(format);

	const outputLength = Math.ceil(
		(endSeconds - startSeconds) * format.sampleRate,
	);
	if (!Number.isSafeInteger(outputLength) || outputLength <= 0) {
		throw new Error(
			`Decoded audio range requires an invalid frame count: ${outputLength}.`,
		);
	}

	const output = createBrowserAudioBuffer({
		length: outputLength,
		numberOfChannels: format.numberOfChannels,
		sampleRate: format.sampleRate,
	});
	const encodedGaps = await findEncodedAudioGaps({
		endSeconds,
		sampleRate: format.sampleRate,
		signal,
		startSeconds,
		track,
	});
	const projectTimestamp = createDecodedTimestampProjector(encodedGaps);
	const sink = new AudioSampleSink(track);
	let copiedFrameCount = 0;

	for await (const sample of sink.samples(startSeconds, endSeconds)) {
		throwIfAborted(signal);

		try {
			if (
				sample.sampleRate !== format.sampleRate ||
				sample.numberOfChannels !== format.numberOfChannels
			) {
				throw new Error(
					`Decoded audio format changed from ${format.sampleRate}Hz/${format.numberOfChannels} channels to ${sample.sampleRate}Hz/${sample.numberOfChannels} channels.`,
				);
			}

			const projectedTimestamp = projectTimestamp(sample.timestamp);
			const projectedStartFrame = Math.round(
				(projectedTimestamp - startSeconds) * format.sampleRate,
			);
			const sourceStartFrame = Math.max(0, -projectedStartFrame);
			const targetStartFrame = Math.max(0, projectedStartFrame);
			const frameCount = Math.max(
				0,
				Math.min(
					sample.numberOfFrames - sourceStartFrame,
					output.length - targetStartFrame,
				),
			);

			if (frameCount === 0) {
				continue;
			}

			for (let channel = 0; channel < format.numberOfChannels; channel += 1) {
				const destination = output
					.getChannelData(channel)
					.subarray(targetStartFrame, targetStartFrame + frameCount);
				sample.copyTo(destination, {
					format: "f32-planar",
					frameCount,
					frameOffset: sourceStartFrame,
					planeIndex: channel,
				});
			}

			copiedFrameCount += frameCount;
			throwIfAborted(signal);
		} finally {
			sample.close();
		}
	}

	throwIfAborted(signal);
	if (copiedFrameCount === 0) {
		throw new Error("The audio track decoded no presentable samples.");
	}

	return output;
}

type EncodedAudioGap = {
	endSeconds: number;
	startSeconds: number;
};

async function findEncodedAudioGaps({
	endSeconds,
	sampleRate,
	signal,
	startSeconds,
	track,
}: {
	endSeconds: number;
	sampleRate: number;
	signal: AbortSignal;
	startSeconds: number;
	track: ConstructorParameters<typeof EncodedPacketSink>[0];
}): Promise<EncodedAudioGap[]> {
	const packetRanges: EncodedAudioGap[] = [];
	const sink = new EncodedPacketSink(track);

	for await (const packet of sink.packets(undefined, undefined, {
		metadataOnly: true,
	})) {
		throwIfAborted(signal);
		if (
			Number.isFinite(packet.timestamp) &&
			Number.isFinite(packet.duration) &&
			packet.duration > 0 &&
			packet.timestamp < endSeconds &&
			packet.timestamp + packet.duration > startSeconds
		) {
			packetRanges.push({
				endSeconds: packet.timestamp + packet.duration,
				startSeconds: packet.timestamp,
			});
		}
	}

	packetRanges.sort((left, right) => left.startSeconds - right.startSeconds);
	const gaps: EncodedAudioGap[] = [];
	const gapToleranceSeconds = 2 / sampleRate;
	let previousEndSeconds: number | null = null;

	for (const packet of packetRanges) {
		if (
			previousEndSeconds !== null &&
			packet.startSeconds - previousEndSeconds > gapToleranceSeconds
		) {
			gaps.push({
				endSeconds: Math.min(endSeconds, packet.startSeconds),
				startSeconds: Math.max(startSeconds, previousEndSeconds),
			});
		}

		previousEndSeconds = Math.max(
			previousEndSeconds ?? Number.NEGATIVE_INFINITY,
			packet.endSeconds,
		);
	}

	return gaps.filter((gap) => gap.endSeconds > gap.startSeconds);
}

function createDecodedTimestampProjector(gaps: EncodedAudioGap[]) {
	let cumulativeCollapsedGapSeconds = 0;
	let gapIndex = 0;

	return (decodedTimestampSeconds: number) => {
		let projectedTimestampSeconds =
			decodedTimestampSeconds + cumulativeCollapsedGapSeconds;

		while (gapIndex < gaps.length) {
			const gap = gaps[gapIndex];

			if (!gap || projectedTimestampSeconds < gap.startSeconds) {
				break;
			}

			gapIndex += 1;
			if (projectedTimestampSeconds >= gap.endSeconds) {
				continue;
			}

			const collapsedGapSeconds = gap.endSeconds - gap.startSeconds;
			cumulativeCollapsedGapSeconds += collapsedGapSeconds;
			projectedTimestampSeconds += collapsedGapSeconds;
		}

		return projectedTimestampSeconds;
	};
}

export function createBrowserAudioBuffer({
	length,
	numberOfChannels,
	sampleRate,
}: {
	length: number;
	numberOfChannels: number;
	sampleRate: number;
}): AudioBuffer {
	if (typeof AudioBuffer !== "undefined") {
		return new AudioBuffer({ length, numberOfChannels, sampleRate });
	}

	return new OfflineAudioContext(
		numberOfChannels,
		length,
		sampleRate,
	).createBuffer(numberOfChannels, length, sampleRate);
}

function validateRange(startSeconds: number, endSeconds: number) {
	if (
		!Number.isFinite(startSeconds) ||
		!Number.isFinite(endSeconds) ||
		startSeconds < 0 ||
		endSeconds <= startSeconds
	) {
		throw new Error(
			`Expected a positive decoded audio range, got [${startSeconds}, ${endSeconds}).`,
		);
	}
}

function validateFormat(format: MediabunnyAudioFormat) {
	if (
		!Number.isSafeInteger(format.numberOfChannels) ||
		format.numberOfChannels <= 0 ||
		!Number.isSafeInteger(format.sampleRate) ||
		format.sampleRate <= 0
	) {
		throw new Error(
			`Expected a valid decoded audio format, got ${format.sampleRate}Hz/${format.numberOfChannels} channels.`,
		);
	}
}

function throwIfAborted(signal: AbortSignal) {
	if (signal.aborted) {
		throw new DOMException(
			"Decoded audio preparation was cancelled.",
			"AbortError",
		);
	}
}
