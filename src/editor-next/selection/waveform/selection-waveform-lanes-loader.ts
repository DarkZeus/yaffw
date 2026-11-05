import {
	ALL_FORMATS,
	type AudioSample,
	AudioSampleSink,
	BlobSource,
	EncodedPacketSink,
	Input,
} from "mediabunny";

import {
	AudioPacketTimeline,
	DecodedAudioTimestampProjector,
	audioPacketDurationsMaySpanGaps,
} from "../../media-work/adapters/audio-packet-timeline";
import { createMediaSourceFailureBoundary } from "../../media-work/scopes/media-source-failure-boundary";
import type {
	WaveformLaneRequest,
	WaveformLaneResult,
} from "../types/selection-waveform-lanes.types";

export const WAVEFORM_SAMPLE_COUNT = 8192;

type MutableWaveformBuckets = Float32Array | number[];
type WaveformLaneLoadRequest = Omit<WaveformLaneRequest, "track">;

export async function loadDecodedWaveformLane({
	assetDurationUs,
	signal,
	source,
	trackIndex,
}: WaveformLaneLoadRequest): Promise<WaveformLaneResult> {
	throwIfAborted(signal);

	const sourceFailure = createMediaSourceFailureBoundary();
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(source, {
			handleUnhandledError: sourceFailure.handleUnhandledError,
		}),
	});

	try {
		return await sourceFailure.run(
			decodeWaveformLane({ assetDurationUs, input, signal, trackIndex }),
		);
	} catch (error) {
		if (signal?.aborted || isWaveformAbortError(error)) {
			throw createWaveformAbortError();
		}

		return {
			reason: errorToMessage(error),
			status: "unavailable",
		};
	} finally {
		input.dispose();
	}
}

async function decodeWaveformLane({
	assetDurationUs,
	input,
	signal,
	trackIndex,
}: Pick<
	WaveformLaneLoadRequest,
	"assetDurationUs" | "signal" | "trackIndex"
> & {
	input: Input;
}): Promise<WaveformLaneResult> {
	const tracks = await input.getAudioTracks();
	throwIfAborted(signal);

	const track = tracks[trackIndex];

	if (!track) {
		return {
			reason: "The analyzed audio track is no longer available.",
			status: "unavailable",
		};
	}

	if (!(await track.canDecode())) {
		return {
			reason: "This browser cannot decode the audio track for waveform use.",
			status: "unavailable",
		};
	}
	throwIfAborted(signal);

	const assetDurationSeconds = assetDurationUs / 1_000_000;
	const trackEndTimestamp = await track.computeDuration();
	throwIfAborted(signal);

	if (
		!Number.isFinite(assetDurationSeconds) ||
		assetDurationSeconds <= 0 ||
		!Number.isFinite(trackEndTimestamp) ||
		trackEndTimestamp <= 0
	) {
		return {
			reason: "The audio track duration could not be measured.",
			status: "unavailable",
		};
	}

	// PCM decoders preserve input timestamps and derive duration from frame
	// bytes. Unknown metadata duration must never turn those frames into gaps.
	const needsTimestampProjection = audioPacketDurationsMaySpanGaps(
		await track.getCodec(),
	);
	const packetTimeline = new AudioPacketTimeline({
		packetDurationsMaySpanGaps: needsTimestampProjection,
		sampleRate: await track.getSampleRate(),
	});
	const timestampProjector = new DecodedAudioTimestampProjector(0);
	const packetIterator = needsTimestampProjection
		? new EncodedPacketSink(track)
				.packets(undefined, undefined, { metadataOnly: true })
				[Symbol.asyncIterator]()
		: null;
	let packetLookaheadSeconds = Number.NEGATIVE_INFINITY;
	let packetsEnded = false;
	let projectedThroughSeconds = 0;
	const sink = new AudioSampleSink(track);
	const buckets = new Float32Array(WAVEFORM_SAMPLE_COUNT);
	let framesRead = 0;
	let sampleRate = 0;
	const iterator = sink
		.samples(0, Math.min(assetDurationSeconds, trackEndTimestamp))
		[Symbol.asyncIterator]();

	try {
		while (true) {
			throwIfAborted(signal);

			const { done, value } = await iterator.next();
			if (done) {
				break;
			}

			const sample = value;
			try {
				throwIfAborted(signal);
				const durationSeconds = sample.numberOfFrames / sample.sampleRate;
				// Read metadata only through this sample's media-time horizon plus
				// one packet. That lookahead exposes a gap after the preceding packet;
				// prune consumed ranges so long recordings never retain a full index.
				const horizon =
					Math.max(projectedThroughSeconds, sample.timestamp) + durationSeconds;
				while (
					packetIterator &&
					!packetsEnded &&
					packetLookaheadSeconds <= horizon
				) {
					throwIfAborted(signal);
					const packetResult = await packetIterator.next();
					throwIfAborted(signal);
					if (packetResult.done) {
						packetsEnded = true;
						break;
					}
					const packet = packetResult.value;
					if (
						!Number.isFinite(packet.timestamp) ||
						!Number.isFinite(packet.duration) ||
						packet.duration < 0
					)
						continue;
					packetLookaheadSeconds = packet.timestamp;
					packetTimeline.add({
						startSeconds: packet.timestamp,
						endSeconds: packet.timestamp + packet.duration,
					});
				}
				const timestampSeconds = needsTimestampProjection
					? timestampProjector.project(
							sample.timestamp,
							durationSeconds,
							packetTimeline,
						)
					: sample.timestamp;
				projectedThroughSeconds = timestampSeconds + durationSeconds;
				sampleRate = sample.sampleRate;
				addAudioSampleToBuckets({
					buckets,
					mediaDurationSeconds: assetDurationSeconds,
					sample,
					timestampSeconds,
				});
				packetTimeline.prune(timestampSeconds);
				framesRead += sample.numberOfFrames;
			} finally {
				sample.close();
			}
		}
	} finally {
		try {
			await iterator.return?.();
		} finally {
			await packetIterator?.return?.();
		}
	}

	throwIfAborted(signal);
	if (framesRead === 0 || sampleRate === 0) {
		return {
			reason: "No audio samples were decoded for this track.",
			status: "unavailable",
		};
	}

	return {
		samples: normalizeBuckets(buckets),
		status: "ready",
	};
}

