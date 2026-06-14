import type {
	AudioMix,
	AudioTrackChannelMode,
	MediaTimeUs,
	ReadyMediaAsset,
	Selection,
} from "@/editor-core/model";

import { SelectionTimeline } from "./selection-timeline";

type PreviewSelectionWaveformRegionProps = {
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

export function PreviewSelectionWaveformRegion({
	asset,
	audioMix,
	audioPreviewPreparingTrackIds,
	onAudioTrackChannelModeChange,
	onAudioTrackIncludedChange,
	onAudioTrackVolumePercentChange,
	onPlayheadSeekRequested,
	onSelectionEndCommitRequested,
	onSelectionRangeMoveRequested,
	onSelectionResetRequested,
	onSelectionStartCommitRequested,
	onSoloedAudioTrackChange,
	playheadUs,
	playheadUpdatesAreLive,
	selection,
	selectionEditingDisabled,
	soloedAudioTrackId,
	source,
}: PreviewSelectionWaveformRegionProps) {
	return (
		<section
			aria-label="Workbench selection region"
			className="min-h-[22rem] overflow-x-hidden overscroll-contain xl:col-span-3 xl:row-start-3 xl:min-h-0 xl:overflow-y-auto xl:border-t xl:border-workbench-border-strong xl:bg-workbench-timeline"
		>
			<SelectionTimeline
				audioMix={audioMix}
				audioPreviewPreparingTrackIds={audioPreviewPreparingTrackIds}
				asset={asset}
				onAudioTrackChannelModeChange={onAudioTrackChannelModeChange}
				onAudioTrackIncludedChange={onAudioTrackIncludedChange}
				onAudioTrackVolumePercentChange={onAudioTrackVolumePercentChange}
				onPlayheadSeekRequested={onPlayheadSeekRequested}
				onSoloedAudioTrackChange={onSoloedAudioTrackChange}
				onSelectionEndCommitRequested={onSelectionEndCommitRequested}
				onSelectionRangeMoveRequested={onSelectionRangeMoveRequested}
				onSelectionResetRequested={onSelectionResetRequested}
				onSelectionStartCommitRequested={onSelectionStartCommitRequested}
				playheadUs={playheadUs}
				playheadUpdatesAreLive={playheadUpdatesAreLive}
				selection={selection}
				selectionEditingDisabled={selectionEditingDisabled}
				soloedAudioTrackId={soloedAudioTrackId}
				source={source}
			/>
		</section>
	);
}
