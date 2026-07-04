import type { MediaTimeUs, Selection } from "@/editor-core/model";
import type { WaveformSamples } from "./selection-waveform-lanes.types";

export type WaveformRegionUpdateSide = "end" | "range" | "start";

export type WaveformRegionSelectionChange = {
	initialSelection: Selection;
	selection: Selection;
	side: WaveformRegionUpdateSide;
};

export type WaveformSurfaceProps = {
	durationUs: MediaTimeUs;
	label: string;
	minimumSelectionDurationUs: MediaTimeUs;
	onPlayheadSeekRequested: (playheadUs: MediaTimeUs) => void;
	onSelectionCommitRequested: (change: WaveformRegionSelectionChange) => void;
	onSelectionPreviewRequested: (change: WaveformRegionSelectionChange) => void;
	samples: WaveformSamples;
	selection: Selection;
	selectionEditingDisabled: boolean;
	selectionEditInProgress: boolean;
};

export type WaveformRendererStatus = "fallback" | "loading" | "wavesurfer";
