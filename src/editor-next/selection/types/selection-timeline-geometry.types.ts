import type { MediaTimeUs } from "@/editor-core/model";

export type TimelineTrackGeometry = {
	leftPx: number;
	widthPx: number;
};

export type SelectionTimelineMarkerPlacement = "end" | "middle" | "start";

export type SelectionTimelineMarker = {
	percent: number;
	placement: SelectionTimelineMarkerPlacement;
	timeUs: MediaTimeUs;
};
