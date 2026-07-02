import type { ReadyMediaAsset } from "@/editor-core/model";
import type { ActiveMediaAssetCleanupScope } from "./active-media-asset-cleanup-scope";
import type { preparePreviewMeteringData } from "./preview-metering-preparation";
import type { PreviewMeteringTrackStates } from "./preview-metering-preparation.types";

export type PreviewMeteringPreparation = {
	retryTrack: (trackId: string) => void;
	trackStates: PreviewMeteringTrackStates;
};

export type UsePreviewMeteringPreparationOptions = {
	activeMediaAssetCleanupScope?: ActiveMediaAssetCleanupScope;
	asset: ReadyMediaAsset | null;
	enabled: boolean;
	prepare?: typeof preparePreviewMeteringData;
	source: Blob | null;
};
