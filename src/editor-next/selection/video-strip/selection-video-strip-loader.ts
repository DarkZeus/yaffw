import {
	ALL_FORMATS,
	BlobSource,
	CanvasSink,
	Input,
	type InputVideoTrack,
} from "mediabunny";

import type { MediaTimeUs } from "@/editor-core/model";

import type {
	VideoStripThumbnailFrame,
	VideoStripThumbnailRequest,
	VideoStripThumbnailResult,
} from "../types/selection-video-strip.types";

export const VIDEO_STRIP_THUMBNAIL_COUNT = 8;
export const VIDEO_STRIP_THUMBNAIL_HEIGHT_PX = 54;

const MAX_THUMBNAIL_WIDTH_PX = 112;
const THUMBNAIL_IMAGE_TYPE = "image/jpeg";
const THUMBNAIL_IMAGE_QUALITY = 0.72;
const CANVAS_POOL_SIZE = 1;

type MaybePromise<T> = T | Promise<T>;

type VideoStripReadableVideoTrack = Pick<
	InputVideoTrack,
	"canDecode" | "computeDuration" | "getFirstTimestamp"
> & {
	codec?: unknown;
	displayHeight?: unknown;
	displayWidth?: unknown;
	getCodec?: () => MaybePromise<unknown>;
	getDisplayHeight?: () => MaybePromise<unknown>;
	getDisplayWidth?: () => MaybePromise<unknown>;
};

export async function loadVideoStripThumbnailsOnCurrentThread({
	assetDurationUs,
	devicePixelRatio,
	onFrame,
	signal,
	source,
	thumbnailHeightPx,
	timestampsUs,
}: VideoStripThumbnailRequest): Promise<VideoStripThumbnailResult> {
	throwIfAborted(signal);

	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(source),
	});

	try {
		const videoTrack = await input.getPrimaryVideoTrack();
		throwIfAborted(signal);

		if (!videoTrack) {
			return {
				reason: "The active media asset has no video track.",
				status: "unavailable",
			};
		}

		if ((await readVideoTrackCodec(videoTrack)) === null) {
			return {
				reason: "The primary video track uses an unsupported codec.",
				status: "unavailable",
			};
		}

		if (!(await videoTrack.canDecode())) {
			return {
				reason: "This browser cannot decode the primary video track.",
				status: "unavailable",
			};
		}

		const [displayWidth, displayHeight, firstTimestamp, trackEndTimestamp] =
			await Promise.all([
				readVideoTrackDisplayWidth(videoTrack),
				readVideoTrackDisplayHeight(videoTrack),
				videoTrack.getFirstTimestamp(),
				videoTrack.computeDuration(),
			]);
		throwIfAborted(signal);

		const assetDurationSeconds = assetDurationUs / 1_000_000;
		const thumbnailEndTimestamp = Number.isFinite(assetDurationSeconds)
			? Math.min(trackEndTimestamp, assetDurationSeconds)
			: trackEndTimestamp;

		if (
			!Number.isFinite(displayWidth) ||
			displayWidth <= 0 ||
			!Number.isFinite(displayHeight) ||
			displayHeight <= 0 ||
			!Number.isFinite(firstTimestamp) ||
			!Number.isFinite(thumbnailEndTimestamp) ||
			thumbnailEndTimestamp <= firstTimestamp
		) {
			return {
				reason:
					"The primary video track dimensions or duration could not be measured.",
				status: "unavailable",
			};
		}

		const dimensions = createVideoStripThumbnailDimensions({
			devicePixelRatio,
			displayHeight,
			displayWidth,
			thumbnailHeightPx,
		});
		const timestamps = createBoundedVideoStripThumbnailTimestamps({
			endTimestamp: thumbnailEndTimestamp,
			firstTimestamp,
			timestampsUs,
		});

		if (timestamps.length === 0) {
			return {
				reason: "No visible video thumbnail timestamps were requested.",
				status: "unavailable",
			};
		}

		const sink = new CanvasSink(videoTrack, {
			fit: "cover",
			height: dimensions.deviceHeightPx,
			poolSize: CANVAS_POOL_SIZE,
			width: dimensions.deviceWidthPx,
		});
		const frames: VideoStripThumbnailFrame[] = [];
		let index = 0;
		const iterator = sink
			.canvasesAtTimestamps(timestamps)
			[Symbol.asyncIterator]();

		try {
			while (true) {
				throwIfAborted(signal);

				const { done, value: wrappedCanvas } = await iterator.next();
				if (done) {
					break;
				}

				throwIfAborted(signal);

				if (wrappedCanvas) {
					const frame = {
						imageBlob: await canvasToThumbnailBlob(wrappedCanvas.canvas),
						index,
						timestampUs: secondsToMicroseconds(
							timestamps[index] ?? wrappedCanvas.timestamp,
						),
					};
					frames.push(frame);
					onFrame?.({
						frame,
						thumbnailCount: timestamps.length,
						thumbnailHeightPx: dimensions.cssHeightPx,
						thumbnailWidthPx: dimensions.cssWidthPx,
					});
				}

				index += 1;
			}
		} finally {
			if (signal?.aborted) {
				await iterator.return?.();
			}
		}

		if (frames.length === 0) {
			return {
				reason: "No video frames were decoded for thumbnail navigation.",
				status: "unavailable",
			};
		}

		return {
			frames,
			status: "ready",
			thumbnailHeightPx: dimensions.cssHeightPx,
			thumbnailWidthPx: dimensions.cssWidthPx,
		};
	} catch (error) {
		if (signal?.aborted || isAbortError(error)) {
			throw createAbortError();
		}

		return {
			reason: errorToMessage(error),
			status: "unavailable",
		};
	} finally {
		input.dispose();
	}
}

