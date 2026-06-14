import type { AudioMix, ReadyMediaAsset } from "@/editor-core/model";

import type {
	BrowserAudioPreviewSource,
	BrowserAudioPreviewSourceFailure,
} from "./browser-audio-preview-sources.types";
import type { ActiveMediaAssetCleanupScope } from "./active-media-asset-cleanup-scope";

export type BrowserAudioPreviewSourcesState =
	| {
			status: "disabled";
	  }
	| {
			preparingTrackIds: ReadonlySet<string>;
			sources: BrowserAudioPreviewSource[];
			status: "loading";
	  }
	| {
			failures: BrowserAudioPreviewSourceFailure[];
			sources: BrowserAudioPreviewSource[];
			status: "ready";
	  }
	| {
			failures: BrowserAudioPreviewSourceFailure[];
			reason: string;
			status: "failed";
	  };

export type UseBrowserAudioPreviewSourcesOptions = {
	activeMediaAssetCleanupScope?: ActiveMediaAssetCleanupScope;
	audioMix: AudioMix;
	asset: ReadyMediaAsset;
	enabled: boolean;
	source: Blob;
};
