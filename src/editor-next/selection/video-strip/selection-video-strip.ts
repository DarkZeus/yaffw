import type { MediaTimeUs } from "@/editor-core/model";
import { clamp } from "@/lib/clamp";
import { runWorkerJob } from "../../media-work/workers/worker-job";
import type {
	VideoStripThumbnailFrame,
	VideoStripThumbnailProgress,
	VideoStripThumbnailRequest,
	VideoStripThumbnailResult,
	VideoStripThumbnailViewport,
	VideoStripWorkerRequest,
} from "../types/selection-video-strip.types";
import {
	VIDEO_STRIP_THUMBNAIL_COUNT,
	VIDEO_STRIP_THUMBNAIL_HEIGHT_PX,
	createAbortError,
	createVideoStripThumbnailDimensions,
	isAbortError,
	loadVideoStripThumbnailsOnCurrentThread,
} from "./selection-video-strip-loader";
import VideoStripThumbnailWorker from "./selection-video-strip.worker?worker";

export {
	VIDEO_STRIP_THUMBNAIL_COUNT,
	VIDEO_STRIP_THUMBNAIL_HEIGHT_PX,
	createVideoStripThumbnailDimensions,
	loadVideoStripThumbnailsOnCurrentThread,
};

const MAX_VIDEO_STRIP_CACHE_ENTRIES_PER_SOURCE = 240;
const VIDEO_STRIP_OVERSCAN_VIEWPORTS = 1;
const VIDEO_STRIP_TARGET_THUMBNAIL_WIDTH_PX = 128;
export const MAX_VIDEO_STRIP_WINDOW_THUMBNAIL_COUNT = 72;

export type VideoStripThumbnailWindow = {
	assetDurationUs: MediaTimeUs;
	frameStepUs: MediaTimeUs;
	key: string;
	timestampsUs: MediaTimeUs[];
	visibleEndUs: MediaTimeUs;
	visibleStartUs: MediaTimeUs;
	windowEndUs: MediaTimeUs;
	windowStartUs: MediaTimeUs;
};

type CachedVideoStripThumbnailFrame = VideoStripThumbnailFrame & {
	thumbnailHeightPx: number;
	thumbnailWidthPx: number;
};

let thumbnailFrameCache = new WeakMap<
	Blob,
	Map<string, CachedVideoStripThumbnailFrame>
>();