export function createVideoStripThumbnailTimestamps({
	endTimestamp,
	firstTimestamp,
	thumbnailCount,
}: {
	endTimestamp: number;
	firstTimestamp: number;
	thumbnailCount: number;
}) {
	const count = Math.max(1, Math.floor(thumbnailCount));
	const duration = Math.max(0, endTimestamp - firstTimestamp);

	return Array.from(
		{ length: count },
		(_, index) => firstTimestamp + (index * duration) / count,
	);
}

export function createBoundedVideoStripThumbnailTimestamps({
	endTimestamp,
	firstTimestamp,
	timestampsUs,
}: {
	endTimestamp: number;
	firstTimestamp: number;
	timestampsUs: MediaTimeUs[];
}) {
	if (
		!Number.isFinite(firstTimestamp) ||
		!Number.isFinite(endTimestamp) ||
		endTimestamp <= firstTimestamp
	) {
		return [];
	}

	const startTimestampUs = secondsToMicroseconds(firstTimestamp);
	const endTimestampUs = secondsToMicroseconds(endTimestamp);

	return timestampsUs
		.filter((timestampUs, index) => {
			if (!Number.isFinite(timestampUs)) {
				return false;
			}

			return index === 0 || timestampUs !== timestampsUs[index - 1];
		})
		.map((timestampUs) =>
			microsecondsToSeconds(
				clampNumber(timestampUs, startTimestampUs, endTimestampUs - 1),
			),
		);
}

export function createVideoStripThumbnailDimensions({
	devicePixelRatio,
	displayHeight,
	displayWidth,
	thumbnailHeightPx,
}: {
	devicePixelRatio: number;
	displayHeight: number;
	displayWidth: number;
	thumbnailHeightPx: number;
}) {
	const safeDevicePixelRatio = Math.max(
		1,
		Math.min(3, Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1),
	);
	const aspectRatio = Math.max(0.1, displayWidth / displayHeight);
	const cssHeightPx = Math.max(1, Math.round(thumbnailHeightPx));
	const cssWidthPx = Math.max(
		1,
		Math.min(MAX_THUMBNAIL_WIDTH_PX, Math.round(cssHeightPx * aspectRatio)),
	);

	return {
		cssHeightPx,
		cssWidthPx,
		deviceHeightPx: Math.max(1, Math.round(cssHeightPx * safeDevicePixelRatio)),
		deviceWidthPx: Math.max(1, Math.round(cssWidthPx * safeDevicePixelRatio)),
	};
}

export function createAbortError() {
	if (typeof DOMException !== "undefined") {
		return new DOMException(
			"Thumbnail generation was cancelled.",
			"AbortError",
		);
	}

	const error = new Error("Thumbnail generation was cancelled.");
	error.name = "AbortError";
	return error;
}

export function isAbortError(error: unknown) {
	return error instanceof Error && error.name === "AbortError";
}

function throwIfAborted(signal: AbortSignal | undefined) {
	if (signal?.aborted) {
		throw createAbortError();
	}
}

async function readVideoTrackCodec(videoTrack: VideoStripReadableVideoTrack) {
	if (typeof videoTrack.getCodec === "function") {
		return videoTrack.getCodec();
	}

	return videoTrack.codec ?? null;
}

async function readVideoTrackDisplayWidth(
	videoTrack: VideoStripReadableVideoTrack,
) {
	if (typeof videoTrack.getDisplayWidth === "function") {
		return normalizeFiniteNumber(await videoTrack.getDisplayWidth());
	}

	return normalizeFiniteNumber(videoTrack.displayWidth);
}

async function readVideoTrackDisplayHeight(
	videoTrack: VideoStripReadableVideoTrack,
) {
	if (typeof videoTrack.getDisplayHeight === "function") {
		return normalizeFiniteNumber(await videoTrack.getDisplayHeight());
	}

	return normalizeFiniteNumber(videoTrack.displayHeight);
}

function normalizeFiniteNumber(value: unknown) {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: Number.NaN;
}

async function canvasToThumbnailBlob(
	canvas: HTMLCanvasElement | OffscreenCanvas,
): Promise<Blob> {
	if ("convertToBlob" in canvas) {
		return canvas.convertToBlob({
			quality: THUMBNAIL_IMAGE_QUALITY,
			type: THUMBNAIL_IMAGE_TYPE,
		});
	}

	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (!blob) {
					reject(new Error("Unable to encode thumbnail canvas."));
					return;
				}

				resolve(blob);
			},
			THUMBNAIL_IMAGE_TYPE,
			THUMBNAIL_IMAGE_QUALITY,
		);
	});
}

function secondsToMicroseconds(seconds: number): MediaTimeUs {
	return Math.max(0, Math.round(seconds * 1_000_000));
}

function microsecondsToSeconds(microseconds: MediaTimeUs) {
	return microseconds / 1_000_000;
}

function clampNumber(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

function errorToMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}
