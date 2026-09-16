import type { EncodedPacket, EncodedPacketSink } from "mediabunny";

import type { MediaTimeUs } from "@/editor-core/model";
import { createKeyframeIndex } from "./keyframe-index";
import { createScrubFrameCache } from "./scrub-frame-cache";

const DEFAULT_MAX_OUTPUT_DIMENSION_PX = 1280;
const EXACT_SETTLE_DELAY_MS = 120;
const EXACT_PREFETCH_PACKET_COUNT = 24;

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

type FrameWaiter = {
	actualTimestampUs: MediaTimeUs;
	promise: Promise<boolean>;
	request: PendingScrubFrameRequest;
	resolve: (rendered: boolean) => void;
	resolved: boolean;
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
	const frameWaiters = new Map<number, Set<FrameWaiter>>();
	let activeKeySequenceNumber: number | null = null;
	let decoder: VideoDecoder | null = null;
	let decoderConfig: VideoDecoderConfig | null = null;
	let disposed = false;
	let input: { dispose: () => void } | null = null;
	let iterator: AsyncGenerator<EncodedPacket, void, unknown> | null = null;
	let keyframeIndex: ReturnType<typeof createKeyframeIndex> | null = null;
	let lastSubmittedPacket: EncodedPacket | null = null;
	let latestRequestId = 0;
	let packetSink: EncodedPacketSink | null = null;
	let running: Promise<void> | null = null;
	let settleTimer: ReturnType<typeof setTimeout> | null = null;
	let trackRotationDegrees = 0;

	function reportUnavailable(error: unknown) {
		if (!disposed) {
			onUnavailable?.(errorToMessage(error));
		}
	}

	function handleDecoderOutput(frame: VideoFrame) {
		try {
			if (!scratchContext || disposed) {
				return;
			}

			drawVideoFrameToOutput({
				context: scratchContext,
				frame,
				height: dimensions.height,
				rotationDegrees: trackRotationDegrees,
				width: dimensions.width,
			});
			decodedFrames.set(frame.timestamp, scratchCanvas);
			const waiters = frameWaiters.get(frame.timestamp);
			if (!waiters) {
				return;
			}

			frameWaiters.delete(frame.timestamp);
			for (const waiter of waiters) {
				const rendered = emitDecodedFrame(
					waiter.request,
					waiter.actualTimestampUs,
				);
				waiter.resolved = true;
				waiter.resolve(rendered);
			}
		} finally {
			frame.close();
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

	function createFrameWaiter(
		actualTimestampUs: MediaTimeUs,
		request: PendingScrubFrameRequest,
	): FrameWaiter {
		let resolvePromise: (rendered: boolean) => void = () => undefined;
		const promise = new Promise<boolean>((resolve) => {
			resolvePromise = resolve;
		});
		const waiter: FrameWaiter = {
			actualTimestampUs,
			promise,
			request,
			resolve: resolvePromise,
			resolved: false,
		};
		let timestampWaiters = frameWaiters.get(actualTimestampUs);
		if (!timestampWaiters) {
			timestampWaiters = new Set();
			frameWaiters.set(actualTimestampUs, timestampWaiters);
		}
		timestampWaiters.add(waiter);
		return waiter;
	}

	function removeFrameWaiter(waiter: FrameWaiter) {
		const waiters = frameWaiters.get(waiter.actualTimestampUs);
		waiters?.delete(waiter);
		if (waiters?.size === 0) {
			frameWaiters.delete(waiter.actualTimestampUs);
		}
		waiter.resolved = true;
		waiter.resolve(false);
	}

	function resolveFrameWaiters(rendered: boolean) {
		for (const waiters of frameWaiters.values()) {
			for (const waiter of waiters) {
				waiter.resolved = true;
				waiter.resolve(rendered);
			}
		}
		frameWaiters.clear();
	}

	function ensureDecoder() {
		if (decoder || !decoderConfig) {
			return;
		}

		decoder = new VideoDecoder({
			error(error) {
				reportUnavailable(error);
				resolveFrameWaiters(false);
			},
			output: handleDecoderOutput,
		});
		decoder.configure(decoderConfig);
	}

	function reseedDecoder() {
		ensureDecoder();
		if (!decoder || !decoderConfig) {
			return;
		}

		if (decoder.state === "configured") {
			decoder.reset();
		}
		decoder.configure(decoderConfig);
		resolveFrameWaiters(false);
		lastSubmittedPacket = null;
	}

	async function decodePacket(packet: EncodedPacket) {
		ensureDecoder();
		if (!decoder || decoder.state !== "configured") {
			return;
		}

		while (decoder.decodeQueueSize > 2 && !disposed) {
			await waitForDecoderDequeue(decoder);
		}
		decoder.decode(packet.toEncodedVideoChunk());
		lastSubmittedPacket = packet;
	}

	async function resolveKeyPacket(timestampSeconds: number) {
		if (!packetSink) {
			return null;
		}
		const indexedTimestamp = keyframeIndex?.floor(timestampSeconds) ?? null;
		return packetSink.getKeyPacket(indexedTimestamp ?? timestampSeconds);
	}

	async function seedAtKeyPacket(keyPacket: EncodedPacket) {
		await iterator?.return();
		iterator = packetSink?.packets(keyPacket) ?? null;
		activeKeySequenceNumber = keyPacket.sequenceNumber;
		reseedDecoder();
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
		const canReuseCursor =
			iterator !== null &&
			decoder?.state === "configured" &&
			activeKeySequenceNumber === keyPacket.sequenceNumber &&
			lastSubmittedPacket !== null &&
			lastSubmittedPacket.sequenceNumber <= targetPacket.sequenceNumber;
		if (!canReuseCursor) {
			await seedAtKeyPacket(keyPacket);
		}
		if (!iterator || request.id !== latestRequestId || disposed) {
			return;
		}
		const targetWaiter = createFrameWaiter(actualTimestampUs, request);

		let passedTarget = false;
		let packetsAfterTarget = 0;
		while (request.id === latestRequestId && !disposed) {
			const next = await iterator.next();
			if (next.done || !next.value) {
				break;
			}
			await decodePacket(next.value);
			if (next.value.sequenceNumber >= targetPacket.sequenceNumber) {
				passedTarget = true;
			}
			if (passedTarget) {
				packetsAfterTarget += 1;
			}
			if (
				targetWaiter.resolved &&
				packetsAfterTarget >= EXACT_PREFETCH_PACKET_COUNT
			) {
				break;
			}
			if (packetsAfterTarget >= EXACT_PREFETCH_PACKET_COUNT * 2) {
				break;
			}
		}
		if (request.id !== latestRequestId || disposed) {
			removeFrameWaiter(targetWaiter);
			return;
		}

		if (!targetWaiter.resolved && decoder) {
			await decoder.flush();
			activeKeySequenceNumber = null;
			await iterator?.return();
			iterator = null;
		}
		if (!targetWaiter.resolved) {
			removeFrameWaiter(targetWaiter);
			return;
		}
		await targetWaiter.promise;
	}

	async function consumeFrames() {
		const { ALL_FORMATS, BlobSource, EncodedPacketSink, Input } = await import(
			"mediabunny"
		);
		if (disposed) {
			return;
		}
		if (!scratchContext) {
			throw new Error("Unable to create the scrub preview canvas context.");
		}

		const mediaInput = new Input({
			formats: ALL_FORMATS,
			source: new BlobSource(source),
		});
		input = mediaInput;
		try {
			const videoTrack = await mediaInput.getPrimaryVideoTrack();
			if (!videoTrack) {
				throw new Error("The active media asset has no video track to scrub.");
			}
			decoderConfig = await videoTrack.getDecoderConfig();
			if (!decoderConfig) {
				throw new Error(
					"The primary video track has no decoder configuration.",
				);
			}
			const support = await VideoDecoder.isConfigSupported(decoderConfig);
			if (!support.supported) {
				throw new Error(
					"This browser cannot decode the primary video track for scrubbing.",
				);
			}

			packetSink = new EncodedPacketSink(videoTrack);
			keyframeIndex = createKeyframeIndex(new EncodedPacketSink(videoTrack));
			trackRotationDegrees = normalizeRotation(await videoTrack.getRotation());
			ensureDecoder();

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
			await iterator?.return();
			iterator = null;
			closeDecoder();
			mediaInput.dispose();
			if (input === mediaInput) {
				input = null;
			}
		}
	}

	function warm() {
		if (!disposed) {
			running ??= consumeFrames().catch(reportUnavailable);
		}
	}

	function clearSettleTimer() {
		if (settleTimer !== null) {
			clearTimeout(settleTimer);
			settleTimer = null;
		}
	}

	function closeDecoder() {
		try {
			if (decoder?.state !== "closed") {
				decoder?.close();
			}
		} catch {
			// Decoder errors may close it before provider cleanup runs.
		}
		decoder = null;
	}

	return {
		dispose() {
			if (disposed) {
				return;
			}
			disposed = true;
			clearSettleTimer();
			requestSource.close();
			resolveFrameWaiters(false);
			decodedFrames.clear();
			scratchCanvas.width = 0;
			scratchCanvas.height = 0;
			closeDecoder();
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

function drawVideoFrameToOutput({
	context,
	frame,
	height,
	rotationDegrees,
	width,
}: {
	context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	frame: VideoFrame;
	height: number;
	rotationDegrees: number;
	width: number;
}) {
	context.clearRect(0, 0, width, height);
	context.save();
	context.translate(width / 2, height / 2);
	context.rotate((rotationDegrees * Math.PI) / 180);
	const swapsDimensions = rotationDegrees % 180 !== 0;
	const drawWidth = swapsDimensions ? height : width;
	const drawHeight = swapsDimensions ? width : height;
	context.drawImage(
		frame,
		-drawWidth / 2,
		-drawHeight / 2,
		drawWidth,
		drawHeight,
	);
	context.restore();
}

function normalizeRotation(rotationDegrees: number) {
	return ((Math.round(rotationDegrees) % 360) + 360) % 360;
}

function waitForDecoderDequeue(decoder: VideoDecoder) {
	return new Promise<void>((resolve) => {
		decoder.addEventListener("dequeue", () => resolve(), { once: true });
	});
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
