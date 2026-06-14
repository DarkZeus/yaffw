import type { AudioMix, ReadyMediaAsset } from "@/editor-core/model";

import type {
	BrowserAudioPreviewSource,
	BrowserAudioPreviewSourceFailure,
} from "./browser-audio-preview-sources.types";

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
	audioMix: AudioMix;
	asset: ReadyMediaAsset;
	enabled: boolean;
	source: Blob;
};
