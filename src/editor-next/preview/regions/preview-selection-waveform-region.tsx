import type {
	AudioMix,
	MediaTimeUs,
	ReadyMediaAsset,
	Selection,
} from "@/editor-core/model";
import { SelectionTimeline } from "../../selection/timeline/selection-timeline";

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
	readLivePlayheadUs: () => MediaTimeUs;
	selection: Selection;
	selectionEditingDisabled: boolean;
	soloedAudioTrackId: string | null;
	source: Blob;
};

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
