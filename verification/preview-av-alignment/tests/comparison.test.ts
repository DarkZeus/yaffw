import { describe, expect, it } from "vitest";
import { summarize } from "../analysis";
import { type ComparisonTrial, summarizeComparison } from "../comparison";

function trials(): ComparisonTrial[] {
	return [0.5, 1, 2].flatMap((rate) =>
		Array.from({ length: 5 }, (_, index) =>
			(["baseline", "candidate"] as const).map((variant) => ({
				repetition: index + 1,
				variant,
				rate,
				acceptedEvents: 9,
				coverageGatePassed: true,
				observationBudgetMs: 40,
				pathOffsetMs: summarize([variant === "baseline" ? -50 : 10]),
			})),
		).flat(),
	);
}

describe("paired browser comparison", () => {
	it("pairs by rate and repetition and retains sign, absolute error and dispersion", () => {
		const report = summarizeComparison(trials().reverse());
		for (const rate of report) {
			expect(rate.coverageGatePassed).toBe(true);
			expect(rate.baselineSignedMs?.median).toBe(-50);
			expect(rate.baselineAbsoluteMs?.median).toBe(50);
			expect(rate.candidateAbsoluteMs?.median).toBe(10);
			expect(rate.pairedAbsoluteImprovementMs?.median).toBe(40);
			expect(rate.pairs[0].combinedBrowserBudgetMs).toBe(80);
			expect(rate.candidateEnablement).toBe(false);
			expect(rate.physicalUncertaintyMs).toBeNull();
		}
	});
	it("retains unfavorable observations without turning browser improvement into physical pass", () => {
		const data = trials();
		data[1].pathOffsetMs = summarize([-80]);
		const report = summarizeComparison(data)[0];
		expect(report.pairs[0].absoluteImprovementMs).toBe(-30);
		expect(report.pairedAbsoluteImprovementMs?.min).toBe(-30);
		expect(report.physicalGate).toMatch(/inconclusive/);
	});
	it("requires five qualified pairs, not five unrelated trials of each variant", () => {
		const data = trials();
		data[1].repetition = 6;
		expect(summarizeComparison(data)[0].qualifiedPairs).toBe(4);
		expect(summarizeComparison(data)[0].coverageGatePassed).toBe(false);
		expect(
			summarizeComparison([]).every((rate) => rate.coverageGatePassed),
		).toBe(false);
	});
	it("retains but disqualifies failures, weak coverage, duplicate members and invalid medians", () => {
		for (const mutate of [
			(data: ComparisonTrial[]) => {
				data[0].failure = "missing click";
			},
			(data: ComparisonTrial[]) => {
				data[0].acceptedEvents = 6;
			},
			(data: ComparisonTrial[]) => {
				data.push(data[0]);
			},
			(data: ComparisonTrial[]) => {
				data[0].pathOffsetMs = { ...summarize([0]), median: Number.NaN };
			},
		]) {
			const data = trials();
			mutate(data);
			const report = summarizeComparison(data)[0];
			expect(report.totalPairs).toBe(5);
			expect(report.qualifiedPairs).toBe(4);
			expect(report.pairs[0].absoluteImprovementMs).toBeNull();
		}
	});
});
