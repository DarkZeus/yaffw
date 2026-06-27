import { useEffect, useRef, useState } from "react";

import {
	VIDEO_STRIP_THUMBNAIL_COUNT,
	VIDEO_STRIP_THUMBNAIL_HEIGHT_PX,
	createAbortError,
	createVideoStripThumbnailDimensions,
	createVideoStripThumbnailTimestamps,
	isAbortError,
	loadVideoStripThumbnailsOnCurrentThread,
} from "./selection-video-strip-loader";
import type {
	UseVideoStripThumbnailsOptions,
	VideoStripThumbnailFrame,
	VideoStripThumbnailProgress,
	VideoStripThumbnailRequest,
	VideoStripThumbnailResult,
	VideoStripThumbnailState,
	VideoStripThumbnailViewFrame,
	VideoStripThumbnailViewport,
	VideoStripThumbnailWindow,
} from "./selection-video-strip.types";
import VideoStripThumbnailWorker from "./selection-video-strip.worker?worker";

export {
	VIDEO_STRIP_THUMBNAIL_COUNT,
	VIDEO_STRIP_THUMBNAIL_HEIGHT_PX,
	createVideoStripThumbnailDimensions,
	createVideoStripThumbnailTimestamps,
	loadVideoStripThumbnailsOnCurrentThread,
};

const MAX_VIDEO_STRIP_CACHE_ENTRIES_PER_SOURCE = 240;
const VIDEO_STRIP_OVERSCAN_VIEWPORTS = 1;
const VIDEO_STRIP_TARGET_THUMBNAIL_WIDTH_PX = 128;
export const MAX_VIDEO_STRIP_WINDOW_THUMBNAIL_COUNT = 72;

type CachedVideoStripThumbnailFrame = VideoStripThumbnailFrame & {
	thumbnailHeightPx: number;
	thumbnailWidthPx: number;
};

let thumbnailFrameCache = new WeakMap<
	Blob,
	Map<string, CachedVideoStripThumbnailFrame>
>();

let nextWorkerRequestId = 0;

