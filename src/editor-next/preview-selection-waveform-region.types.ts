import type {
	AudioMix,
	AudioTrackChannelMode,
	MediaTimeUs,
	ReadyMediaAsset,
	Selection,
} from "@/editor-core/model";

export type PreviewSelectionWaveformRegionProps = {
	asset: ReadyMediaAsset;
	audioMix: AudioMix;
	audioPreviewPreparingTrackIds: ReadonlySet<string>;
	onAudioTrackChannelModeChange?: (
		trackId: string,
		channelMode: AudioTrackChannelMode,
	) => void;
	onAudioTrackIncludedChange?: (trackId: string, include: boolean) => void;
	onAudioTrackVolumePercentChange?: (
		trackId: string,
		volumePercent: number,
	) => void;
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
