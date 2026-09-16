import { describe, expect, it } from "vitest";
import {
	detectBursts,
	estimateOutputTime,
	isFirstFlashFrame,
	mergeBursts,
	scheduledBursts,
	signedOffset,
	summarize,
} from "../analysis";

describe("Preview alignment evidence", () => {
	it("rejects skipped onset frames rather than reporting late frames as the flash onset", () => {
		expect(isFirstFlashFrame(2, 2)).toBe(true);
		expect(isFirstFlashFrame(2.02, 2)).toBe(false);
	});
	it("clips PCM by offset/duration and excludes clicks canceled before they can play", () => {
		const source = {
			bursts: [{ start: 0.02, end: 0.12 }],
			when: 3,
			calledAt: 2.9,
			offset: 0,
			duration: 0.2,
			rate: 2,
			stoppedAt: 3.005,
			sampleRate: 48000,
		};
		expect(scheduledBursts(source)).toEqual([]);
		expect(scheduledBursts({ ...source, stoppedAt: 3.01 })).toEqual([]);
		expect(
			scheduledBursts({ ...source, stoppedAt: null, duration: 0 }),
		).toEqual([]);
		expect(
			scheduledBursts({ ...source, stoppedAt: null, duration: 0.02 }),
		).toEqual([]);
		expect(
			scheduledBursts({
				...source,
				stoppedAt: null,
				offset: 0.04,
				duration: 0.02,
			}),
		).toEqual([{ start: 3, end: 3.01 }]);
		expect(
			scheduledBursts({ ...source, stoppedAt: null, calledAt: 3.1 })[0].start,
		).toBeCloseTo(3.11);
	});
	it("finds weak clicks without counting individual carrier peaks or merging distinct events", () => {
		const pcm = new Float32Array(2000);
		for (const start of [100, 1100])
			for (let i = 0; i < 100; i++) pcm[start + i] = i % 2 ? -0.015 : 0.015;
		expect(detectBursts(pcm, 1000, 0.005)).toEqual([
			{ start: 0.1, end: 0.2 },
			{ start: 1.1, end: 1.2 },
		]);
		expect(detectBursts(new Float32Array(1000), 1000, 0.005)).toEqual([]);
	});
	it("reassembles a click split over independently scheduled PCM chunks", () => {
		expect(
			mergeBursts(
				[
					{ start: 2.04, end: 2.1 },
					{ start: 1, end: 1.1 },
					{ start: 2, end: 2.039 },
				],
				0.05,
			),
		).toEqual([
			{ start: 1, end: 1.1 },
			{ start: 2, end: 2.1 },
		]);
	});
	it.each([0.5, 1, 2])(
		"preserves signed audio lag and scales fixture bias at %sx",
		(rate) => {
			expect(
				signedOffset(2000 + 40 + 2 / rate, 2000, 2, rate).pathOffsetMs,
			).toBe(40);
			expect(signedOffset(1960 + 2 / rate, 2000, 2, rate).pathOffsetMs).toBe(
				-40,
			);
		},
	);
	it("maps known output time without subtracting an additional device delay", () => {
		const result = estimateOutputTime(2, [
			{ contextTime: 1.95, performanceTime: 5000, observedAt: 5010 },
			{ contextTime: 2.05, performanceTime: 5100, observedAt: 5110 },
		]);
		expect(result.kind).toBe("estimate");
		if (result.kind === "estimate")
			expect(result.performanceTime).toBeCloseTo(5050);
	});
	it("does not turn invalid, repeated, stale, or discontinuous output pairs into passing measurements", () => {
		const valid = { contextTime: 2, performanceTime: 5000, observedAt: 5010 };
		for (const pairs of [
			[],
			[valid, valid],
			[{ ...valid, contextTime: 0 }, valid],
			[{ ...valid, performanceTime: Number.NaN }, valid],
			[{ ...valid, observedAt: 6000 }, valid],
			[valid, { contextTime: 2.01, performanceTime: 5100, observedAt: 5110 }],
		])
			expect(estimateOutputTime(2, pairs).kind).toBe("unavailable");
	});
	it("reports variability and refuses empty or nonfinite evidence", () => {
		expect(summarize([-10, 0, 10])).toMatchObject({
			mean: 0,
			median: 0,
			sampleStandardDeviation: 10,
			count: 3,
		});
		expect(() => summarize([])).toThrow();
		expect(() => summarize([Number.NaN])).toThrow();
	});
});
