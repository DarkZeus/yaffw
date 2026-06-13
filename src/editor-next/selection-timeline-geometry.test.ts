import { describe, expect, it } from "vitest";

import {
	MAXIMUM_TIMELINE_ZOOM,
	MINIMUM_TIMELINE_ZOOM,
	centeredTimelineScrollLeft,
	clampTimelineZoom,
	clientXToMediaDelta,
	clientXToMediaTime,
	createSelectionTimelineMarkers,
	mediaTimeToPercent,
} from "./selection-timeline-geometry";

describe("selection timeline geometry", () => {
	it("creates media-time markers for the visible zoom scale", () => {
		expect(createSelectionTimelineMarkers(12_000_000, 1)).toEqual([
			{
				percent: 0,
				placement: "start",
				timeUs: 0,
			},
			{
				percent: 25,
				placement: "middle",
				timeUs: 3_000_000,
			},
			{
				percent: 50,
				placement: "middle",
				timeUs: 6_000_000,
			},
			{
				percent: 75,
				placement: "middle",
				timeUs: 9_000_000,
			},
			{
				percent: 100,
				placement: "end",
				timeUs: 12_000_000,
			},
		]);

		expect(createSelectionTimelineMarkers(12_000_000, 4)).toHaveLength(14);
		expect(createSelectionTimelineMarkers(12_000_000, 99)).toHaveLength(17);
	});

	it("maps client positions to media time with edge clamping", () => {
		const trackGeometry = {
			leftPx: 100,
			widthPx: 400,
		};

		expect(
			clientXToMediaTime({
				clientX: 300,
				durationUs: 8_000_000,
				trackGeometry,
			}),
		).toBe(4_000_000);
		expect(
			clientXToMediaTime({
				clientX: 50,
				durationUs: 8_000_000,
				trackGeometry,
			}),
		).toBe(0);
		expect(
			clientXToMediaTime({
				clientX: 600,
				durationUs: 8_000_000,
				trackGeometry,
			}),
		).toBe(8_000_000);
		expect(
			clientXToMediaTime({
				clientX: Number.NaN,
				durationUs: 8_000_000,
				trackGeometry,
			}),
		).toBe(0);
	});

	it("maps client deltas to media-time deltas without clamping direction", () => {
		const trackGeometry = {
			leftPx: 100,
			widthPx: 500,
		};

		expect(
			clientXToMediaDelta({
				clientX: 350,
				durationUs: 10_000_000,
				startClientX: 100,
				trackGeometry,
			}),
		).toBe(5_000_000);
		expect(
			clientXToMediaDelta({
				clientX: 50,
				durationUs: 10_000_000,
				startClientX: 100,
				trackGeometry,
			}),
		).toBe(-1_000_000);
		expect(
			clientXToMediaDelta({
				clientX: 50,
				durationUs: 10_000_000,
				startClientX: Number.NaN,
				trackGeometry,
			}),
		).toBe(0);
	});

	it("maps media time to percentages", () => {
		expect(mediaTimeToPercent(3_000_000, 12_000_000)).toBe(25);
		expect(mediaTimeToPercent(-1_000_000, 12_000_000)).toBe(0);
		expect(mediaTimeToPercent(13_000_000, 12_000_000)).toBe(100);
		expect(mediaTimeToPercent(1_000_000, 0)).toBe(0);
	});

	it("clamps timeline zoom to the supported inspection range", () => {
		expect(clampTimelineZoom(-1)).toBe(MINIMUM_TIMELINE_ZOOM);
		expect(clampTimelineZoom(2.5)).toBe(2.5);
		expect(clampTimelineZoom(99)).toBe(MAXIMUM_TIMELINE_ZOOM);
	});

	it("centers the playhead in the scroll container when a scroll move is needed", () => {
		expect(
			centeredTimelineScrollLeft({
				currentScrollLeft: 0,
				maxScrollLeft: 600,
				playheadPercent: 50,
				trackWidthPx: 1200,
				viewportWidthPx: 600,
			}),
		).toBe(300);
		expect(
			centeredTimelineScrollLeft({
				currentScrollLeft: 300,
				maxScrollLeft: 600,
				playheadPercent: 50,
				trackWidthPx: 1200,
				viewportWidthPx: 600,
			}),
		).toBeNull();
		expect(
			centeredTimelineScrollLeft({
				currentScrollLeft: 0,
				maxScrollLeft: 0,
				playheadPercent: 50,
				trackWidthPx: 1200,
				viewportWidthPx: 600,
			}),
		).toBeNull();
	});
});
