import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
import type { Region } from "wavesurfer.js/dist/plugins/regions.js";
import type { MediaTimeUs, Selection } from "@/editor-core/model";
import { clamp } from "@/lib/clamp";
import type { ActiveMediaAssetCleanupScope } from "../../media-work/scopes/active-media-asset-cleanup-scope";
import { createSynchronousMediaWorkScope } from "../../media-work/scopes/synchronous-media-work-scope";
import {
	mediaTimeToPercent,
	selectionBoundaryTrackStyle,
} from "../timeline/selection-timeline-geometry";
import type { BeginSelectionGesture } from "../timeline/use-selection-gesture";
import type { WaveformSamples } from "../types/selection-waveform-lanes.types";
import { createWavesurferPeaksFromSamples } from "./selection-waveform-surface.peaks";

const WAVEFORM_HEIGHT_PX = 48;
const WAVEFORM_COLOR_FALLBACK = "oklch(0.728857 0.092883 191.748299)";
const WAVEFORM_GUIDE_COLOR_FALLBACK = "oklch(0.554391 0.040717 257.416619)";
const SELECTION_REGION_COLOR = "oklch(0.728857 0.092883 191.748299 / 0.22)";
const SELECTION_REGION_ID = "editor-selection-region";

export type WaveformSurfaceProps = {
	activeMediaAssetCleanupScope?: ActiveMediaAssetCleanupScope;
	durationUs: MediaTimeUs;
	label: string;
	minimumSelectionDurationUs: MediaTimeUs;
	onPlayheadSeekRequested: (playheadUs: MediaTimeUs) => void;
	onSelectionGestureStart: BeginSelectionGesture;
	onSelectionRegionAvailabilityChange?: (available: boolean) => void;
	samples: WaveformSamples;
	selection: Selection;
	selectionEditingDisabled: boolean;
	selectionEditInProgress: boolean;
};

export type WaveformRendererStatus = "fallback" | "loading" | "wavesurfer";

export function WaveformSurface({
	activeMediaAssetCleanupScope,
	durationUs,
	label,
	minimumSelectionDurationUs,
	onPlayheadSeekRequested,
	onSelectionGestureStart,
	onSelectionRegionAvailabilityChange,
	samples,
	selection,
	selectionEditingDisabled,
	selectionEditInProgress,
}: WaveformSurfaceProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const durationSeconds = mediaTimeUsToSeconds(durationUs);
	const peaks = useMemo(
		() => createWavesurferPeaksFromSamples(samples),
		[samples],
	);
	const rendererStatus = useWavesurferWaveform({
		activeMediaAssetCleanupScope,
		containerRef,
		durationSeconds,
		minimumSelectionDurationSeconds: mediaTimeUsToSeconds(
			minimumSelectionDurationUs,
		),
		onPlayheadSeekRequested,
		onSelectionGestureStart,
		onSelectionRegionAvailabilityChange,
		peaks,
		selection,
		selectionEditingDisabled,
		selectionEditInProgress,
	});

	return (
		<div
			aria-label={`${label} waveform detail`}
			className="selection-boundary-track selection-waveform-surface absolute inset-x-0 top-1 bottom-1 h-[calc(100%-0.5rem)] w-full"
			data-renderer={rendererStatus}
			data-sample-count={samples.length}
			style={selectionBoundaryTrackStyle(
				mediaTimeToPercent(selection.startUs, durationUs),
				mediaTimeToPercent(selection.endUs, durationUs),
			)}
		>
			<div
				aria-hidden="true"
				className={`absolute inset-0 ${
					rendererStatus === "wavesurfer"
						? "opacity-100"
						: "pointer-events-none opacity-0"
				}`}
				onMouseDown={(event) => event.stopPropagation()}
				onPointerDown={(event) => event.stopPropagation()}
				ref={containerRef}
			/>
			{rendererStatus !== "wavesurfer" ? (
				<WaveformCanvasFallback samples={samples} />
			) : null}
		</div>
	);
}

