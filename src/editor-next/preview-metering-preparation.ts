import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from "mediabunny";

import type { AudioMediaTrack } from "@/editor-core/model";
import { createAudioBuffer } from "./browser-audio-mix";
import type { InputAudioTrack } from "./browser-audio-preview-sources.types";
import {
	createDisposableMediaCleanup,
	type DisposableMediaWorkScope,
	withDisposableMediaWorkScope,
} from "./disposable-media-work-scope";
import type {
	PreviewMeteringPreparationFailure,
	PreviewMeteringPreparationRequest,
	PreviewMeteringPreparationResult,
	PreviewMeteringPreparedTrack,
} from "./preview-metering-preparation.types";

export async function preparePreviewMeteringData({
	asset,
	signal,
	source,
	trackIds,
}: PreviewMeteringPreparationRequest): Promise<PreviewMeteringPreparationResult> {
	return withDisposableMediaWorkScope(async (scope) => {
		throwIfAborted(signal);

		if (asset.tracks.audio.length === 0) {
			return {
				failures: [],
				tracks: [],
			};
		}

		const input = scope.registerDisposable(
			new Input({
				formats: ALL_FORMATS,
				source: new BlobSource(source),
			}),
		);
		const inputTracks = await input.getAudioTracks();
		const failures: PreviewMeteringPreparationFailure[] = [];
		const preparedTracks: PreviewMeteringPreparedTrack[] = [];

		for (const [trackIndex, assetTrack] of asset.tracks.audio.entries()) {
			throwIfAborted(signal);

			if (trackIds && !trackIds.has(assetTrack.id)) {
				continue;
			}

			const inputTrack =
				inputTracks.find((track) => String(track.id) === assetTrack.id) ??
				inputTracks[trackIndex];

			if (!inputTrack) {
				failures.push({
					reason: "The analyzed audio track is no longer available.",
					track: assetTrack,
					trackId: assetTrack.id,
					trackIndex,
				});
				continue;
			}

			try {
				if (!(await inputTrack.canDecode())) {
					throw new Error("Track is not decodable in this browser.");
				}

				const decoded = await decodePreviewMeteringTrackToBuffer({
					scope,
					signal,
					track: inputTrack,
				});

				preparedTracks.push({
					audioBuffer: decoded.audioBuffer,
					channelLabels: createPreviewMeteringChannelLabels({
						decodedChannelCount: decoded.audioBuffer.numberOfChannels,
						track: assetTrack,
					}),
					startPositionSeconds: decoded.startPositionSeconds,
					track: assetTrack,
					trackId: assetTrack.id,
					trackIndex,
				});
			} catch (error) {
				if (isAbortError(error)) {
					throw error;
				}

				failures.push({
					reason: errorToMessage(error),
					track: assetTrack,
					trackId: assetTrack.id,
					trackIndex,
				});
			}
		}

		return {
			failures,
			tracks: preparedTracks,
		};
	});
}

async function decodePreviewMeteringTrackToBuffer({
	scope,
	signal,
	track,
}: {
	scope: DisposableMediaWorkScope;
	signal: AbortSignal;
	track: InputAudioTrack;
}): Promise<{
	audioBuffer: AudioBuffer;
	startPositionSeconds: number;
}> {
	const sink = new AudioSampleSink(track);
	const chunks: Array<{ buffer: AudioBuffer; timestamp: number }> = [];
	let firstTimestampSeconds = Number.POSITIVE_INFINITY;
	let numberOfChannels = Math.max(1, track.numberOfChannels || 1);
	let sampleRate = Math.max(1, track.sampleRate || 48_000);

	for await (const sample of sink.samples()) {
		throwIfAborted(signal);
		const closeSample = createDisposableMediaCleanup(async () => {
			sample.close();
		});
		scope.registerCleanup(closeSample);

		try {
			const buffer = sample.toAudioBuffer();

			if (chunks.length === 0) {
				sampleRate = buffer.sampleRate || sampleRate;
			}

			if (buffer.sampleRate !== sampleRate) {
				throw new Error(
					`Decoded sample rate changed from ${sampleRate}Hz to ${buffer.sampleRate}Hz.`,
				);
			}

			numberOfChannels = Math.max(numberOfChannels, buffer.numberOfChannels);
			firstTimestampSeconds = Math.min(firstTimestampSeconds, sample.timestamp);
			chunks.push({
				buffer,
				timestamp: sample.timestamp,
			});
		} finally {
			await closeSample();
		}
	}

	if (chunks.length === 0) {
		throw new Error("Original audio track produced no decoded buffers.");
	}

	const startPositionSeconds = Number.isFinite(firstTimestampSeconds)
		? firstTimestampSeconds
		: 0;
	const frameSpans = chunks.map(({ buffer, timestamp }) => {
		const frameOffset = Math.max(
			0,
			Math.round((timestamp - startPositionSeconds) * sampleRate),
		);

		return {
			buffer,
			frameEnd: frameOffset + buffer.length,
			frameOffset,
		};
	});
	const length = Math.max(...frameSpans.map((span) => span.frameEnd));
	const audioBuffer = createAudioBuffer({
		length,
		numberOfChannels,
		sampleRate,
	});

	for (const { buffer, frameOffset } of frameSpans) {
		for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
			const channelData = new Float32Array(buffer.length);
			buffer.copyFromChannel(channelData, channel);
			audioBuffer.copyToChannel(channelData, channel, frameOffset);
		}
	}

	return {
		audioBuffer,
		startPositionSeconds,
	};
}

function createPreviewMeteringChannelLabels({
	decodedChannelCount,
	track,
}: {
	decodedChannelCount: number;
	track: AudioMediaTrack;
}): string[] {
	const channelCount = Math.min(
		Math.max(Math.round(decodedChannelCount), 1),
		8,
	);
	const analyzedChannelCount =
		typeof track.channels === "number" && Number.isFinite(track.channels)
			? Math.round(track.channels)
			: null;

	if (analyzedChannelCount === 1 && channelCount === 1) {
		return ["Mono"];
	}

	if (analyzedChannelCount === 2 && channelCount === 2) {
		return ["Left", "Right"];
	}

	return Array.from(
		{ length: channelCount },
		(_, channelIndex) => `Ch ${channelIndex + 1}`,
	);
}

function throwIfAborted(signal: AbortSignal) {
	if (signal.aborted) {
		throw new DOMException("The operation was aborted.", "AbortError");
	}
}

function isAbortError(error: unknown) {
	return (
		(error instanceof DOMException && error.name === "AbortError") ||
		(error instanceof Error && error.name === "AbortError")
	);
}

function errorToMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}
