import type { Selection } from "@/editor-core/model";

export type WaveformRegionUpdateSide = "end" | "range" | "start";

export type WaveformRegionSelectionChange = {
	initialSelection: Selection;
	selection: Selection;
	side: WaveformRegionUpdateSide;
};
