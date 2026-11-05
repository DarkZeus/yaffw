import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from "mediabunny";
import type {
	ScrubFrame,
	ScrubFrameProviderRequest,
} from "../../src/editor-next/preview/scrub/mediabunny-scrub-frame-provider";

type Probe = {
	bytes: number;
	reads: number;
	indexEntries: number;
	indexComplete: boolean;
	ready: boolean;
};
declare global {
	var __scrubProbe: Probe;
}
const delay = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function compare({
	base64,
	variant,
	preparation,
	duration,
}: { base64: string; variant: string; preparation: string; duration: number }) {
	const probe: Probe = {
		bytes: 0,
		reads: 0,
		indexEntries: 0,
		indexComplete: false,
		ready: false,
	};
	globalThis.__scrubProbe = probe;
	const modulePath = `/tmp/scrub-index/${variant}.ts`;
	const { createMediabunnyScrubFrameProvider } = await import(
		/* @vite-ignore */ modulePath
	);
	const source = new Blob([
		Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
	]);
	let deliver: ((frame: ScrubFrame) => void) | null = null;
	let failure: ((error: Error) => void) | null = null;
	let afterDispose = 0;
	let disposed = false;
	const provider = createMediabunnyScrubFrameProvider({
		source,
		displayWidth: 160,
		displayHeight: 90,
		frameDurationUs: 100_000,
		onFrame(frame) {
			if (disposed) afterDispose++;
			else deliver?.(frame);
		},
		onUnavailable(reason) {
			failure?.(new Error(reason));
		},
	} satisfies ScrubFrameProviderRequest);
	const started = performance.now();
	provider.warm();
	while (!probe.ready) {
		if (performance.now() - started > 20000) throw new Error("Warm timeout");
		await delay(1);
	}
	const readyMs = performance.now() - started;
	if (preparation === "prepared") {
		while (variant === "indexed" && !probe.indexComplete) {
			if (performance.now() - started > 30000) throw new Error("Index timeout");
			await delay(5);
		}
		await delay(200);
	}
	const preparedMs = performance.now() - started;
	const preparationWork = { ...probe };
	const frames = [];
	async function request(target: number) {
		const startedAt = performance.now();
		const beforeBytes = probe.bytes;
		const frame = await new Promise<ScrubFrame>((resolve, reject) => {
			const timeout = setTimeout(
				() => reject(new Error(`Frame timeout ${target}`)),
				30000,
			);
			deliver = (frame) => {
				clearTimeout(timeout);
				resolve(frame);
			};
			failure = (error) => {
				clearTimeout(timeout);
				reject(error);
			};
			provider.requestFrame(Math.round(target * 1e6), { priority: "final" });
		});
		return {
			target,
			actualTimestampUs: frame.actualTimestampUs,
			timestampUs: frame.timestampUs,
			elapsedMs: performance.now() - startedAt,
			bytes: probe.bytes - beforeBytes,
			pixels: fingerprint(frame.canvas),
		};
	}
	try {
		for (const target of [
			duration - 1.17,
			duration - 1.07,
			duration - 1.17,
			20.13,
			0.13,
			duration - 11.17,
		])
			frames.push(await request(target));
		const reversalFrames: Array<{
			timestampUs: number;
			actualTimestampUs: number;
		}> = [];
		deliver = (frame) =>
			reversalFrames.push({
				timestampUs: frame.timestampUs,
				actualTimestampUs: frame.actualTimestampUs,
			});
		provider.requestFrame(1_130_000);
		provider.requestFrame(Math.round((duration - 20.17) * 1e6));
		provider.requestFrame(2_130_000);
		provider.requestFrame(Math.round((duration - 1.37) * 1e6));
		const reversalStart = performance.now();
		while (!reversalFrames.length) {
			if (performance.now() - reversalStart > 30000)
				throw new Error("Reversal timeout");
			await delay(5);
		}
		await delay(100);
		provider.requestFrame(10_130_000);
		disposed = true;
		provider.dispose();
		await delay(100);
		const reference = new Input({
			formats: ALL_FORMATS,
			source: new BlobSource(source),
		});
		try {
			const track = await reference.getPrimaryVideoTrack();
			if (!track) throw new Error("No reference video");
			const sink = new VideoSampleSink(track);
			for (const frame of frames) {
				const sample = await sink.getSample(frame.target);
				if (!sample) throw new Error("No reference sample");
				try {
					const canvas = new OffscreenCanvas(160, 90);
					const context = canvas.getContext("2d");
					if (!context) throw new Error("No reference context");
					sample.drawWithFit(context, { fit: "fill" });
					if (fingerprint(canvas) !== frame.pixels)
						throw new Error(`Wrong pixels at ${frame.target}`);
				} finally {
					sample.close();
				}
			}
		} finally {
			reference.dispose();
		}
		return {
			readyMs,
			preparedMs,
			preparationWork,
			frames,
			reversalFrames,
			afterDispose,
			totalWork: { ...probe },
		};
	} finally {
		provider.dispose();
	}
}

function fingerprint(canvas: HTMLCanvasElement | OffscreenCanvas) {
	const context = canvas.getContext("2d") as
		| CanvasRenderingContext2D
		| OffscreenCanvasRenderingContext2D
		| null;
	if (!context) throw new Error("Missing canvas context");
	let hash = 2166136261;
	for (const byte of context.getImageData(0, 0, canvas.width, canvas.height)
		.data)
		hash = Math.imul(hash ^ byte, 16777619);
	return hash >>> 0;
}

/** Verify the displayed app overlay, not just the provider callback or playhead. */
export async function checkDisplayedFrame(base64: string) {
	const text =
		document.querySelector('[aria-label="Preview playhead time"]')
			?.textContent || "";
	const target = text
		.split(":")
		.reduce((total, part) => total * 60 + Number(part), 0);
	const source = new Blob([
		Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)),
	]);
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(source),
	});
	try {
		const track = await input.getPrimaryVideoTrack();
		if (!track) throw new Error("No reference video");
		const sample = await new VideoSampleSink(track).getSample(target);
		if (!sample) throw new Error("No reference frame");
		let expected: number;
		const actualTimestampUs = sample.microsecondTimestamp;
		try {
			const reference = new OffscreenCanvas(160, 90);
			const context = reference.getContext("2d");
			if (!context) throw new Error("No reference context");
			sample.drawWithFit(context, { fit: "fill" });
			expected = fingerprint(reference);
		} finally {
			sample.close();
		}
		const started = performance.now();
		while (performance.now() - started < 10000) {
			const canvas = document.querySelector<HTMLCanvasElement>(
				'[data-testid="scrub-preview-canvas"]',
			);
			if (
				canvas &&
				getComputedStyle(canvas).display !== "none" &&
				canvas.width === 160 &&
				canvas.height === 90 &&
				fingerprint(canvas) === expected
			) {
				return { target, actualTimestampUs, pixels: expected, visible: true };
			}
			await delay(10);
		}
		throw new Error(`Displayed Preview frame did not match ${target}`);
	} finally {
		input.dispose();
	}
}