export function useVideoStripThumbnails({
	asset,
	source,
	thumbnailWindow,
	videoStripThumbnailLoader,
}: UseVideoStripThumbnailsOptions): VideoStripThumbnailState {
	const requestWindowRef = useRef<VideoStripThumbnailWindow | null>(
		thumbnailWindow,
	);
	if (requestWindowRef.current?.key !== thumbnailWindow?.key) {
		requestWindowRef.current = thumbnailWindow;
	}
	const requestWindow = requestWindowRef.current;
	const [state, setState] = useState<VideoStripThumbnailState>(() =>
		asset.tracks.video.length > 0
			? { frames: [], status: "loading" }
			: {
					reason: "The active media asset has no video track.",
					status: "unavailable",
				},
	);

	useEffect(() => {
		let cancelled = false;
		const abortController = new AbortController();
		const objectUrlsByIndex = new Map<number, string>();

		function revokeObjectUrls() {
			for (const objectUrl of objectUrlsByIndex.values()) {
				URL.revokeObjectURL(objectUrl);
			}
			objectUrlsByIndex.clear();
		}

		function createViewFrame(
			frame: VideoStripThumbnailFrame,
			{ replace = false }: { replace?: boolean } = {},
		) {
			const existingUrl = objectUrlsByIndex.get(frame.index);
			if (existingUrl && !replace) {
				return {
					index: frame.index,
					timestampUs: frame.timestampUs,
					url: existingUrl,
				};
			}

			if (existingUrl) {
				URL.revokeObjectURL(existingUrl);
			}

			const url = URL.createObjectURL(frame.imageBlob);
			objectUrlsByIndex.set(frame.index, url);

			return {
				index: frame.index,
				timestampUs: frame.timestampUs,
				url,
			};
		}

		function publishProgress(progress: VideoStripThumbnailProgress) {
			if (cancelled) {
				return;
			}

			try {
				const viewFrame = createViewFrame(progress.frame, { replace: true });
				setState((previousState) => {
					const previousFrames =
						previousState.status === "loading" ? previousState.frames : [];
					const nextFrames = upsertVideoStripViewFrame(
						previousFrames,
						viewFrame,
					);

					return {
						frameStepUs: requestWindow?.frameStepUs,
						frames: nextFrames,
						status: "loading",
						thumbnailCount: progress.thumbnailCount,
						thumbnailHeightPx: progress.thumbnailHeightPx,
						thumbnailWidthPx: progress.thumbnailWidthPx,
						timestampsUs: requestWindow?.timestampsUs,
					};
				});
			} catch (error) {
				revokeObjectUrls();
				setState({
					reason: errorToMessage(error),
					status: "unavailable",
				});
			}
		}

		if (asset.tracks.video.length === 0) {
			setState({
				reason: "The active media asset has no video track.",
				status: "unavailable",
			});

			return () => {
				cancelled = true;
				abortController.abort();
			};
		}

		if (!requestWindow || requestWindow.timestampsUs.length === 0) {
			setState({
				frames: [],
				status: "loading",
				thumbnailCount: 0,
				thumbnailHeightPx: VIDEO_STRIP_THUMBNAIL_HEIGHT_PX,
				timestampsUs: [],
			});

			return () => {
				cancelled = true;
				abortController.abort();
				revokeObjectUrls();
			};
		}

		setState({
			frameStepUs: requestWindow.frameStepUs,
			frames: [],
			status: "loading",
			thumbnailCount: requestWindow.timestampsUs.length,
			thumbnailHeightPx: VIDEO_STRIP_THUMBNAIL_HEIGHT_PX,
			timestampsUs: requestWindow.timestampsUs,
		});

		void videoStripThumbnailLoader({
			assetDurationUs: asset.durationUs,
			devicePixelRatio: browserDevicePixelRatio(),
			onFrame: publishProgress,
			signal: abortController.signal,
			source,
			thumbnailHeightPx: VIDEO_STRIP_THUMBNAIL_HEIGHT_PX,
			timestampsUs: requestWindow.timestampsUs,
		})
			.then((result) => {
				if (cancelled) {
					return;
				}

				if (result.status === "unavailable") {
					revokeObjectUrls();
					setState(result);
					return;
				}

				try {
					const finalFrameIndexes = new Set(
						result.frames.map((frame) => frame.index),
					);
					for (const [index, objectUrl] of objectUrlsByIndex) {
						if (!finalFrameIndexes.has(index)) {
							URL.revokeObjectURL(objectUrl);
							objectUrlsByIndex.delete(index);
						}
					}

					const frames = result.frames.map((frame) => createViewFrame(frame));

					setState({
						frameStepUs: requestWindow.frameStepUs,
						frames,
						status: "ready",
						thumbnailHeightPx: result.thumbnailHeightPx,
						thumbnailWidthPx: result.thumbnailWidthPx,
						timestampsUs: requestWindow.timestampsUs,
					});
				} catch (error) {
					revokeObjectUrls();
					setState({
						reason: errorToMessage(error),
						status: "unavailable",
					});
				}
			})
			.catch((error: unknown) => {
				if (cancelled || isAbortError(error)) {
					return;
				}

				revokeObjectUrls();
				setState({
					reason: errorToMessage(error),
					status: "unavailable",
				});
			});

		return () => {
			cancelled = true;
			abortController.abort();
			revokeObjectUrls();
		};
	}, [
		asset.durationUs,
		asset.tracks.video.length,
		requestWindow,
		source,
		videoStripThumbnailLoader,
	]);

	return state;
}

