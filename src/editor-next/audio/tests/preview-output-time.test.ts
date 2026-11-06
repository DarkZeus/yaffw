import { describe, expect, it } from "vitest";
import { createPreviewOutputTime } from "../engine/preview-output-time";

const epoch = {
	id: 1,
	contextTimeSeconds: 10,
	mediaTimeSeconds: 20,
	playbackRate: 1,
	endSeconds: 30,
};
const sample = {
	epoch,
	renderingTimeSeconds: 21,
	contextTimeSeconds: 11,
	performanceTimeMilliseconds: 2000,
	timestamp: { contextTime: 10.8, performanceTime: 1980 },
};

describe("Preview output-time projection", () => {
	it.each([0.5])(
		"maps the source epoch and rate %s without another latency subtraction",
		(playbackRate) => {
			expect(
				createPreviewOutputTime().read({
					...sample,
					epoch: { ...epoch, playbackRate },
					renderingTimeSeconds: 20 + playbackRate,
				}),
			).toBeCloseTo(20 + 0.82 * playbackRate);
		},
	);
	it("rejects discontinuity and recovers without moving backwards", () => {
		const mapper = createPreviewOutputTime();
		expect(mapper.read(sample)).toBeCloseTo(20.82);
		expect(
			mapper.read({
				...sample,
				renderingTimeSeconds: 21.1,
				contextTimeSeconds: 11.1,
				performanceTimeMilliseconds: 2100,
				timestamp: { contextTime: 10.2, performanceTime: 2080 },
			}),
		).toBe(21.1);
		expect(
			mapper.read({
				...sample,
				renderingTimeSeconds: 21.2,
				contextTimeSeconds: 11.2,
				performanceTimeMilliseconds: 2200,
				timestamp: { contextTime: 11, performanceTime: 2180 },
			}),
		).toBe(21.1);
		expect(
			mapper.read({
				...sample,
				renderingTimeSeconds: 21.4,
				contextTimeSeconds: 11.4,
				performanceTimeMilliseconds: 2400,
				timestamp: { contextTime: 11.2, performanceTime: 2380 },
			}),
		).toBeCloseTo(21.22);
	});
	it("expires a frozen pair and resets monotonic history for a new source epoch", () => {
		const mapper = createPreviewOutputTime();
		mapper.read(sample);
		expect(
			mapper.read({
				...sample,
				performanceTimeMilliseconds: 2300,
				renderingTimeSeconds: 21.3,
			}),
		).toBe(21.3);
		expect(
			mapper.read({
				...sample,
				epoch: { ...epoch, id: 2, mediaTimeSeconds: 5 },
				renderingTimeSeconds: 6,
			}),
		).toBeCloseTo(5.82);
		expect(
			mapper.read({ ...sample, epoch: null, renderingTimeSeconds: 4 }),
		).toBe(4);
		expect(
			mapper.read({
				...sample,
				epoch: { ...epoch, id: 2, mediaTimeSeconds: 5 },
				renderingTimeSeconds: 6,
			}),
		).toBeCloseTo(5.82);
	});
	it("clamps old output to the new epoch and never passes rendering or the Selection end", () => {
		expect(
			createPreviewOutputTime().read({
				...sample,
				timestamp: { contextTime: 9.8, performanceTime: 1980 },
			}),
		).toBe(20);
		expect(
			createPreviewOutputTime().read({ ...sample, renderingTimeSeconds: 20.5 }),
		).toBe(20.5);
		expect(
			createPreviewOutputTime().read({
				...sample,
				epoch: { ...epoch, endSeconds: 20.4 },
			}),
		).toBe(20.4);
	});
});
