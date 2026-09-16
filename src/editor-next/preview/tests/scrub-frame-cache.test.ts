import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	createScrubFrameCache,
	scrubFrameCacheKey,
} from "../scrub/scrub-frame-cache";

const createdCanvases: MockOffscreenCanvas[] = [];

class MockOffscreenCanvas {
	drawImage = vi.fn();
	height: number;
	width: number;

	constructor(width: number, height: number) {
		this.width = width;
		this.height = height;
		createdCanvases.push(this);
	}

	getContext() {
		return { drawImage: this.drawImage };
	}
}

beforeEach(() => {
	createdCanvases.length = 0;
	vi.stubGlobal("OffscreenCanvas", MockOffscreenCanvas);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("scrub frame cache", () => {
	it("uses frame-oriented keys", () => {
		expect(scrubFrameCacheKey(0, 40_000)).toBe(0);
		expect(scrubFrameCacheKey(39_999, 40_000)).toBe(0);
		expect(scrubFrameCacheKey(40_000, 40_000)).toBe(1);
	});

	it("evicts the least recently used frame within its byte budget", () => {
		const cache = createScrubFrameCache({
			byteBudget: 32,
			frameDurationUs: 100,
		});
		const source = { height: 2, width: 2 } as CanvasImageSource;

		cache.set(0, source);
		cache.set(100, source);
		expect(cache.get(0)).toBe(createdCanvases[0]);

		cache.set(200, source);

		expect(cache.get(100)).toBeNull();
		expect(cache.get(0)).toBe(createdCanvases[0]);
		expect(cache.get(200)).toBe(createdCanvases[2]);
		expect(createdCanvases[1]?.width).toBe(0);
	});

	it("releases retained canvases when cleared", () => {
		const cache = createScrubFrameCache({
			byteBudget: 64,
			frameDurationUs: 100,
		});
		cache.set(0, { height: 2, width: 2 } as CanvasImageSource);

		cache.clear();

		expect(createdCanvases[0]?.height).toBe(0);
		expect(createdCanvases[0]?.width).toBe(0);
		expect(cache.get(0)).toBeNull();
	});
});
