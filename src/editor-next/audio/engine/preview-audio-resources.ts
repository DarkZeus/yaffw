import type { ReadyMediaAsset } from "@/editor-core/model";
import type {
	PreviewAudioResource,
	PreviewAudioResourceFailure,
} from "../types/preview-audio-resources.types";
import {
	type MediaWindowProvider,
	createMediaWindowProvider,
} from "./media-window-provider";

export type PreviewAudioResourcesResult = {
	failures: PreviewAudioResourceFailure[];
	provider: MediaWindowProvider;
	resources: PreviewAudioResource[];
};

export type PreviewAudioResourcesRequest = {
	asset: ReadyMediaAsset;
	signal: AbortSignal;
	source: Blob;
};

export async function preparePreviewAudioResources({
	asset,
	signal,
	source,
}: PreviewAudioResourcesRequest): Promise<PreviewAudioResourcesResult> {
	const provider = await createMediaWindowProvider({
		durationSeconds: asset.durationUs / 1_000_000,
		signal,
		source,
		tracks: asset.tracks.audio,
	});
	try {
		if (signal.aborted)
			throw new DOMException(
				"Audio preview preparation was cancelled.",
				"AbortError",
			);
		const failures: PreviewAudioResourceFailure[] = [];
		const resources = asset.tracks.audio.map(
			(track, trackIndex): PreviewAudioResource => {
				const metadata = provider.getTrackMetadata(track.id);
				if (metadata.failureReason)
					failures.push({
						reason: metadata.failureReason,
						track,
						trackId: track.id,
						trackIndex,
					});
				return {
					numberOfChannels: metadata.numberOfChannels,
					sampleRate: metadata.sampleRate,
					track,
					trackId: track.id,
					trackIndex,
				};
			},
		);
		return { provider, failures, resources };
	} catch (error) {
		await provider.dispose();
		throw error;
	}
}
