import { describe, expect, it } from "vitest";
import type { Capture } from "../collector";
import fixture from "../fixture-manifest.json";
import { reportTrial, summarizeBaseline } from "../report";

function capture(rate = 1): Capture {
	return {
		frames: fixture.events.flatMap((event) => [
			{
				mediaTime: event.videoTimeSeconds - 0.02,
				expectedDisplayTime:
					(event.videoTimeSeconds * 1000) / rate + 60 - 20 / rate,
				callbackTime: (event.videoTimeSeconds * 1000) / rate + 60 - 20 / rate,
				presentedFrames: event.id * 50 - 1,
				bright: false,
			},
			{
				mediaTime: event.videoTimeSeconds,
				expectedDisplayTime: (event.videoTimeSeconds * 1000) / rate + 60,
				callbackTime: (event.videoTimeSeconds * 1000) / rate + 60,
				presentedFrames: event.id * 50,
				bright: true,
			},
		]),
		contexts: [
			{
				context: undefined,
				sources: fixture.events.map((event) => ({
					when: event.videoTimeSeconds / rate,
					calledAt: 0,
					offset: 0,
					duration: 0.2,
					rate,
					stoppedAt: null,
					sampleRate: 48000,
					bursts: [{ start: event.fixtureOffsetMs / 1000, end: 0.1 }],
				})),
				pairs: fixture.events.flatMap((event) =>
					[-0.05, 0.05].map((delta) => ({
						contextTime: event.videoTimeSeconds / rate + delta,
						performanceTime:
							(event.videoTimeSeconds / rate + delta) * 1000 + 100,
						observedAt: (event.videoTimeSeconds / rate + delta) * 1000 + 105,
					})),
				),
				states: [],
				maxScanMs: 0,
				state: "running",
				sampleRate: 48000,
				baseLatency: 0.01,
				outputLatency: 0.02,
			},
		],
		video: { muted: true, volume: 1, playbackRate: rate, currentTime: 9.5 },
	};
}

describe("actual-Preview evidence reporting", () => {
	it("requires five qualified trials at every rate, without counting empty or rejected trials", () => {
		expect(summarizeBaseline([]).every((rate) => rate.coverageGatePassed)).toBe(
			false,
		);
		const trials = [0.5, 1, 2].flatMap((rate) =>
			Array.from({ length: 5 }, () => reportTrial(capture(rate), rate)),
		);
		expect(
			summarizeBaseline(trials).every((rate) => rate.coverageGatePassed),
		).toBe(true);
		expect(
			summarizeBaseline(trials.slice(1)).every(
				(rate) => rate.coverageGatePassed,
			),
		).toBe(false);
		trials[0].coverageGatePassed = false;
		expect(
			summarizeBaseline(trials).every((rate) => rate.coverageGatePassed),
		).toBe(false);
	});
	it("refuses reversed or nonfinite visual timestamps", () => {
		for (const badTime of [-1, Number.NaN]) {
			const raw = capture();
			raw.frames[1].expectedDisplayTime = badTime;
			expect(() => reportTrial(raw, 1)).toThrow(/visual timestamps/);
		}
	});
	it.each([2])(
		"recovers an independently imposed 40 ms audio delay at %sx",
		(rate) => {
			const report = reportTrial(capture(rate), rate);
			expect(report.pathOffsetMs?.median).toBeCloseTo(40);
			expect(report.coverageGatePassed).toBe(true);
			expect(report.exactOnsetEvents).toBe(9);
			expect(report.physicalAlignment).toBe("unmeasured");
		},
	);
	it("widens uncertainty when callbacks skip the first flash frame", () => {
		const raw = capture();
		for (const frame of raw.frames.filter((frame) => frame.bright)) {
			frame.mediaTime += 0.02;
			frame.expectedDisplayTime += 20;
		}
		const report = reportTrial(raw, 1);
		expect(report.exactOnsetEvents).toBe(0);
		expect(report.pathOffsetMs?.median).toBeCloseTo(40);
		expect(report.observationBudgetMs).toBeGreaterThan(
			reportTrial(capture(), 1).observationBudgetMs,
		);
	});
	it("rejects missing output timestamps and does not produce a passing empty summary", () => {
		const raw = capture();
		raw.contexts[0].pairs = [];
		const report = reportTrial(raw, 1);
		expect(report.acceptedEvents).toBe(0);
		expect(report.pathOffsetMs).toBeNull();
		expect(report.coverageGatePassed).toBe(false);
	});
	it("refuses a missing/canceled click, wrong rate, audible native fallback, or late click schedule", () => {
		const canceled = capture();
		canceled.contexts[0].sources[0].stoppedAt = 0;
		expect(() => reportTrial(canceled, 1)).toThrow(/nine scheduled clicks/);
		expect(() => reportTrial(capture(), 2)).toThrow(/selected rate/);
		const fallback = capture();
		fallback.video.muted = false;
		expect(() => reportTrial(fallback, 1)).toThrow(/muted native video/);
		const late = capture();
		late.contexts[0].sources[0].calledAt = 1.01;
		expect(() => reportTrial(late, 1)).toThrow(/Late audio scheduling/);
	});
	it("does not turn a long callback blackout into a precise observation", () => {
		const raw = capture();
		for (const frame of raw.frames.filter((frame) => !frame.bright))
			frame.expectedDisplayTime -= 200;
		for (const frame of raw.frames.filter((frame) => frame.bright))
			frame.mediaTime += 0.02;
		const report = reportTrial(raw, 1);
		expect(report.acceptedEvents).toBe(0);
		expect(report.coverageGatePassed).toBe(false);
	});
});
