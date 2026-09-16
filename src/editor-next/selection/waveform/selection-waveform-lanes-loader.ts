import {
	ALL_FORMATS,
	type AudioSample,
	AudioSampleSink,
	BlobSource,
	Input,
} from "mediabunny";

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

	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(source),
	});

	try {
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

				throwIfAborted(signal);

				const sample = value;
				try {
					throwIfAborted(signal);
					sampleRate = sample.sampleRate;
					addAudioSampleToBuckets({
						buckets,
						mediaDurationSeconds: assetDurationSeconds,
						sample,
					});
					framesRead += sample.numberOfFrames;
				} finally {
					sample.close();
				}
			}
		} finally {
			await iterator.return?.();
		}

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

export function addAudioSampleToBuckets({
	buckets,
	mediaDurationSeconds,
	sample,
}: {
	buckets: MutableWaveformBuckets;
	mediaDurationSeconds: number;
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
			sample.timestamp + frameIndex / sample.sampleRate;

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