export async function loadBrowserVideoStripThumbnails(
	request: VideoStripThumbnailRequest,
): Promise<VideoStripThumbnailResult> {
	if (request.signal?.aborted) throw createAbortError();
	const cachedFrames = readCachedVideoStripThumbnailFrames(request);
	const requestedFrameCount = request.timestampsUs.length;

	for (const cachedFrame of cachedFrames.frames) {
		request.onFrame?.({
			frame: cachedFrame,
			thumbnailCount: requestedFrameCount,
			thumbnailHeightPx: cachedFrame.thumbnailHeightPx,
			thumbnailWidthPx: cachedFrame.thumbnailWidthPx,
		});
		if (request.signal?.aborted) throw createAbortError();
	}

	if (
		cachedFrames.missingTimestamps.length === 0 &&
		cachedFrames.frames.length > 0 &&
		cachedFrames.thumbnailHeightPx !== null &&
		cachedFrames.thumbnailWidthPx !== null
	) {
		return {
			frames: cachedFrames.frames,
			status: "ready",
			thumbnailHeightPx: cachedFrames.thumbnailHeightPx,
			thumbnailWidthPx: cachedFrames.thumbnailWidthPx,
		};
	}

	let result: VideoStripThumbnailResult | null = null;
	const missingRequest = {
		...request,
		onFrame: (progress: VideoStripThumbnailProgress) => {
			if (request.signal?.aborted) return;
			const remappedFrame = remapMissingVideoStripThumbnailFrame(
				progress.frame,
				cachedFrames.missingTimestamps,
			);

			if (!remappedFrame) {
				return;
			}

			writeCachedVideoStripThumbnailFrame(request, {
				...remappedFrame,
				thumbnailHeightPx: progress.thumbnailHeightPx,
				thumbnailWidthPx: progress.thumbnailWidthPx,
			});
			request.onFrame?.({
				frame: remappedFrame,
				thumbnailCount: requestedFrameCount,
				thumbnailHeightPx: progress.thumbnailHeightPx,
				thumbnailWidthPx: progress.thumbnailWidthPx,
			});
		},
		timestampsUs: cachedFrames.missingTimestamps.map(
			(timestamp) => timestamp.timestampUs,
		),
	} satisfies VideoStripThumbnailRequest;

	if (canUseVideoStripWorker()) {
		try {
			result = await loadWorkerVideoStripThumbnails(missingRequest);
		} catch (error) {
			if (request.signal?.aborted || isAbortError(error)) {
				throw createAbortError();
			}
		}
	}

	if (result?.status !== "ready") {
		result = await loadVideoStripThumbnailsOnCurrentThread(missingRequest);
	}
	if (request.signal?.aborted) throw createAbortError();

	if (result.status !== "ready") {
		if (
			cachedFrames.frames.length > 0 &&
			cachedFrames.thumbnailHeightPx !== null &&
			cachedFrames.thumbnailWidthPx !== null
		) {
			return {
				frames: cachedFrames.frames,
				status: "ready",
				thumbnailHeightPx: cachedFrames.thumbnailHeightPx,
				thumbnailWidthPx: cachedFrames.thumbnailWidthPx,
			};
		}

		return result;
	}

	const loadedFrames = result.frames.flatMap((frame) => {
		const remappedFrame = remapMissingVideoStripThumbnailFrame(
			frame,
			cachedFrames.missingTimestamps,
		);

		if (!remappedFrame) {
			return [];
		}

		writeCachedVideoStripThumbnailFrame(request, {
			...remappedFrame,
			thumbnailHeightPx: result.thumbnailHeightPx,
			thumbnailWidthPx: result.thumbnailWidthPx,
		});

		return [remappedFrame];
	});
	const frames = [...cachedFrames.frames, ...loadedFrames].sort(
		(a, b) => a.index - b.index,
	);

	if (frames.length === 0) {
		return result;
	}

	return {
		frames,
		status: "ready",
		thumbnailHeightPx: result.thumbnailHeightPx,
		thumbnailWidthPx: result.thumbnailWidthPx,
	};
}

export function clearVideoStripThumbnailCache() {
	thumbnailFrameCache = new WeakMap();
}

