import type {
	EncodedPacket,
	EncodedPacketSink,
	VideoSample,
	VideoSampleSink,
} from "mediabunny";

import type { MediaTimeUs } from "@/editor-core/model";
import { createMediaSourceFailureBoundary } from "../../media-work/scopes/media-source-failure-boundary";
import { createKeyframeIndex } from "./keyframe-index";
import { createScrubFrameCache } from "./scrub-frame-cache";

const DEFAULT_MAX_OUTPUT_DIMENSION_PX = 1280;
const EXACT_SETTLE_DELAY_MS = 120;
const EXACT_PREFETCH_SAMPLE_COUNT = 24;

export type ScrubFrame = {
	actualTimestampUs: MediaTimeUs;
	canvas: HTMLCanvasElement | OffscreenCanvas;
	requestId: number;
	requestedAtMs: number;
	timestampUs: MediaTimeUs;
};

export type ScrubFrameProvider = {
	dispose: () => void;
	requestFrame: (
		timestampUs: MediaTimeUs,
		options?: ScrubFrameRequestOptions,
	) => number;
	warm: () => void;
};

export type ScrubFrameRequestOptions = {
	priority?: "final" | "interactive";
};

export type ScrubFrameProviderRequest = {
	displayHeight?: number;
	displayWidth?: number;
	frameDurationUs: MediaTimeUs;
	onFrame: (frame: ScrubFrame) => void;
	onUnavailable?: (reason: string) => void;
	source: Blob;
};

type PendingScrubFrameRequest = {
	id: number;
	phase: "cached" | "exact";
	requestedAtMs: number;
	timestampSeconds: number;
	timestampUs: MediaTimeUs;
};

