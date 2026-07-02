import type {
	AudioMix,
	MediaTimeUs,
	ReadyMediaAsset,
	Selection,
} from "@/editor-core/model";

export type PreviewSelectionWaveformRegionProps = {
	asset: ReadyMediaAsset;
	audioMix: AudioMix;
	audioPreviewPreparingTrackIds: ReadonlySet<string>;
	onAudioTrackIncludedChange?: (trackId: string, include: boolean) => void;
	onPlayheadSeekRequested: (playheadUs: MediaTimeUs) => void;
	onSelectionEndCommitRequested: (playheadUs: MediaTimeUs) => void;
	onSelectionRangeMoveRequested: (deltaUs: MediaTimeUs) => void;
	onSelectionResetRequested: () => void;
	onSelectionStartCommitRequested: (playheadUs: MediaTimeUs) => void;
	onSoloedAudioTrackChange: (trackId: string | null) => void;
	playheadUs: MediaTimeUs;
	playheadUpdatesAreLive: boolean;
	selection: Selection;
	selectionEditingDisabled: boolean;
	soloedAudioTrackId: string | null;
	source: Blob;
};
