import type { AudioMix, ReadyMediaAsset } from "@/editor-core/model";

import type { createPreviewAudioResourceCache } from "../engine/preview-audio-resource-cache";
import type { revokePreviewAudioResources } from "../engine/preview-audio-resources";
import type { PreviewAudioResource } from "./preview-audio-resources.types";

export type PreviewAudioResourceRequest = {
	cacheKey: string;
	trackId: string;
};

export type PreviewAudioResourcePlan = {
	audioMix: AudioMix;
	cachedResources: PreviewAudioResource[];
	missingTrackIds: ReadonlySet<string>;
	resourceRequests: PreviewAudioResourceRequest[];
};

export type PreviewAudioResourcePlanKey = string;

export type PreviewAudioResourcePlanData = {
	tracks: string[];
};

export type PreviewAudioResourceCacheOwner = {
	assetId: string;
	source: Blob;
};

export type PreviewAudioResourceCacheOptions = {
	revokeResources?: typeof revokePreviewAudioResources;
};

export type PreviewAudioResourceCache = ReturnType<
	typeof createPreviewAudioResourceCache
>;

export type PreviewAudioResourcePlanInput = {
	asset: ReadyMediaAsset;
	planKey: PreviewAudioResourcePlanKey;
};