function useWavesurferWaveform({
	activeMediaAssetCleanupScope,
	containerRef,
	durationSeconds,
	minimumSelectionDurationSeconds,
	onPlayheadSeekRequested,
	onSelectionGestureStart,
	onSelectionRegionAvailabilityChange,
	peaks,
	selection,
	selectionEditingDisabled,
	selectionEditInProgress,
}: {
	activeMediaAssetCleanupScope?: ActiveMediaAssetCleanupScope;
	containerRef: RefObject<HTMLDivElement | null>;
	durationSeconds: number;
	minimumSelectionDurationSeconds: number;
	onPlayheadSeekRequested: (playheadUs: number) => void;
	onSelectionGestureStart: BeginSelectionGesture;
	onSelectionRegionAvailabilityChange?: (available: boolean) => void;
	peaks: Float32Array;
	selection: Selection;
	selectionEditingDisabled: boolean;
	selectionEditInProgress: boolean;
}): WaveformRendererStatus {
	const [rendererStatus, setRendererStatus] =
		useState<WaveformRendererStatus>("loading");
	const rendererRef = useRef<{
		regions: RegionsPlugin;
		lifecycle: ReturnType<typeof createSynchronousMediaWorkScope>;
		fail: () => void;
	} | null>(null);
	const selectionRegionRef = useRef<Region | null>(null);
	const onPlayheadSeekRequestedRef = useLatestValueRef(onPlayheadSeekRequested);

	useLayoutEffect(() => {
		const container = containerRef.current;
		const lifecycle = createSynchronousMediaWorkScope();

		if (!container) {
			setRendererStatus("fallback");
			return;
		}

		setRendererStatus("loading");
		container.replaceChildren();
		lifecycle.registerCleanup(() => container.replaceChildren());
		lifecycle.registerCleanup(() => {
			const hadSelectionRegion = selectionRegionRef.current !== null;
			selectionRegionRef.current = null;
			rendererRef.current = null;
			if (hadSelectionRegion) onSelectionRegionAvailabilityChange?.(false);
		});
		const registration = activeMediaAssetCleanupScope?.registerCleanup(() =>
			lifecycle.dispose(),
		);
		if (lifecycle.isDisposed()) return;

		function disposeRenderer() {
			if (registration) registration.dispose();
			else lifecycle.dispose();
		}

		function failRenderer() {
			if (lifecycle.isDisposed()) return;
			try {
				disposeRenderer();
			} finally {
				setRendererStatus("fallback");
			}
		}

		void Promise.all([
			import("wavesurfer.js"),
			import("wavesurfer.js/plugins/regions"),
		])
			.then(([{ default: WaveSurferFactory }, { default: RegionsFactory }]) => {
				if (lifecycle.isDisposed()) {
					return;
				}

				const style = getComputedStyle(container);
				const regions = RegionsFactory.create();

				const wavesurfer = WaveSurferFactory.create({
					barGap: 0,
					barRadius: 0,
					barWidth: 1,
					backend: typeof AudioContext === "undefined" ? "WebAudio" : undefined,
					container,
					cursorWidth: 0,
					duration: durationSeconds,
					fillParent: true,
					height: WAVEFORM_HEIGHT_PX,
					hideScrollbar: true,
					interact: true,
					normalize: true,
					peaks: [peaks],
					plugins: [regions],
					progressColor: cssTokenColor(
						style,
						"--workbench-waveform",
						WAVEFORM_COLOR_FALLBACK,
					),
					waveColor: cssTokenColor(
						style,
						"--workbench-waveform",
						WAVEFORM_COLOR_FALLBACK,
					),
				});
				lifecycle.registerCleanup(() => wavesurfer.destroy());
				lifecycle.registerCleanup(
					observeWorkbenchTheme(() => {
						const currentStyle = getComputedStyle(container);
						const color = cssTokenColor(
							currentStyle,
							"--workbench-waveform",
							WAVEFORM_COLOR_FALLBACK,
						);
						wavesurfer.setOptions({ waveColor: color, progressColor: color });
					}),
				);
				rendererRef.current = { regions, lifecycle, fail: failRenderer };
				lifecycle.registerCleanup(wavesurfer.on("error", failRenderer));
				lifecycle.registerCleanup(
					wavesurfer.on("redrawcomplete", () => {
						if (!lifecycle.isDisposed()) {
							setRendererStatus("wavesurfer");
						}
					}),
				);
				lifecycle.registerCleanup(
					wavesurfer.on("click", (relativeX) => {
						if (!lifecycle.isDisposed()) {
							callLatestCallback(
								onPlayheadSeekRequestedRef,
								secondsToMediaTimeUs(relativeX * durationSeconds),
							);
						}
					}),
				);
				lifecycle.registerCleanup(
					regions.on("region-clicked", (_, event) => {
						event.stopPropagation();
					}),
				);
			})
			.catch(failRenderer);

		return disposeRenderer;
	}, [
		activeMediaAssetCleanupScope,
		containerRef,
		durationSeconds,
		onPlayheadSeekRequestedRef,
		onSelectionRegionAvailabilityChange,
		peaks,
	]);

	const regionOptions = useMemo(
		() =>
			createSelectionRegionOptions({
				durationSeconds,
				minimumSelectionDurationSeconds,
				selection,
				selectionEditingDisabled,
			}),
		[
			durationSeconds,
			minimumSelectionDurationSeconds,
			selection,
			selectionEditingDisabled,
		],
	);

	useLayoutEffect(() => {
		const renderer = rendererRef.current;
		const region = selectionRegionRef.current;
		if (!renderer || !region) return;

		try {
			region.setOptions(regionOptions);
		} catch {
			renderer.fail();
		}
	}, [regionOptions]);

	useLayoutEffect(() => {
		const renderer = rendererRef.current;
		if (
			!renderer ||
			rendererStatus !== "wavesurfer" ||
			selectionRegionRef.current ||
			selectionEditInProgress
		) {
			return;
		}

		try {
			const region = renderer.regions.addRegion({
				...regionOptions,
				id: SELECTION_REGION_ID,
				color: SELECTION_REGION_COLOR,
			});
			if (!region.element)
				throw new Error("The Waveform region has no element.");
			renderer.lifecycle.registerCleanup(
				bindWaveformRegionGesture(region.element, onSelectionGestureStart),
			);
			selectionRegionRef.current = region;
			onSelectionRegionAvailabilityChange?.(true);
		} catch {
			renderer.fail();
		}
	}, [
		onSelectionGestureStart,
		onSelectionRegionAvailabilityChange,
		regionOptions,
		rendererStatus,
		selectionEditInProgress,
	]);

	return rendererStatus;
}