export function createMediabunnyScrubFrameProvider({
	displayHeight,
	displayWidth,
	frameDurationUs,
	onFrame,
	onUnavailable,
	source,
}: ScrubFrameProviderRequest): ScrubFrameProvider {
	const requestSource = new LatestScrubFrameRequestSource();
	const sourceFailure = createMediaSourceFailureBoundary();
	const decodedFrames = createScrubFrameCache({
		byteBudget: 96 * 1024 * 1024,
		frameDurationUs,
	});
	const dimensions = resolveScrubFrameDimensions({
		displayHeight,
		displayWidth,
	});
	const scratchCanvas = createOutputCanvas(dimensions.width, dimensions.height);
	const scratchContext = scratchCanvas.getContext("2d") as
		| CanvasRenderingContext2D
		| OffscreenCanvasRenderingContext2D
		| null;
	// One forward sample iterator is the scrub session decoder: requests within
	// the same GOP keep pulling from it, and a GOP jump or reversal reseeds it.
	let activeKeySequenceNumber: number | null = null;
	let disposed = false;
	let input: { dispose: () => void } | null = null;
	let keyframeIndex: ReturnType<typeof createKeyframeIndex> | null = null;
	let lastDecodedTimestampUs: MediaTimeUs | null = null;
	let latestRequestId = 0;
	let packetSink: EncodedPacketSink | null = null;
	let running: Promise<void> | null = null;
	let sampleIterator: AsyncGenerator<VideoSample, void, unknown> | null = null;
	let sampleSink: VideoSampleSink | null = null;
	let settleTimer: ReturnType<typeof setTimeout> | null = null;

	function reportUnavailable(error: unknown) {
		if (!disposed) {
			onUnavailable?.(errorToMessage(error));
		}
	}

	function cacheDecodedSample(sample: VideoSample) {
		try {
			if (!scratchContext || disposed) {
				return;
			}

			scratchContext.clearRect(0, 0, dimensions.width, dimensions.height);
			// The sample carries the track's rotation and flip metadata.
			sample.drawWithFit(scratchContext, { fit: "fill" });
			decodedFrames.set(sample.microsecondTimestamp, scratchCanvas);
			lastDecodedTimestampUs = sample.microsecondTimestamp;
		} finally {
			sample.close();
		}
	}

	function emitDecodedFrame(
		request: PendingScrubFrameRequest,
		actualTimestampUs: MediaTimeUs,
	) {
		if (request.id !== latestRequestId || disposed) {
			return false;
		}

		const canvas = decodedFrames.get(actualTimestampUs);
		if (!canvas) {
			return false;
		}

		onFrame({
			actualTimestampUs,
			canvas,
			requestId: request.id,
			requestedAtMs: request.requestedAtMs,
			timestampUs: request.timestampUs,
		});
		return true;
	}

	async function resolveKeyPacket(timestampSeconds: number) {
		if (!packetSink) {
			return null;
		}
		const indexedTimestamp = keyframeIndex?.floor(timestampSeconds) ?? null;
		return packetSink.getKeyPacket(indexedTimestamp ?? timestampSeconds);
	}

	async function closeSampleIterator() {
		const iterator = sampleIterator;
		sampleIterator = null;
		activeKeySequenceNumber = null;
		lastDecodedTimestampUs = null;
		await iterator?.return();
	}

	async function seedAtKeyPacket(keyPacket: EncodedPacket) {
		await closeSampleIterator();
		sampleIterator = sampleSink?.samples(keyPacket.timestamp) ?? null;
		activeKeySequenceNumber = keyPacket.sequenceNumber;
	}

	async function showCachedExact(request: PendingScrubFrameRequest) {
		if (!packetSink || request.id !== latestRequestId || disposed) {
			return false;
		}
		const targetPacket = await packetSink.getPacket(request.timestampSeconds, {
			metadataOnly: true,
		});
		return targetPacket
			? emitDecodedFrame(request, targetPacket.microsecondTimestamp)
			: false;
	}

	async function showExact(request: PendingScrubFrameRequest) {
		if (!packetSink || request.id !== latestRequestId || disposed) {
			return;
		}
		const targetPacket = await packetSink.getPacket(request.timestampSeconds, {
			metadataOnly: true,
		});
		if (!targetPacket || request.id !== latestRequestId || disposed) {
			return;
		}

		const actualTimestampUs = targetPacket.microsecondTimestamp;
		if (emitDecodedFrame(request, actualTimestampUs)) {
			return;
		}

		const keyPacket = await resolveKeyPacket(request.timestampSeconds);
		if (!keyPacket || request.id !== latestRequestId || disposed) {
			return;
		}
		const canReuseIterator =
			sampleIterator !== null &&
			activeKeySequenceNumber === keyPacket.sequenceNumber &&
			lastDecodedTimestampUs !== null &&
			lastDecodedTimestampUs < actualTimestampUs;
		if (!canReuseIterator) {
			await seedAtKeyPacket(keyPacket);
		}

		let emitted = false;
		let samplesAfterTarget = 0;
		while (
			sampleIterator &&
			request.id === latestRequestId &&
			!disposed &&
			samplesAfterTarget < EXACT_PREFETCH_SAMPLE_COUNT
		) {
			const next = await sampleIterator.next();
			if (next.done) {
				await closeSampleIterator();
				break;
			}
			const timestampUs = next.value.microsecondTimestamp;
			cacheDecodedSample(next.value);
			if (timestampUs >= actualTimestampUs) {
				samplesAfterTarget += 1;
			}
			if (!emitted && timestampUs === actualTimestampUs) {
				emitted = emitDecodedFrame(request, actualTimestampUs);
			}
		}
	}

	async function consumeFrames() {
		const {
			ALL_FORMATS,
			BlobSource,
			EncodedPacketSink,
			Input,
			VideoSampleSink,
		} = await import("mediabunny");
		if (disposed) {
			return;
		}
		if (!scratchContext) {
			throw new Error("Unable to create the scrub preview canvas context.");
		}

		const mediaInput = new Input({
			formats: ALL_FORMATS,
			source: new BlobSource(source, {
				handleUnhandledError: sourceFailure.handleUnhandledError,
			}),
		});
		input = mediaInput;
		try {
			const videoTrack = await mediaInput.getPrimaryVideoTrack();
			if (!videoTrack) {
				throw new Error("The active media asset has no video track to scrub.");
			}
			if (!(await videoTrack.canDecode())) {
				throw new Error(
					"This browser cannot decode the primary video track for scrubbing.",
				);
			}

			packetSink = new EncodedPacketSink(videoTrack);
			keyframeIndex = createKeyframeIndex(new EncodedPacketSink(videoTrack));
			sampleSink = new VideoSampleSink(videoTrack, {
				optimizeForLatency: true,
			});

			while (!disposed) {
				const request = await requestSource.next();
				if (!request) {
					break;
				}
				if (request.phase === "cached") {
					// Retain the displayed image on a miss; decoding keyframes is
					// preparation for the exact target, never a presentation fallback.
					await showCachedExact(request);
				} else {
					await showExact(request);
				}
			}
		} finally {
			await closeSampleIterator();
			mediaInput.dispose();
			if (input === mediaInput) {
				input = null;
			}
		}
	}

	function warm() {
		if (!disposed) {
			running ??= sourceFailure.run(consumeFrames()).catch(reportUnavailable);
		}
	}

	function clearSettleTimer() {
		if (settleTimer !== null) {
			clearTimeout(settleTimer);
			settleTimer = null;
		}
	}

	return {
		dispose() {
			if (disposed) {
				return;
			}
			disposed = true;
			clearSettleTimer();
			requestSource.close();
			decodedFrames.clear();
			scratchCanvas.width = 0;
			scratchCanvas.height = 0;
			input?.dispose();
			input = null;
		},
		requestFrame(timestampUs, options) {
			if (disposed) {
				return latestRequestId;
			}
			latestRequestId += 1;
			clearSettleTimer();
			const priority = options?.priority ?? "final";
			const request: PendingScrubFrameRequest = {
				id: latestRequestId,
				phase: priority === "interactive" ? "cached" : "exact",
				requestedAtMs: previewNowMs(),
				timestampSeconds: Math.max(0, timestampUs / 1_000_000),
				timestampUs,
			};
			requestSource.request(request);
			if (priority === "interactive") {
				settleTimer = setTimeout(() => {
					settleTimer = null;
					if (request.id === latestRequestId && !disposed) {
						requestSource.request({ ...request, phase: "exact" });
					}
				}, EXACT_SETTLE_DELAY_MS);
			}
			warm();
			return latestRequestId;
		},
		warm,
	};
}

