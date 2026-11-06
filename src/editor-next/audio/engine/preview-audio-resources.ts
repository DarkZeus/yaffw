import type { ReadyMediaAsset } from "@/editor-core/model";
import type { PreviewAudioResource } from "../types/preview-audio-resources.types";
import {
	type MediaWindowProvider,
	createMediaWindowProvider,
} from "./media-window-provider";

export type PreviewAudioResourcesResult = {
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
		const resources = asset.tracks.audio.map((track): PreviewAudioResource => {
			const metadata = provider.getTrackMetadata(track.id);
			return {
				numberOfChannels: metadata.numberOfChannels,
				trackId: track.id,
			};
		});
		return { provider, resources };
	} catch (error) {
		await provider.dispose();
		throw error;
	}
}