function callLatestCallback<TArgs extends unknown[]>(
	callbackRef: RefObject<(...args: TArgs) => void>,
	...args: TArgs
) {
	callbackRef.current(...args);
}

function useLatestValueRef<T>(value: T) {
	const valueRef = useRef(value);

	useEffect(() => {
		valueRef.current = value;
	}, [value]);

	return valueRef;
}

function WaveformCanvasFallback({ samples }: { samples: WaveformSamples }) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);

	useEffect(() => {
		const canvas = canvasRef.current;

		if (!canvas) {
			return;
		}

		const currentCanvas = canvas;

		function drawWaveform() {
			const context = currentCanvas.getContext("2d");

			if (!context) {
				return;
			}

			const rect = currentCanvas.getBoundingClientRect();
			const pixelRatio = window.devicePixelRatio || 1;
			const width = Math.max(1, Math.round(rect.width * pixelRatio));
			const height = Math.max(1, Math.round(rect.height * pixelRatio));
			const centerY = height / 2;

			currentCanvas.width = width;
			currentCanvas.height = height;
			context.clearRect(0, 0, width, height);
			context.fillStyle = canvasTokenColor(
				currentCanvas,
				"--workbench-waveform-guide",
				WAVEFORM_GUIDE_COLOR_FALLBACK,
			);
			context.fillRect(0, centerY - 1, width, 2);
			context.fillStyle = canvasTokenColor(
				currentCanvas,
				"--workbench-waveform",
				WAVEFORM_COLOR_FALLBACK,
			);

			for (let x = 0; x < width; x += 1) {
				const sampleIndex = Math.min(
					samples.length - 1,
					Math.floor((x / width) * samples.length),
				);
				const nextSampleIndex = Math.min(
					samples.length - 1,
					Math.ceil(((x + 1) / width) * samples.length),
				);
				let peak = 0;

				for (let index = sampleIndex; index <= nextSampleIndex; index += 1) {
					peak = Math.max(peak, samples[index] ?? 0);
				}

				const barHeight = Math.max(1, peak * (height - 8));
				context.fillRect(x, centerY - barHeight / 2, 1, barHeight);
			}
		}

		drawWaveform();
		const stopObservingTheme = observeWorkbenchTheme(drawWaveform);

		if (typeof ResizeObserver === "undefined") {
			window.addEventListener("resize", drawWaveform);
			return () => {
				window.removeEventListener("resize", drawWaveform);
				stopObservingTheme();
			};
		}

		const observer = new ResizeObserver(drawWaveform);
		observer.observe(currentCanvas);

		return () => {
			observer.disconnect();
			stopObservingTheme();
		};
	}, [samples]);

	return <canvas className="absolute inset-0 h-full w-full" ref={canvasRef} />;
}

