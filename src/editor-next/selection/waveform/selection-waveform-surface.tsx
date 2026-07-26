import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
import type { Region, UpdateSide } from "wavesurfer.js/dist/plugins/regions.js";

import type { MediaTimeUs, Selection } from "@/editor-core/model";
import { createPreviewAdapterLifecycle } from "../../preview/lifecycle/preview-adapter-lifecycle";
import type { WaveformSamples } from "../types/selection-waveform-lanes.types";
import type {
	WaveformRegionSelectionChange,
	WaveformRegionUpdateSide,
} from "../types/selection-waveform-surface.types";
import { createWavesurferPeaksFromSamples } from "./selection-waveform-surface.peaks";

const WAVEFORM_HEIGHT_PX = 48;
const WAVEFORM_COLOR_FALLBACK = "#57bab6";
const WAVEFORM_GUIDE_COLOR_FALLBACK = "#64748b";
const SELECTION_REGION_COLOR = "rgba(87, 186, 182, 0.22)";
const SELECTION_REGION_ID = "editor-selection-region";

export type WaveformSurfaceProps = {
	durationUs: MediaTimeUs;
	label: string;
	minimumSelectionDurationUs: MediaTimeUs;
	onPlayheadSeekRequested: (playheadUs: MediaTimeUs) => void;
	onSelectionCommitRequested: (change: WaveformRegionSelectionChange) => void;
	onSelectionPreviewRequested: (change: WaveformRegionSelectionChange) => void;
	samples: WaveformSamples;
	selection: Selection;
	selectionEditingDisabled: boolean;
	selectionEditInProgress: boolean;
};

export type WaveformRendererStatus = "fallback" | "loading" | "wavesurfer";

export function WaveformSurface({
	durationUs,
	label,
	minimumSelectionDurationUs,
	onPlayheadSeekRequested,
	onSelectionCommitRequested,
	onSelectionPreviewRequested,
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
		containerRef,
		durationSeconds,
		minimumSelectionDurationSeconds: mediaTimeUsToSeconds(
			minimumSelectionDurationUs,
		),
		onPlayheadSeekRequested,
		onSelectionCommitRequested,
		onSelectionPreviewRequested,
		peaks,
		selection,
		selectionEditingDisabled,
		selectionEditInProgress,
	});

	return (
		<div
			aria-label={`${label} waveform detail`}
			className="selection-waveform-surface absolute inset-x-0 top-1 bottom-1 h-[calc(100%-0.5rem)] w-full"
			data-renderer={rendererStatus}
			data-sample-count={samples.length}
		>
			<div
				aria-hidden="true"
				className={`absolute inset-0 ${
					rendererStatus === "wavesurfer" ? "opacity-100" : "opacity-0"
				}`}
				ref={containerRef}
			/>
			{rendererStatus !== "wavesurfer" ? (
				<WaveformCanvasFallback samples={samples} />
			) : null}
		</div>
	);
}