export function createVideoStripThumbnailWindow({
	assetDurationUs,
	frameDurationUs = 1,
	overscanViewportCount = VIDEO_STRIP_OVERSCAN_VIEWPORTS,
	targetThumbnailWidthPx = VIDEO_STRIP_TARGET_THUMBNAIL_WIDTH_PX,
	viewport,
}: {
	assetDurationUs: number;
	frameDurationUs?: number;
	overscanViewportCount?: number;
	targetThumbnailWidthPx?: number;
	viewport: VideoStripThumbnailViewport;
}): VideoStripThumbnailWindow | null {
	if (!Number.isFinite(assetDurationUs) || assetDurationUs <= 0) {
		return null;
	}

	const trackWidthPx = Math.max(
		1,
		Number.isFinite(viewport.trackWidthPx) ? viewport.trackWidthPx : 1,
	);
	const viewportWidthPx = clamp(
		Number.isFinite(viewport.viewportWidthPx)
			? viewport.viewportWidthPx
			: trackWidthPx,
		1,
		trackWidthPx,
	);
	const maxScrollLeftPx = Math.max(0, trackWidthPx - viewportWidthPx);
	const scrollLeftPx = clamp(
		Number.isFinite(viewport.scrollLeftPx) ? viewport.scrollLeftPx : 0,
		0,
		maxScrollLeftPx,
	);
	const visibleStartPx = scrollLeftPx;
	const visibleEndPx = clamp(scrollLeftPx + viewportWidthPx, 0, trackWidthPx);
	const overscanWidthPx = Math.max(0, viewportWidthPx * overscanViewportCount);
	const bucketWidthPx = viewportWidthPx;
	const windowStartPx = clamp(
		Math.floor((visibleStartPx - overscanWidthPx) / bucketWidthPx) *
			bucketWidthPx,
		0,
		trackWidthPx,
	);
	const windowEndPx = clamp(
		Math.ceil((visibleEndPx + overscanWidthPx) / bucketWidthPx) * bucketWidthPx,
		0,
		trackWidthPx,
	);
	const visibleStartUs = pixelsToMediaTimeUs({
		assetDurationUs,
		pixel: visibleStartPx,
		trackWidthPx,
	});
	const visibleEndUs = pixelsToMediaTimeUs({
		assetDurationUs,
		pixel: visibleEndPx,
		trackWidthPx,
	});
	const windowStartUs = pixelsToMediaTimeUs({
		assetDurationUs,
		pixel: windowStartPx,
		trackWidthPx,
	});
	const windowEndUs = pixelsToMediaTimeUs({
		assetDurationUs,
		pixel: windowEndPx,
		trackWidthPx,
	});
	const minimumStepUs = Math.max(
		1,
		Math.round(Number.isFinite(frameDurationUs) ? frameDurationUs : 1),
	);
	const rawStepUs = Math.max(
		minimumStepUs,
		Math.round((targetThumbnailWidthPx / trackWidthPx) * assetDurationUs),
	);
	const frameStepUs = createBoundedVideoStripFrameStepUs({
		maxFrameCount: MAX_VIDEO_STRIP_WINDOW_THUMBNAIL_COUNT,
		minimumStepUs,
		rawStepUs,
		windowEndUs,
		windowStartUs,
	});
	const timestampsUs = createVideoStripWindowTimestamps({
		assetDurationUs,
		frameStepUs,
		windowEndUs,
		windowStartUs,
	});

	return {
		assetDurationUs,
		frameStepUs,
		key: [
			assetDurationUs,
			frameStepUs,
			timestampsUs[0] ?? 0,
			timestampsUs.at(-1) ?? 0,
			timestampsUs.length,
		].join(":"),
		timestampsUs,
		visibleEndUs,
		visibleStartUs,
		windowEndUs,
		windowStartUs,
	};
}

function loadWorkerVideoStripThumbnails({
	onFrame,
	signal,
	...request
}: VideoStripThumbnailRequest): Promise<VideoStripThumbnailResult> {
	return runWorkerJob<
		VideoStripWorkerRequest,
		VideoStripThumbnailResult,
		VideoStripThumbnailProgress
	>({
		createWorker: () => new VideoStripThumbnailWorker(),
		request,
		signal,
		onProgress: onFrame,
		createAbortError,
		failureMessage: "Video thumbnail worker failed.",
	});
}

function readCachedVideoStripThumbnailFrames(
	request: VideoStripThumbnailRequest,
) {
	const sourceCache = thumbnailFrameCache.get(request.source);
	const frames: CachedVideoStripThumbnailFrame[] = [];
	const missingTimestamps: Array<{
		index: number;
		timestampUs: number;
	}> = [];

	for (const [index, timestampUs] of request.timestampsUs.entries()) {
		const frame = sourceCache?.get(
			createVideoStripThumbnailCacheKey({
				devicePixelRatio: request.devicePixelRatio,
				thumbnailHeightPx: request.thumbnailHeightPx,
				timestampUs,
			}),
		);

		if (frame) {
			frames.push({
				...frame,
				index,
				timestampUs,
			});
			continue;
		}

		missingTimestamps.push({ index, timestampUs });
	}

	const firstFrame = frames[0] ?? null;

	return {
		frames,
		missingTimestamps,
		thumbnailHeightPx: firstFrame?.thumbnailHeightPx ?? null,
		thumbnailWidthPx: firstFrame?.thumbnailWidthPx ?? null,
	};
}

