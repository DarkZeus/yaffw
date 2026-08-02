import { ALL_FORMATS, BlobSource, Input } from "mediabunny";

import type { AudioMediaTrack, ReadyMediaAsset } from "@/editor-core/model";
import { decodeMediabunnyAudioTrackRange } from "../../media-work/adapters/mediabunny-audio-buffer";
import { withDisposableMediaWorkScope } from "../../media-work/scopes/disposable-media-work-scope";
import type {
	PreviewAudioResource,
	PreviewAudioResourceFailure,
} from "../types/preview-audio-resources.types";

export type PreviewAudioResourcesResult = {
	failures: PreviewAudioResourceFailure[];
	resources: PreviewAudioResource[];
};

export type PreviewAudioResourcesRequest = {
	asset: ReadyMediaAsset;
	signal: AbortSignal;
	source: Blob;
	trackIds?: ReadonlySet<string>;
};

export type InputAudioTrack = Awaited<
	ReturnType<Input["getAudioTracks"]>
>[number];

export type AudioPreviewTrackMetadata = {
	canDecode: boolean;
	endTimestampSeconds: number;
	firstTimestampSeconds: number;
	numberOfChannels: number;
	sampleRate: number;
};

type PreviewAudioTrackPreparation =
	| { kind: "failure"; value: PreviewAudioResourceFailure }
	| { kind: "resource"; value: PreviewAudioResource }
	| null;

export async function preparePreviewAudioResources({
	asset,
	signal,
	source,
	trackIds,
}: PreviewAudioResourcesRequest): Promise<PreviewAudioResourcesResult> {
	return withDisposableMediaWorkScope(async (scope) => {
		throwIfAborted(signal);

		if (asset.tracks.audio.length === 0) {
			return { failures: [], resources: [] };
		}

		const input = scope.registerDisposable(
			new Input({
				formats: ALL_FORMATS,
				source: new BlobSource(source),
			}),
		);
		const unregisterAbort = disposeInputOnAbort(input, signal);

		try {
			const inputTracks = await input.getAudioTracks();
			const preparations = await Promise.all(
				asset.tracks.audio.map(
					async (
						assetTrack,
						trackIndex,
					): Promise<PreviewAudioTrackPreparation> => {
						throwIfAborted(signal);

						if (trackIds && !trackIds.has(assetTrack.id)) {
							return null;
						}

						const inputTrack =
							inputTracks.find((track) => String(track.id) === assetTrack.id) ??
							inputTracks[trackIndex];

						if (!inputTrack) {
							return {
								kind: "failure",
								value: createPreviewAudioResourceFailure({
									assetTrack,
									reason: "The analyzed audio track is no longer available.",
									trackIndex,
								}),
							};
						}

						try {
							const metadata = await describeAudioPreviewTrack(inputTrack);
							const resource = await decodePreviewAudioTrackResource({
								assetTrack,
								metadata,
								signal,
								track: inputTrack,
								trackIndex,
							});

							return { kind: "resource", value: resource };
						} catch (error) {
							throwIfAborted(signal);

							return {
								kind: "failure",
								value: createPreviewAudioResourceFailure({
									assetTrack,
									reason: errorToMessage(error),
									trackIndex,
								}),
							};
						}
					},
				),
			);
			throwIfAborted(signal);

			const resources: PreviewAudioResource[] = [];
			const failures: PreviewAudioResourceFailure[] = [];

			for (const preparation of preparations) {
				if (preparation?.kind === "resource") {
					resources.push(preparation.value);
				} else if (preparation?.kind === "failure") {
					failures.push(preparation.value);
				}
			}

			return { failures, resources };
		} finally {
			unregisterAbort();
		}
	});
}

async function decodePreviewAudioTrackResource({
	assetTrack,
	metadata,
	signal,
	track,
	trackIndex,
}: {
	assetTrack: AudioMediaTrack;
	metadata: AudioPreviewTrackMetadata;
	signal: AbortSignal;
	track: InputAudioTrack;
	trackIndex: number;
}): Promise<PreviewAudioResource> {
	if (!metadata.canDecode) {
		throw new Error("Track is not decodable in this browser.");
	}

	const startPositionSeconds = Math.max(0, metadata.firstTimestampSeconds);
	if (metadata.endTimestampSeconds <= startPositionSeconds) {
		throw new Error(
			`Track has no presentable audio range after ${startPositionSeconds} seconds.`,
		);
	}

	const audioBuffer = await decodeMediabunnyAudioTrackRange({
		endSeconds: metadata.endTimestampSeconds,
		format: {
			numberOfChannels: metadata.numberOfChannels,
			sampleRate: metadata.sampleRate,
		},
		signal,
		startSeconds: startPositionSeconds,
		track,
	});

	return {
		audioBuffer,
		startPositionSeconds,
		track: assetTrack,
		trackId: assetTrack.id,
		trackIndex,
	};
}

async function describeAudioPreviewTrack(
	track: InputAudioTrack,
): Promise<AudioPreviewTrackMetadata> {
	const [
		canDecode,
		endTimestampSeconds,
		firstTimestampSeconds,
		numberOfChannels,
		sampleRate,
	] = await Promise.all([
		track.canDecode(),
		track.computeDuration(),
		track.getFirstTimestamp(),
		track.getNumberOfChannels(),
		track.getSampleRate(),
	]);

	return {
		canDecode,
		endTimestampSeconds,
		firstTimestampSeconds,
		numberOfChannels,
		sampleRate,
	};
}

function createPreviewAudioResourceFailure({
	assetTrack,
	reason,
	trackIndex,
}: {
	assetTrack: AudioMediaTrack;
	reason: string;
	trackIndex: number;
}): PreviewAudioResourceFailure {
	return {
		reason,
		track: assetTrack,
		trackId: assetTrack.id,
		trackIndex,
	};
}

function disposeInputOnAbort(
	input: { dispose: () => void },
	signal: AbortSignal,
) {
	const disposeInput = () => input.dispose();
	signal.addEventListener("abort", disposeInput, { once: true });

	if (signal.aborted) {
		disposeInput();
	}

	return () => signal.removeEventListener("abort", disposeInput);
}

function throwIfAborted(signal: AbortSignal) {
	if (signal.aborted) {
		throw new DOMException(
			"Audio preview preparation was cancelled.",
			"AbortError",
		);
	}
}

function errorToMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
