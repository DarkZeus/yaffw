import type {
	AudioMix,
	MediaTimeUs,
	ReadyMediaAsset,
	Selection,
} from "@/editor-core/model";
import type { ActiveMediaAssetCleanupScope } from "./active-media-asset-cleanup-scope";
import type { LivePreviewMeteringClock } from "./preview-metering-live";

export type NativePreviewPlayerProps = {
	activeMediaAssetCleanupScope?: ActiveMediaAssetCleanupScope;
	asset: ReadyMediaAsset;
	audioMix?: AudioMix;
	onAudioTrackIncludedChange?: (trackId: string, include: boolean) => void;
	onPreviewMeteringClockChange?: (
		clock: LivePreviewMeteringClock | null,
	) => void;
	onPreviewMeteringRetryChange?: (
		retryTrack: ((trackId: string) => void) | null,
	) => void;
	onPreviewPlayheadChange?: (playheadUs: MediaTimeUs) => void;
	onSelectionEndRequested: (playheadUs: MediaTimeUs) => void;
	onSelectionRangeMoveRequested: (deltaUs: MediaTimeUs) => void;
	onSelectionResetRequested: () => void;
	onSelectionReplaceRequested?: (selection: Selection) => void;
	onSelectionStartRequested: (playheadUs: MediaTimeUs) => void;
	previewPosterSrc?: string;
	selection: Selection;
	selectionEditingDisabled?: boolean;
	shortcutsDisabled?: boolean;
	onSoloedAudioTrackChange?: (trackId: string | null) => void;
	soloedAudioTrackId?: string | null;
	source: Blob;
};
