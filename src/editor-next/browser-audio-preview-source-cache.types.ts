import type {
	AudioMix,
	AudioTrackChannelMode,
	ReadyMediaAsset,
} from "@/editor-core/model";

import type { createBrowserAudioPreviewSourceCache } from "./browser-audio-preview-source-cache";
import type { revokeBrowserAudioPreviewSources } from "./browser-audio-preview-sources";
import type { BrowserAudioPreviewSource } from "./browser-audio-preview-sources.types";

export type BrowserAudioPreviewSourceRequest = {
	cacheKey: string;
	trackId: string;
};

export type BrowserAudioPreviewSourcePlan = {
	audioMix: AudioMix;
	cachedSources: BrowserAudioPreviewSource[];
	missingTrackIds: ReadonlySet<string>;
	sourceRequests: BrowserAudioPreviewSourceRequest[];
};

export type BrowserAudioPreviewSourcePlanKey = string;

export type BrowserAudioPreviewSourcePlanData = {
	finalPeakGuardDb: number;
	tracks: Array<[string, AudioTrackChannelMode]>;
};

export type BrowserAudioPreviewSourceCacheOwner = {
	assetId: string;
	source: Blob;
};

export type BrowserAudioPreviewSourceCacheOptions = {
	revokeSources?: typeof revokeBrowserAudioPreviewSources;
};

export type BrowserAudioPreviewSourceCache = ReturnType<
	typeof createBrowserAudioPreviewSourceCache
>;

export type BrowserAudioPreviewSourcePlanInput = {
	asset: ReadyMediaAsset;
	planKey: BrowserAudioPreviewSourcePlanKey;
};
