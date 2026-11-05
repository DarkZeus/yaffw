import { describe, expect, it } from "vitest";

import {
	classifyExportRangeAccuracy,
	rangeAccuracyToleranceUs,
} from "./export-correctness";
import type { FrameTiming, Selection } from "./model";

describe("export range accuracy classification", () => {
	it("classifies full-asset export separately from selected-range precision", () => {
		const report = classifyExportRangeAccuracy({
			frameTiming: knownFrameTiming,
			selection: {
				endUs: 2_000_000,
				startUs: 0,
			},
			sourceDurationUs: 2_000_000,
		});

		expect(report.kind).toBe("full-asset");
		expect(report.label).toBe("Full asset");
		expect(report.precisionProven).toBe(false);
		expect(report.reason).toContain("full asset");
	});

	it("keeps duration-only generated-media evidence best effort", () => {
		const report = classifyExportRangeAccuracy({
			boundaryEvidence: {
				generatedDurationUs: 1_020_000,
				kind: "duration-only",
			},
			frameTiming: knownFrameTiming,
			selection: selectedRange,
			sourceDurationUs: 2_000_000,
		});

		expect(report.kind).toBe("best-effort");
		expect(report.generatedDurationUs).toBe(1_020_000);
		expect(report.durationDeltaUs).toBe(20_000);
		expect(report.reason).toContain("boundary evidence is unavailable");
	});

	it.each([
		{
			expectedReason: "boundary evidence is unavailable",
			expectedToleranceUs: 40_000,
			frameTiming: knownFrameTiming,
			generatedDurationUs: 1_200_000,
			label: "known frame timing with a frame-aligned selection",
			selection: {
				endUs: 1_600_000,
				startUs: 400_000,
			},
		},
		{
			expectedReason: "boundary evidence is unavailable",
			expectedToleranceUs: 40_000,
			frameTiming: knownFrameTiming,
			generatedDurationUs: 1_020_000,
			label: "known frame timing with an unaligned selection",
			selection: selectedRange,
		},
		{
			expectedReason: "Frame timing analysis is unavailable",
			expectedToleranceUs: 33_333,
			frameTiming: estimatedFrameTiming,
			generatedDurationUs: 1_000_000,
			label: "estimated frame timing",
			selection: selectedRange,
		},
	])(
		"keeps duration-only generated-media evidence best effort for $label",
		({
			expectedReason,
			expectedToleranceUs,
			frameTiming,
			generatedDurationUs,
			selection,
		}) => {
			const report = classifyExportRangeAccuracy({
				generatedMedia: {
					durationUs: generatedDurationUs,
				},
				frameTiming,
				selection,
				sourceDurationUs: 2_000_000,
			});

			expect(report.kind).toBe("best-effort");
			expect(report.generatedDurationUs).toBe(generatedDurationUs);
			expect(report.requestedDurationUs).toBe(
				selection.endUs - selection.startUs,
			);
			expect(report.durationDeltaUs).toBe(
				generatedDurationUs - (selection.endUs - selection.startUs),
			);
			expect(report.toleranceUs).toBe(expectedToleranceUs);
			expect(report.reason).toContain(expectedReason);
		},
	);

	it("proves precision only when measured boundaries are inside frame tolerance", () => {
		const precise = classifyExportRangeAccuracy({
			boundaryEvidence: {
				endDeltaUs: -11_000,
				kind: "start-and-end",
				startDeltaUs: 12_000,
			},
			frameTiming: knownFrameTiming,
			selection: selectedRange,
			sourceDurationUs: 2_000_000,
		});

		expect(precise.kind).toBe("proven-precise");
		expect(precise.label).toBe("Proven precise");
		expect(precise.precisionProven).toBe(true);
		expect(precise.toleranceUs).toBe(40_000);

		const imprecise = classifyExportRangeAccuracy({
			boundaryEvidence: {
				endDeltaUs: 3_000,
				kind: "start-and-end",
				startDeltaUs: 41_000,
			},
			frameTiming: knownFrameTiming,
			selection: selectedRange,
			sourceDurationUs: 2_000_000,
		});

		expect(imprecise.kind).toBe("best-effort");
		expect(imprecise.reason).toContain("outside the current frame tolerance");
	});

	it.each([false, true])(
		"retains approximate measured tolerance without implying boundary proof (duration evidence %s)",
		(hasDuration) => {
			const report = classifyExportRangeAccuracy({
				frameTiming: measuredEstimatedFrameTiming,
				generatedMedia: hasDuration ? { durationUs: 1_000_000 } : undefined,
				selection: selectedRange,
				sourceDurationUs: 2_000_000,
			});

			expect(report.toleranceUs).toBe(42_553);
			expect(report.precisionProven).toBe(false);
			expect(report.reason).toContain("no confident underlying frame rate");
			expect(report.reason).toContain("approximate rate");
		},
	);

	it.each([false, true])(
		"does not infer boundary proof from a confident dropped-frame sample (duration evidence %s)",
		(hasDuration) => {
			const report = classifyExportRangeAccuracy({
				frameTiming: {
					...knownFrameTiming,
					analysis: {
						...knownFrameTiming.analysis,
						frameRateIsConstant: false,
						minFrameRate: 12.5,
					},
				},
				generatedMedia: hasDuration ? { durationUs: 1_000_000 } : undefined,
				selection: selectedRange,
				sourceDurationUs: 2_000_000,
			});

			expect(report.precisionProven).toBe(false);
			expect(report.reason).toContain("variable frame spacing");
			expect(report.reason).toContain("precision has not been proven");
		},
	);

	it("uses a measured estimated rate when evaluating real boundary evidence", () => {
		const report = classifyExportRangeAccuracy({
			boundaryEvidence: {
				kind: "start-and-end",
				startDeltaUs: 40_000,
				endDeltaUs: -40_000,
			},
			frameTiming: measuredEstimatedFrameTiming,
			selection: selectedRange,
			sourceDurationUs: 2_000_000,
		});
		expect(report.toleranceUs).toBe(42_553);
		expect(report.precisionProven).toBe(true);
	});

	it("uses estimated frame timing as the conservative fallback tolerance", () => {
		expect(rangeAccuracyToleranceUs(estimatedFrameTiming)).toBe(33_333);
	});
});

const knownFrameTiming = {
	analysis: {
		averageFrameRate: 25,
		frameRateIsConstant: true,
		maxFrameRate: 25,
		medianFrameRate: 25,
		minFrameRate: 25,
		probedPacketCount: 256,
		underlyingFrameRate: 25,
	},
	fps: 25,
	frameDurationUs: 40_000,
	source: "known",
} satisfies FrameTiming;

const estimatedFrameTiming = {
	analysis: null,
	fps: 30,
	frameDurationUs: 33_333,
	reason: "Exact frame timing was unavailable.",
	source: "estimated",
} satisfies FrameTiming;

const selectedRange = {
	endUs: 1_500_000,
	startUs: 500_000,
} satisfies Selection;

const measuredEstimatedFrameTiming = {
	analysis: {
		averageFrameRate: 22,
		frameRateIsConstant: false,
		maxFrameRate: 40,
		medianFrameRate: 23.5,
		minFrameRate: 12,
		probedPacketCount: 256,
		underlyingFrameRate: null,
	},
	fps: 23.5,
	frameDurationUs: 42_553,
	reason: "No consistent underlying frame rate was detected.",
	source: "estimated",
} satisfies FrameTiming;