export async function loadBrowserVideoStripThumbnails(
	request: VideoStripThumbnailRequest,
): Promise<VideoStripThumbnailResult> {
	const cachedFrames = readCachedVideoStripThumbnailFrames(request);
	const requestedFrameCount = request.timestampsUs.length;

	for (const cachedFrame of cachedFrames.frames) {
		request.onFrame?.({
			frame: cachedFrame,
			thumbnailCount: requestedFrameCount,
			thumbnailHeightPx: cachedFrame.thumbnailHeightPx,
			thumbnailWidthPx: cachedFrame.thumbnailWidthPx,
		});
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

		if (!request.signal?.aborted) {
			writeCachedVideoStripThumbnailFrame(request, {
				...remappedFrame,
				thumbnailHeightPx: result.thumbnailHeightPx,
				thumbnailWidthPx: result.thumbnailWidthPx,
			});
		}

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
	const viewportWidthPx = clampNumber(
		Number.isFinite(viewport.viewportWidthPx)
			? viewport.viewportWidthPx
			: trackWidthPx,
		1,
		trackWidthPx,
	);
	const maxScrollLeftPx = Math.max(0, trackWidthPx - viewportWidthPx);
	const scrollLeftPx = clampNumber(
		Number.isFinite(viewport.scrollLeftPx) ? viewport.scrollLeftPx : 0,
		0,
		maxScrollLeftPx,
	);
	const visibleStartPx = scrollLeftPx;
	const visibleEndPx = clampNumber(
		scrollLeftPx + viewportWidthPx,
		0,
		trackWidthPx,
	);
	const overscanWidthPx = Math.max(0, viewportWidthPx * overscanViewportCount);
	const bucketWidthPx = viewportWidthPx;
	const windowStartPx = clampNumber(
		Math.floor((visibleStartPx - overscanWidthPx) / bucketWidthPx) *
			bucketWidthPx,
		0,
		trackWidthPx,
	);
	const windowEndPx = clampNumber(
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
	if (signal?.aborted) {
		return Promise.reject(createAbortError());
	}

	return new Promise((resolve, reject) => {
		const requestId = nextWorkerRequestId++;
		const worker = new VideoStripThumbnailWorker();

		let settled = false;

		function cleanup() {
			signal?.removeEventListener("abort", handleAbort);
			worker.removeEventListener("error", handleError);
			worker.removeEventListener("message", handleMessage);
			worker.terminate();
		}

		function resolveSettled(value: VideoStripThumbnailResult) {
			if (settled) {
				return;
			}

			settled = true;
			cleanup();
			resolve(value);
		}

		function rejectSettled(error: Error) {
			if (settled) {
				return;
			}

			settled = true;
			cleanup();
			reject(error);
		}

		function handleAbort() {
			rejectSettled(createAbortError());
		}

		function handleError(event: ErrorEvent) {
			rejectSettled(
				new Error(event.message || "Video thumbnail worker failed."),
			);
		}

		function handleMessage(
			event: MessageEvent<VideoStripWorkerResponseMessage>,
		) {
			if (event.data.requestId !== requestId) {
				return;
			}

			if (event.data.type === "frame") {
				onFrame?.(event.data.progress);
				return;
			}

			resolveSettled(event.data.result);
		}

		signal?.addEventListener("abort", handleAbort, { once: true });
		worker.addEventListener("error", handleError);
		worker.addEventListener("message", handleMessage);
		worker.postMessage({
			request,
			requestId,
			type: "generate",
		} satisfies VideoStripWorkerRequestMessage);
	});
}

type VideoStripWorkerRequestMessage = {
	request: Omit<VideoStripThumbnailRequest, "onFrame" | "signal">;
	requestId: number;
	type: "generate";
};

type VideoStripWorkerResponseMessage =
	| {
			progress: VideoStripThumbnailProgress;
			requestId: number;
			type: "frame";
	  }
	| {
			requestId: number;
			result: VideoStripThumbnailResult;
			type: "done";
	  };

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
		(clampNumber(pixel, 0, trackWidthPx) / trackWidthPx) * assetDurationUs,
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

function upsertVideoStripViewFrame(
	frames: VideoStripThumbnailViewFrame[],
	frame: VideoStripThumbnailViewFrame,
) {
	const nextFrames = frames.filter(
		(existingFrame) => existingFrame.index !== frame.index,
	);
	nextFrames.push(frame);
	nextFrames.sort((a, b) => a.index - b.index);
	return nextFrames;
}

function canUseVideoStripWorker() {
	return typeof Worker !== "undefined";
}

function normalizeCacheNumber(value: number) {
	return Number.isFinite(value) ? value : "NaN";
}

function clampNumber(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

function browserDevicePixelRatio() {
	if (typeof window === "undefined") {
		return 1;
	}

	return window.devicePixelRatio || 1;
}

function errorToMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}