function writeCachedVideoStripThumbnailFrame(
	{ devicePixelRatio, source, thumbnailHeightPx }: VideoStripThumbnailRequest,
	frame: CachedVideoStripThumbnailFrame,
) {
	let sourceCache = thumbnailFrameCache.get(source);
	if (!sourceCache) {
		sourceCache = new Map();
		thumbnailFrameCache.set(source, sourceCache);
	}

	const cacheKey = createVideoStripThumbnailCacheKey({
		devicePixelRatio,
		thumbnailHeightPx,
		timestampUs: frame.timestampUs,
	});
	sourceCache.delete(cacheKey);
	sourceCache.set(cacheKey, frame);

	while (sourceCache.size > MAX_VIDEO_STRIP_CACHE_ENTRIES_PER_SOURCE) {
		const oldestKey = sourceCache.keys().next().value;
		if (!oldestKey) {
			break;
		}
		sourceCache.delete(oldestKey);
	}
}

function createVideoStripThumbnailCacheKey({
	devicePixelRatio,
	thumbnailHeightPx,
	timestampUs,
}: {
	devicePixelRatio: number;
	thumbnailHeightPx: number;
	timestampUs: number;
}) {
	return [
		normalizeCacheNumber(devicePixelRatio),
		thumbnailHeightPx,
		timestampUs,
	].join(":");
}

function remapMissingVideoStripThumbnailFrame(
	frame: VideoStripThumbnailFrame,
	missingTimestamps: Array<{ index: number; timestampUs: number }>,
): VideoStripThumbnailFrame | null {
	const missingTimestamp = missingTimestamps[frame.index];

	if (!missingTimestamp) {
		return null;
	}

	return {
		...frame,
		index: missingTimestamp.index,
		timestampUs: missingTimestamp.timestampUs,
	};
}

function pixelsToMediaTimeUs({
	assetDurationUs,
	pixel,
	trackWidthPx,
}: {
	assetDurationUs: number;
	pixel: number;
	trackWidthPx: number;
}) {
	return Math.round(
		(clamp(pixel, 0, trackWidthPx) / trackWidthPx) * assetDurationUs,
	);
}

function createBoundedVideoStripFrameStepUs({
	maxFrameCount,
	minimumStepUs,
	rawStepUs,
	windowEndUs,
	windowStartUs,
}: {
	maxFrameCount: number;
	minimumStepUs: number;
	rawStepUs: number;
	windowEndUs: number;
	windowStartUs: number;
}) {
	const safeMaxFrameCount = Math.max(1, Math.floor(maxFrameCount));
	const windowDurationUs = Math.max(0, windowEndUs - windowStartUs);

	if (safeMaxFrameCount <= 1 || windowDurationUs <= 0) {
		return Math.max(minimumStepUs, rawStepUs);
	}

	return Math.max(
		minimumStepUs,
		rawStepUs,
		Math.ceil(windowDurationUs / (safeMaxFrameCount - 1)),
	);
}

function createVideoStripWindowTimestamps({
	assetDurationUs,
	frameStepUs,
	windowEndUs,
	windowStartUs,
}: {
	assetDurationUs: number;
	frameStepUs: number;
	windowEndUs: number;
	windowStartUs: number;
}) {
	if (frameStepUs <= 0 || windowEndUs <= windowStartUs) {
		return [];
	}

	const timestampsUs: number[] = [];
	const maxTimestampUs = Math.max(0, assetDurationUs - 1);
	const firstTimestampUs = Math.max(
		0,
		Math.floor(windowStartUs / frameStepUs) * frameStepUs,
	);

	for (
		let timestampUs = firstTimestampUs;
		timestampUs <= windowEndUs;
		timestampUs += frameStepUs
	) {
		const boundedTimestampUs = Math.min(timestampUs, maxTimestampUs);
		const previousTimestampUs = timestampsUs.at(-1);

		if (previousTimestampUs !== boundedTimestampUs) {
			timestampsUs.push(boundedTimestampUs);
		}
	}

	return timestampsUs;
}

function canUseVideoStripWorker() {
	return typeof Worker !== "undefined";
}

function normalizeCacheNumber(value: number) {
	return Number.isFinite(value) ? value : "NaN";
}
