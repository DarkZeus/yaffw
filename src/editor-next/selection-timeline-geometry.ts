import type { MediaTimeUs } from "@/editor-core/model";

import type {
	SelectionTimelineMarker,
	TimelineTrackGeometry,
} from "./selection-timeline-geometry.types";

export const MINIMUM_TIMELINE_ZOOM = 1;
export const MAXIMUM_TIMELINE_ZOOM = 4;

export function createSelectionTimelineMarkers(
	durationUs: MediaTimeUs,
	zoom: number,
): SelectionTimelineMarker[] {
	const markerCount = Math.max(5, Math.min(17, Math.round(2 + zoom * 3)));

	return Array.from({ length: markerCount }, (_, index) => {
		const percent = markerCount === 1 ? 0 : (index / (markerCount - 1)) * 100;

		return {
			placement:
				index === 0 ? "start" : index === markerCount - 1 ? "end" : "middle",
			percent,
			timeUs: Math.round((durationUs * percent) / 100),
		};
	});
}

export function clientXToMediaTime({
	clientX,
	durationUs,
	trackGeometry,
}: {
	clientX: number;
	durationUs: MediaTimeUs;
	trackGeometry: TimelineTrackGeometry | null;
}) {
	if (
		!Number.isFinite(clientX) ||
		!trackGeometry ||
		trackGeometry.widthPx <= 0
	) {
		return 0;
	}

	return Math.round(
		clampNumber(
			(clientX - trackGeometry.leftPx) / trackGeometry.widthPx,
			0,
			1,
		) * durationUs,
	);
}

export function clientXToMediaDelta({
	clientX,
	durationUs,
	startClientX,
	trackGeometry,
}: {
	clientX: number;
	durationUs: MediaTimeUs;
	startClientX: number;
	trackGeometry: TimelineTrackGeometry | null;
}) {
	if (
		!Number.isFinite(clientX) ||
		!Number.isFinite(startClientX) ||
		!trackGeometry ||
		trackGeometry.widthPx <= 0
	) {
		return 0;
	}

	return Math.round(
		((clientX - startClientX) / trackGeometry.widthPx) * durationUs,
	);
}

export function mediaTimeToPercent(
	timeUs: MediaTimeUs,
	durationUs: MediaTimeUs,
) {
	if (durationUs <= 0) {
		return 0;
	}

	return clampNumber((timeUs / durationUs) * 100, 0, 100);
}

export function clampTimelineZoom(zoom: number) {
	return clampNumber(zoom, MINIMUM_TIMELINE_ZOOM, MAXIMUM_TIMELINE_ZOOM);
}

export function centeredTimelineScrollLeft({
	currentScrollLeft,
	maxScrollLeft,
	playheadPercent,
	tolerancePx = 0.5,
	trackWidthPx,
	viewportWidthPx,
}: {
	currentScrollLeft: number;
	maxScrollLeft: number;
	playheadPercent: number;
	tolerancePx?: number;
	trackWidthPx: number;
	viewportWidthPx: number;
}): number | null {
	if (maxScrollLeft <= 0 || trackWidthPx <= 0 || viewportWidthPx <= 0) {
		return null;
	}

	const playheadCenterX =
		(clampNumber(playheadPercent, 0, 100) / 100) * trackWidthPx;
	const nextScrollLeft = clampNumber(
		playheadCenterX - viewportWidthPx / 2,
		0,
		maxScrollLeft,
	);

	if (Math.abs(currentScrollLeft - nextScrollLeft) < tolerancePx) {
		return null;
	}

	return nextScrollLeft;
}

function clampNumber(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}
