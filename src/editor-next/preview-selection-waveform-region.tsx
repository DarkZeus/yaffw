import type { PreviewSelectionWaveformRegionProps } from "./preview-selection-waveform-region.types";
import { SelectionTimeline } from "./selection-timeline";

export function PreviewSelectionWaveformRegion({
	asset,
	audioMix,
	audioPreviewPreparingTrackIds,
	onAudioTrackIncludedChange,
	onPlayheadSeekRequested,
	onSelectionEndCommitRequested,
	onSelectionRangeMoveRequested,
	onSelectionResetRequested,
	onSelectionStartCommitRequested,
	onSoloedAudioTrackChange,
	playheadUs,
	playheadUpdatesAreLive,
	readLivePlayheadUs,
	selection,
	selectionEditingDisabled,
	soloedAudioTrackId,
	source,
}: PreviewSelectionWaveformRegionProps) {
	return (
		<section
			aria-label="Workbench selection region"
			className="min-h-[22rem] overflow-x-hidden overscroll-contain xl:min-h-0 xl:overflow-y-auto xl:border-t xl:border-workbench-border-strong xl:bg-workbench-timeline"
		>
			<SelectionTimeline
				audioMix={audioMix}
				audioPreviewPreparingTrackIds={audioPreviewPreparingTrackIds}
				asset={asset}
				onAudioTrackIncludedChange={onAudioTrackIncludedChange}
				onPlayheadSeekRequested={onPlayheadSeekRequested}
				onSoloedAudioTrackChange={onSoloedAudioTrackChange}
				onSelectionEndCommitRequested={onSelectionEndCommitRequested}
				onSelectionRangeMoveRequested={onSelectionRangeMoveRequested}
				onSelectionResetRequested={onSelectionResetRequested}
				onSelectionStartCommitRequested={onSelectionStartCommitRequested}
				playheadUs={playheadUs}
				playheadUpdatesAreLive={playheadUpdatesAreLive}
				readLivePlayheadUs={readLivePlayheadUs}
				selection={selection}
				selectionEditingDisabled={selectionEditingDisabled}
				soloedAudioTrackId={soloedAudioTrackId}
				source={source}
			/>
		</section>
	);
}