export function addAudioSampleToBuckets({
	buckets,
	mediaDurationSeconds,
	sample,
	timestampSeconds = sample.timestamp,
}: {
	buckets: MutableWaveformBuckets;
	mediaDurationSeconds: number;
	timestampSeconds?: number;
	sample: Pick<
		AudioSample,
		| "copyTo"
		| "numberOfChannels"
		| "numberOfFrames"
		| "sampleRate"
		| "timestamp"
	>;
}) {
	const frameAmplitudes = new Float32Array(sample.numberOfFrames);
	const channelData = new Float32Array(sample.numberOfFrames);

	for (
		let channelIndex = 0;
		channelIndex < sample.numberOfChannels;
		channelIndex += 1
	) {
		sample.copyTo(channelData, {
			format: "f32-planar",
			planeIndex: channelIndex,
		});

		for (
			let frameIndex = 0;
			frameIndex < sample.numberOfFrames;
			frameIndex += 1
		) {
			frameAmplitudes[frameIndex] =
				(frameAmplitudes[frameIndex] ?? 0) +
				Math.abs(channelData[frameIndex] ?? 0);
		}
	}

	const secondsPerBucket = mediaDurationSeconds / buckets.length;

	for (
		let frameIndex = 0;
		frameIndex < sample.numberOfFrames;
		frameIndex += 1
	) {
		const sampleTimestampSeconds =
			timestampSeconds + frameIndex / sample.sampleRate;

		if (
			sampleTimestampSeconds < 0 ||
			sampleTimestampSeconds >= mediaDurationSeconds
		) {
			continue;
		}

		const bucketIndex = Math.min(
			buckets.length - 1,
			Math.floor(sampleTimestampSeconds / secondsPerBucket),
		);
		buckets[bucketIndex] = Math.max(
			buckets[bucketIndex] ?? 0,
			(frameAmplitudes[frameIndex] ?? 0) / Math.max(1, sample.numberOfChannels),
		);
	}
}

export function createWaveformAbortError() {
	if (typeof DOMException !== "undefined") {
		return new DOMException("Waveform generation was cancelled.", "AbortError");
	}

	const error = new Error("Waveform generation was cancelled.");
	error.name = "AbortError";
	return error;
}

export function isWaveformAbortError(error: unknown) {
	return error instanceof Error && error.name === "AbortError";
}

function normalizeBuckets(buckets: Float32Array): Float32Array {
	let maximumAmplitude = 0.01;

	for (const bucket of buckets) {
		maximumAmplitude = Math.max(maximumAmplitude, bucket);
	}

	for (let index = 0; index < buckets.length; index += 1) {
		buckets[index] = (buckets[index] ?? 0) / maximumAmplitude;
	}

	return buckets;
}

function throwIfAborted(signal: AbortSignal | undefined) {
	if (signal?.aborted) {
		throw createWaveformAbortError();
	}
}

function errorToMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}
