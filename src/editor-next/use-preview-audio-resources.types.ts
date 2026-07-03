import type { AudioMix, ReadyMediaAsset } from "@/editor-core/model";

import type {
	PreviewAudioResource,
	PreviewAudioResourceFailure,
} from "./preview-audio-resources.types";
import type { ActiveMediaAssetCleanupScope } from "./active-media-asset-cleanup-scope";

export type PreviewAudioResourcesState =
	| {
			status: "disabled";
	  }
	| {
			preparingTrackIds: ReadonlySet<string>;
			resources: PreviewAudioResource[];
			status: "loading";
	  }
	| {
			failures: PreviewAudioResourceFailure[];
			resources: PreviewAudioResource[];
			status: "ready";
	  }
	| {
			failures: PreviewAudioResourceFailure[];
			reason: string;
			status: "failed";
	  };

export type PreviewAudioResourcesLifecycle =
	PreviewAudioResourcesState & {
		retryTrack: (trackId: string) => void;
	};

export type UsePreviewAudioResourcesOptions = {
	activeMediaAssetCleanupScope?: ActiveMediaAssetCleanupScope;
	audioMix: AudioMix;
	asset: ReadyMediaAsset;
	enabled: boolean;
	source: Blob;
};
