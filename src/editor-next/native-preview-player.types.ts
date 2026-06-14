import type {
	AudioMix,
	AudioTrackChannelMode,
	MediaTimeUs,
	ReadyMediaAsset,
	Selection,
} from "@/editor-core/model";
import type { ActiveMediaAssetCleanupScope } from "./active-media-asset-cleanup-scope";

export type NativePreviewPlayerProps = {
	activeMediaAssetCleanupScope?: ActiveMediaAssetCleanupScope;
	asset: ReadyMediaAsset;
	audioMix?: AudioMix;
	onAudioTrackChannelModeChange?: (
		trackId: string,
		channelMode: AudioTrackChannelMode,
	) => void;
	onAudioTrackIncludedChange?: (trackId: string, include: boolean) => void;
	onAudioTrackVolumePercentChange?: (
		trackId: string,
		volumePercent: number,
	) => void;
	onSelectionEndRequested: (playheadUs: MediaTimeUs) => void;
	onSelectionRangeMoveRequested: (deltaUs: MediaTimeUs) => void;
	onSelectionResetRequested: () => void;
	onSelectionStartRequested: (playheadUs: MediaTimeUs) => void;
	previewPosterSrc?: string;
	selection: Selection;
	selectionEditingDisabled?: boolean;
	shortcutsDisabled?: boolean;
	source: Blob;
};