function mediaTimeUsToSeconds(durationUs: number) {
	return Math.max(0.001, durationUs / 1_000_000);
}

function secondsToMediaTimeUs(seconds: number) {
	return Math.round(seconds * 1_000_000);
}

function createSelectionRegionOptions({
	durationSeconds,
	minimumSelectionDurationSeconds,
	selection,
	selectionEditingDisabled,
}: {
	durationSeconds: number;
	minimumSelectionDurationSeconds: number;
	selection: Selection;
	selectionEditingDisabled: boolean;
}) {
	const minimumDurationSeconds = Math.min(
		minimumSelectionDurationSeconds,
		durationSeconds,
	);
	const start = clamp(
		selection.startUs / 1_000_000,
		0,
		Math.max(0, durationSeconds - minimumDurationSeconds),
	);
	const end = clamp(
		selection.endUs / 1_000_000,
		start + minimumDurationSeconds,
		durationSeconds,
	);

	return {
		drag: !selectionEditingDisabled,
		end,
		minLength: minimumDurationSeconds,
		resize: !selectionEditingDisabled,
		resizeEnd: !selectionEditingDisabled,
		resizeStart: !selectionEditingDisabled,
		start,
	};
}

function bindWaveformRegionGesture(
	element: HTMLElement,
	beginGesture: BeginSelectionGesture,
) {
	let cancelGesture: (() => void) | undefined;
	const tracking = new AbortController();
	function start(event: MouseEvent | PointerEvent) {
		// WaveSurfer supplies the region and grip elements. The timeline owns
		// pointer release and cancellation for the Selection they represent.
		event.stopImmediatePropagation();
		const handle =
			event.target instanceof Element
				? event.target.closest('[part~="region-handle"]')
				: null;
		const parts = handle?.getAttribute("part")?.split(/\s+/);
		const kind = parts?.includes("region-handle-left")
			? "start"
			: parts?.includes("region-handle-right")
				? "end"
				: "range";
		cancelGesture =
			beginGesture(event, element, kind, "waveform") ?? cancelGesture;
	}
	const listeners = { capture: true, signal: tracking.signal };
	element.addEventListener("pointerdown", start, listeners);
	if (typeof window.PointerEvent === "undefined")
		element.addEventListener("mousedown", start, listeners);
	return () => {
		tracking.abort();
		cancelGesture?.();
	};
}

function cssTokenColor(
	style: CSSStyleDeclaration,
	tokenName: string,
	fallback: string,
) {
	return style.getPropertyValue(tokenName).trim() || fallback;
}

function canvasTokenColor(
	element: HTMLElement,
	tokenName: string,
	fallback: string,
) {
	return (
		getComputedStyle(element).getPropertyValue(tokenName).trim() || fallback
	);
}

function observeWorkbenchTheme(onChange: () => void): () => void {
	if (typeof MutationObserver === "undefined") return () => {};
	const observer = new MutationObserver(onChange);
	observer.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["class"],
	});
	return () => observer.disconnect();
}
