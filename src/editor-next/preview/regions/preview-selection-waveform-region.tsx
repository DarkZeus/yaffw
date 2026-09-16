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
	onPlayheadPreviewRequested: (playheadUs: MediaTimeUs) => void;
	onPlayheadSeekRequested: (playheadUs: MediaTimeUs) => void;
	onSelectionEndCommitRequested: (playheadUs: MediaTimeUs) => void;
	onSelectionRangeMoveRequested: (deltaUs: MediaTimeUs) => void;
	onSelectionResetRequested: () => void;
	onSelectionStartCommitRequested: (playheadUs: MediaTimeUs) => void;
	playheadUs: MediaTimeUs;
	playheadUpdatesAreLive: boolean;
	readLivePlayheadUs: () => MediaTimeUs;
	selection: Selection;
	selectionEditingDisabled: boolean;
	source: Blob;
};

export function PreviewSelectionWaveformRegion({
	asset,
	audioMix,
	audioPreviewPreparingTrackIds,
	onAudioTrackIncludedChange,
	onPlayheadPreviewRequested,
	onPlayheadSeekRequested,
	onSelectionEndCommitRequested,
	onSelectionRangeMoveRequested,
	onSelectionResetRequested,
	onSelectionStartCommitRequested,
	playheadUs,
	playheadUpdatesAreLive,
	readLivePlayheadUs,
	selection,
	selectionEditingDisabled,
	source,
}: PreviewSelectionWaveformRegionProps) {
	return (
		<section
			aria-label="Workbench selection region"
			className="h-full min-h-0 overflow-auto"
		>
			<SelectionTimeline
				audioMix={audioMix}
				audioPreviewPreparingTrackIds={audioPreviewPreparingTrackIds}
				asset={asset}
				onAudioTrackIncludedChange={onAudioTrackIncludedChange}
				onPlayheadPreviewRequested={onPlayheadPreviewRequested}
				onPlayheadSeekRequested={onPlayheadSeekRequested}
				onSelectionEndCommitRequested={onSelectionEndCommitRequested}
				onSelectionRangeMoveRequested={onSelectionRangeMoveRequested}
				onSelectionResetRequested={onSelectionResetRequested}
				onSelectionStartCommitRequested={onSelectionStartCommitRequested}
				playheadUs={playheadUs}
				playheadUpdatesAreLive={playheadUpdatesAreLive}
				readLivePlayheadUs={readLivePlayheadUs}
				selection={selection}
				selectionEditingDisabled={selectionEditingDisabled}
				source={source}
			/>
		</section>
	);
}