function useWavesurferWaveform({
	containerRef,
	durationSeconds,
	minimumSelectionDurationSeconds,
	onPlayheadSeekRequested,
	onSelectionCommitRequested,
	onSelectionPreviewRequested,
	peaks,
	selection,
	selectionEditingDisabled,
	selectionEditInProgress,
}: {
	containerRef: RefObject<HTMLDivElement | null>;
	durationSeconds: number;
	minimumSelectionDurationSeconds: number;
	onPlayheadSeekRequested: (playheadUs: number) => void;
	onSelectionCommitRequested: (change: WaveformRegionSelectionChange) => void;
	onSelectionPreviewRequested: (change: WaveformRegionSelectionChange) => void;
	peaks: Float32Array;
	selection: Selection;
	selectionEditingDisabled: boolean;
	selectionEditInProgress: boolean;
}): WaveformRendererStatus {
	const [rendererStatus, setRendererStatus] =
		useState<WaveformRendererStatus>("loading");
	const regionsRef = useRef<RegionsPlugin | null>(null);
	const selectionRegionRef = useRef<Region | null>(null);
	const selectionRef = useRef(selection);
	const regionUpdateInitialSelectionRef = useRef<Selection | null>(null);
	const pendingRegionChangeRef = useRef<WaveformRegionSelectionChange | null>(
		null,
	);
	const regionPreviewFrameRef = useRef<number | null>(null);
	const syncingRegionRef = useRef(false);
	const onPlayheadSeekRequestedRef = useLatestValueRef(onPlayheadSeekRequested);
	const onSelectionCommitRequestedRef = useLatestValueRef(
		onSelectionCommitRequested,
	);
	const onSelectionPreviewRequestedRef = useLatestValueRef(
		onSelectionPreviewRequested,
	);
	const [regionSuppressed, setRegionSuppressed] = useState(
		selectionEditInProgress,
	);

	useEffect(() => {
		selectionRef.current = selection;
	}, [selection]);

	useEffect(() => {
		if (!selectionEditInProgress) {
			setRegionSuppressed(false);
		}
	}, [selectionEditInProgress]);

	useEffect(() => {
		const container = containerRef.current;
		const lifecycle = createPreviewAdapterLifecycle();
		let regionPreviewFrameCleanup: { dispose: () => void } | null = null;

		if (!container) {
			setRendererStatus("fallback");
			return;
		}

		setRendererStatus("loading");
		lifecycle.registerContainerClear(container);
		lifecycle.registerCleanup(() => {
			clearScheduledRegionPreviewFrame();
			pendingRegionChangeRef.current = null;
			selectionRegionRef.current = null;
			regionsRef.current = null;
		});

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
				regionsRef.current = regions;
				lifecycle.registerCleanup(() => {
					if (regionsRef.current === regions) {
						regionsRef.current = null;
					}
				});

				const wavesurfer = lifecycle.registerDestroyable(
					WaveSurferFactory.create({
						barGap: 0,
						barRadius: 0,
						barWidth: 1,
						backend:
							typeof AudioContext === "undefined" ? "WebAudio" : undefined,
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
					}),
				);
				lifecycle.registerUnsubscribe(
					wavesurfer.on("error", () => {
						if (!lifecycle.isDisposed()) {
							setRendererStatus("fallback");
						}
					}),
				);
				lifecycle.registerUnsubscribe(
					wavesurfer.on("redrawcomplete", () => {
						if (!lifecycle.isDisposed()) {
							setRendererStatus("wavesurfer");
						}
					}),
				);
				lifecycle.registerUnsubscribe(
					wavesurfer.on("click", (relativeX) => {
						if (!lifecycle.isDisposed()) {
							callLatestCallback(
								onPlayheadSeekRequestedRef,
								secondsToMediaTimeUs(relativeX * durationSeconds),
							);
						}
					}),
				);
				lifecycle.registerUnsubscribe(
					regions.on("region-clicked", (_, event) => {
						event.stopPropagation();
					}),
				);
				lifecycle.registerUnsubscribe(
					regions.on("region-update", (region, side) => {
						if (lifecycle.isDisposed() || syncingRegionRef.current) {
							return;
						}

						if (region !== selectionRegionRef.current) {
							return;
						}

						const change = createRegionSelectionChange({
							initialSelection:
								regionUpdateInitialSelectionRef.current ?? selectionRef.current,
							region,
							side,
						});
						regionUpdateInitialSelectionRef.current = change.initialSelection;
						scheduleRegionPreview(change);
					}),
				);
				lifecycle.registerUnsubscribe(
					regions.on("region-updated", (region, side) => {
						if (lifecycle.isDisposed() || syncingRegionRef.current) {
							return;
						}

						if (region !== selectionRegionRef.current) {
							return;
						}

						const change = createRegionSelectionChange({
							initialSelection:
								regionUpdateInitialSelectionRef.current ?? selectionRef.current,
							region,
							side,
						});
						flushRegionPreview(change);
						callLatestCallback(onSelectionCommitRequestedRef, change);
						regionUpdateInitialSelectionRef.current = null;
					}),
				);
			})
			.catch(() => {
				if (!lifecycle.isDisposed()) {
					regionsRef.current = null;
					selectionRegionRef.current = null;
					setRendererStatus("fallback");
				}
			});

		function scheduleRegionPreview(change: WaveformRegionSelectionChange) {
			pendingRegionChangeRef.current = change;

			if (regionPreviewFrameRef.current !== null) {
				return;
			}

			let frameFired = false;
			let frameId: number | null = null;
			frameId = requestWaveformFrame(() => {
				frameFired = true;
				regionPreviewFrameCleanup?.dispose();
				regionPreviewFrameCleanup = null;
				regionPreviewFrameRef.current = null;
				const pendingChange = pendingRegionChangeRef.current;
				pendingRegionChangeRef.current = null;

				if (pendingChange) {
					callLatestCallback(onSelectionPreviewRequestedRef, pendingChange);
				}
			});

			const scheduledFrameId = frameId;
			if (!frameFired && scheduledFrameId !== null) {
				regionPreviewFrameRef.current = scheduledFrameId;
				regionPreviewFrameCleanup = lifecycle.registerAnimationFrame(
					scheduledFrameId,
					cancelWaveformFrame,
				);
			}
		}

		function flushRegionPreview(change: WaveformRegionSelectionChange) {
			clearScheduledRegionPreviewFrame();
			pendingRegionChangeRef.current = null;
			callLatestCallback(onSelectionPreviewRequestedRef, change);
		}

		function clearScheduledRegionPreviewFrame() {
			if (regionPreviewFrameCleanup) {
				regionPreviewFrameCleanup.dispose();
				regionPreviewFrameCleanup = null;
				regionPreviewFrameRef.current = null;
				return;
			}

			if (regionPreviewFrameRef.current !== null) {
				cancelWaveformFrame(regionPreviewFrameRef.current);
				regionPreviewFrameRef.current = null;
			}
		}

		return () => {
			lifecycle.dispose();
		};
	}, [
		containerRef,
		durationSeconds,
		onPlayheadSeekRequestedRef,
		onSelectionCommitRequestedRef,
		onSelectionPreviewRequestedRef,
		peaks,
	]);

	useEffect(() => {
		const regions = regionsRef.current;

		if (!regions || rendererStatus !== "wavesurfer" || regionSuppressed) {
			return;
		}

		const nextRegionOptions = createSelectionRegionOptions({
			durationSeconds,
			minimumSelectionDurationSeconds,
			selection,
			selectionEditingDisabled,
		});
		const existingRegion = selectionRegionRef.current;

		syncingRegionRef.current = true;
		try {
			if (existingRegion) {
				existingRegion.setOptions(nextRegionOptions);
			} else {
				selectionRegionRef.current = regions.addRegion({
					...nextRegionOptions,
					id: SELECTION_REGION_ID,
					color: SELECTION_REGION_COLOR,
				});
			}
		} finally {
			syncingRegionRef.current = false;
		}
	}, [
		durationSeconds,
		minimumSelectionDurationSeconds,
		regionSuppressed,
		rendererStatus,
		selection,
		selectionEditingDisabled,
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

		if (typeof ResizeObserver === "undefined") {
			window.addEventListener("resize", drawWaveform);
			return () => {
				window.removeEventListener("resize", drawWaveform);
			};
		}

		const observer = new ResizeObserver(drawWaveform);
		observer.observe(currentCanvas);

		return () => {
			observer.disconnect();
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
	const start = clampTimeSeconds(
		selection.startUs / 1_000_000,
		0,
		Math.max(0, durationSeconds - minimumDurationSeconds),
	);
	const end = clampTimeSeconds(
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

function clampTimeSeconds(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

function createRegionSelectionChange({
	initialSelection,
	region,
	side,
}: {
	initialSelection: Selection;
	region: Region;
	side: UpdateSide | undefined;
}): WaveformRegionSelectionChange {
	return {
		initialSelection,
		selection: {
			endUs: secondsToMediaTimeUs(region.end),
			startUs: secondsToMediaTimeUs(region.start),
		},
		side: regionUpdateSide(side),
	};
}

function regionUpdateSide(
	side: UpdateSide | undefined,
): WaveformRegionUpdateSide {
	if (side === "start" || side === "end") {
		return side;
	}

	return "range";
}

function requestWaveformFrame(callback: () => void): number {
	if (typeof window.requestAnimationFrame === "function") {
		return window.requestAnimationFrame(callback);
	}

	return window.setTimeout(callback, 16);
}

function cancelWaveformFrame(frameId: number) {
	if (typeof window.cancelAnimationFrame === "function") {
		window.cancelAnimationFrame(frameId);
		return;
	}

	window.clearTimeout(frameId);
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
