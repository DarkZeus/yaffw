import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from "mediabunny";
import { useEffect, useState } from "react";

import type { ReadyMediaAsset } from "@/editor-core/model";

import type {
	WaveformLaneLoader,
	WaveformLaneRequest,
	WaveformLaneResult,
	WaveformLaneState,
} from "./selection-waveform-lanes.types";

const WAVEFORM_SAMPLE_COUNT = 8192;

export function useWaveformLaneStates({
	asset,
	source,
	waveformLaneLoader,
}: {
	asset: ReadyMediaAsset;
	source: Blob;
	waveformLaneLoader: WaveformLaneLoader;
}) {
	const [laneStates, setLaneStates] = useState<
		Record<string, WaveformLaneState>
	>({});

	useEffect(() => {
		let cancelled = false;

		setLaneStates(
			Object.fromEntries(
				asset.tracks.audio.map((track) => [
					track.id,
					{
						status: "loading",
						track,
					} satisfies WaveformLaneState,
				]),
			),
		);

		asset.tracks.audio.forEach((track, trackIndex) => {
			void waveformLaneLoader({
				assetDurationUs: asset.durationUs,
				source,
				track,
				trackIndex,
			})
				.then((result) => {
					if (cancelled) {
						return;
					}

					setLaneStates((currentStates) => ({
						...currentStates,
						[track.id]: {
							...result,
							track,
						},
					}));
				})
				.catch((error: unknown) => {
					if (cancelled) {
						return;
					}

					setLaneStates((currentStates) => ({
						...currentStates,
						[track.id]: {
							reason: errorToMessage(error),
							status: "unavailable",
							track,
						},
					}));
				});
		});

		return () => {
			cancelled = true;
		};
	}, [asset.durationUs, asset.tracks.audio, source, waveformLaneLoader]);

	return laneStates;
}

export async function loadBrowserWaveformLane({
	assetDurationUs,
	source,
	trackIndex,
}: WaveformLaneRequest): Promise<WaveformLaneResult> {
	try {
		const input = new Input({
			formats: ALL_FORMATS,
			source: new BlobSource(source),
		});
		const tracks = await input.getAudioTracks();
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

		const assetDurationSeconds = assetDurationUs / 1_000_000;
		const trackEndTimestamp = await track.computeDuration();

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

		const sink = new AudioBufferSink(track);
		const buckets = new Array<number>(WAVEFORM_SAMPLE_COUNT).fill(0);
		let framesRead = 0;
		let sampleRate = 0;

		for await (const { buffer, timestamp } of sink.buffers(
			0,
			Math.min(assetDurationSeconds, trackEndTimestamp),
		)) {
			sampleRate = buffer.sampleRate;
			addAudioBufferToBuckets({
				buffer,
				buckets,
				mediaDurationSeconds: assetDurationSeconds,
				timestampSeconds: timestamp,
			});
			framesRead += buffer.length;
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
		return {
			reason: errorToMessage(error),
			status: "unavailable",
		};
	}
}

export function addAudioBufferToBuckets({
	buffer,
	buckets,
	mediaDurationSeconds,
	timestampSeconds,
}: {
	buffer: AudioBuffer;
	buckets: number[];
	mediaDurationSeconds: number;
	timestampSeconds: number;
}) {
	const channelData = Array.from(
		{ length: buffer.numberOfChannels },
		(_, index) => buffer.getChannelData(index),
	);
	const secondsPerBucket = mediaDurationSeconds / buckets.length;

	for (let frameIndex = 0; frameIndex < buffer.length; frameIndex += 1) {
		const sampleTimestampSeconds =
			timestampSeconds + frameIndex / buffer.sampleRate;

		if (
			sampleTimestampSeconds < 0 ||
			sampleTimestampSeconds >= mediaDurationSeconds
		) {
			continue;
		}

		let amplitude = 0;

		for (const channel of channelData) {
			amplitude += Math.abs(channel[frameIndex] ?? 0);
		}

		const bucketIndex = Math.min(
			buckets.length - 1,
			Math.floor(sampleTimestampSeconds / secondsPerBucket),
		);
		buckets[bucketIndex] = Math.max(
			buckets[bucketIndex],
			amplitude / Math.max(1, channelData.length),
		);
	}
}

function normalizeBuckets(buckets: number[]): number[] {
	const maximumAmplitude = Math.max(0.01, ...buckets);

	return buckets.map((bucket) => bucket / maximumAmplitude);
}

function errorToMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}
