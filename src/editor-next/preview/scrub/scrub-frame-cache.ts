import type { MediaTimeUs } from "@/editor-core/model";
import { type ScrubCanvas, createScrubCanvas } from "./scrub-canvas";

const DEFAULT_CACHE_BUDGET_BYTES = 48 * 1024 * 1024;

type CachedScrubFrame = {
	byteSize: number;
	canvas: ScrubCanvas;
};

export type ScrubFrameCache = {
	clear: () => void;
	get: (timestampUs: MediaTimeUs) => ScrubCanvas | null;
	set: (timestampUs: MediaTimeUs, source: CanvasImageSource) => void;
};

export function createScrubFrameCache({
	byteBudget = DEFAULT_CACHE_BUDGET_BYTES,
	frameDurationUs,
}: {
	byteBudget?: number;
	frameDurationUs: MediaTimeUs;
}): ScrubFrameCache {
	const entries = new Map<number, CachedScrubFrame>();
	const maximumBytes = Math.max(0, Math.floor(byteBudget));
	let retainedBytes = 0;

	function clear() {
		for (const entry of entries.values()) {
			releaseCanvas(entry.canvas);
		}
		entries.clear();
		retainedBytes = 0;
	}

	return {
		clear,
		get(timestampUs) {
			const key = scrubFrameCacheKey(timestampUs, frameDurationUs);
			const entry = entries.get(key);
			if (!entry) {
				return null;
			}

			entries.delete(key);
			entries.set(key, entry);
			return entry.canvas;
		},
		set(timestampUs, source) {
			if (maximumBytes === 0) {
				return;
			}

			const width = sourceWidth(source);
			const height = sourceHeight(source);
			const byteSize = width * height * 4;
			if (width <= 0 || height <= 0 || byteSize > maximumBytes) {
				return;
			}

			const canvas = createScrubCanvas(width, height);
			const context = canvas.getContext("2d") as
				| CanvasRenderingContext2D
				| OffscreenCanvasRenderingContext2D
				| null;
			if (!context) {
				releaseCanvas(canvas);
				return;
			}
			context.drawImage(source, 0, 0, width, height);

			const key = scrubFrameCacheKey(timestampUs, frameDurationUs);
			const previous = entries.get(key);
			if (previous) {
				entries.delete(key);
				retainedBytes -= previous.byteSize;
				releaseCanvas(previous.canvas);
			}

			entries.set(key, { byteSize, canvas });
			retainedBytes += byteSize;

			while (retainedBytes > maximumBytes) {
				const oldest = entries.entries().next().value as
					| [number, CachedScrubFrame]
					| undefined;
				if (!oldest) {
					break;
				}

				entries.delete(oldest[0]);
				retainedBytes -= oldest[1].byteSize;
				releaseCanvas(oldest[1].canvas);
			}
		},
	};
}

export function scrubFrameCacheKey(
	timestampUs: MediaTimeUs,
	frameDurationUs: MediaTimeUs,
) {
	return Math.floor(
		Math.max(0, timestampUs) / Math.max(1, Math.round(frameDurationUs)),
	);
}

function releaseCanvas(canvas: ScrubCanvas) {
	canvas.width = 0;
	canvas.height = 0;
}

function sourceWidth(source: CanvasImageSource) {
	return "width" in source && typeof source.width === "number"
		? Math.max(0, Math.floor(source.width))
		: 0;
}

function sourceHeight(source: CanvasImageSource) {
	return "height" in source && typeof source.height === "number"
		? Math.max(0, Math.floor(source.height))
		: 0;
}