export function resolveScrubFrameDimensions({
	displayHeight,
	displayWidth,
	maxOutputDimensionPx = DEFAULT_MAX_OUTPUT_DIMENSION_PX,
}: {
	displayHeight?: number;
	displayWidth?: number;
	maxOutputDimensionPx?: number;
}) {
	const width = usableDimension(displayWidth) ?? 16;
	const height = usableDimension(displayHeight) ?? 9;
	const maxDimension = Math.max(1, Math.round(maxOutputDimensionPx));
	const scale = Math.min(1, maxDimension / Math.max(width, height));

	return {
		height: Math.max(1, Math.round(height * scale)),
		width: Math.max(1, Math.round(width * scale)),
	};
}

class LatestScrubFrameRequestSource {
	private closed = false;
	private pending: PendingScrubFrameRequest | null = null;
	private wake: (() => void) | null = null;

	close() {
		this.closed = true;
		this.pending = null;
		this.wake?.();
		this.wake = null;
	}

	request(request: PendingScrubFrameRequest) {
		if (this.closed) {
			return;
		}
		this.pending = request;
		this.wake?.();
		this.wake = null;
	}

	async next(): Promise<PendingScrubFrameRequest | null> {
		while (!this.closed && !this.pending) {
			await new Promise<void>((resolve) => {
				this.wake = resolve;
			});
		}
		if (this.closed) {
			return null;
		}
		const request = this.pending;
		this.pending = null;
		return request;
	}
}

function createOutputCanvas(width: number, height: number) {
	if (typeof OffscreenCanvas !== "undefined") {
		return new OffscreenCanvas(width, height);
	}
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

function usableDimension(value: number | undefined) {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: undefined;
}

function previewNowMs() {
	return typeof performance !== "undefined" &&
		typeof performance.now === "function"
		? performance.now()
		: Date.now();
}

function errorToMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
