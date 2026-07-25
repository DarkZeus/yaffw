import type {
	AudioMix,
	MediaTimeUs,
	ReadyMediaAsset,
	Selection,
} from "@/editor-core/model";
import type { ActiveMediaAssetCleanupScope } from "../../media-work/scopes/active-media-asset-cleanup-scope";

export type NativePreviewPlayerProps = {
	activeMediaAssetCleanupScope?: ActiveMediaAssetCleanupScope;
	asset: ReadyMediaAsset;
	audioMix?: AudioMix;
	onAudioTrackIncludedChange?: (trackId: string, include: boolean) => void;
	onPreviewPlayheadChange?: (playheadUs: MediaTimeUs) => void;
	onSelectionEndRequested: (playheadUs: MediaTimeUs) => void;
	onSelectionRangeMoveRequested: (deltaUs: MediaTimeUs) => void;
	onSelectionResetRequested: () => void;
	onSelectionReplaceRequested?: (selection: Selection) => void;
	onSelectionStartRequested: (playheadUs: MediaTimeUs) => void;
	selection: Selection;
	selectionEditingDisabled?: boolean;
	shortcutsDisabled?: boolean;
	onSoloedAudioTrackChange?: (trackId: string | null) => void;
	soloedAudioTrackId?: string | null;
	source: Blob;
};
