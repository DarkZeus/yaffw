import type { ReadyMediaAsset } from "@/editor-core/model";

import type { ActiveMediaAssetCleanupScope } from "../../media-work/scopes/active-media-asset-cleanup-scope";
import type {
	PreviewAudioResource,
	PreviewAudioResourceFailure,
} from "./preview-audio-resources.types";

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

export type PreviewAudioResourcesLifecycle = PreviewAudioResourcesState & {
	retryTrack: (trackId: string) => void;
};

export type UsePreviewAudioResourcesOptions = {
	activeMediaAssetCleanupScope?: ActiveMediaAssetCleanupScope;
	asset: ReadyMediaAsset;
	enabled: boolean;
	source: Blob;
};
