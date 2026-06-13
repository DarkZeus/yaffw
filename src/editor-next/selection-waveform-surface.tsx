import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type WaveSurfer from "wavesurfer.js";
import type RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
import type { Region, UpdateSide } from "wavesurfer.js/dist/plugins/regions.js";

import type { Selection } from "@/editor-core/model";
import type {
	WaveformRegionSelectionChange,
	WaveformRegionUpdateSide,
	WaveformRendererStatus,
	WaveformSurfaceProps,
} from "./selection-waveform-surface.types";

const WAVEFORM_HEIGHT_PX = 40;
const WAVEFORM_COLOR_FALLBACK = "#57bab6";
const WAVEFORM_GUIDE_COLOR_FALLBACK = "#64748b";
const SELECTION_REGION_COLOR = "rgba(87, 186, 182, 0.22)";
const SELECTION_REGION_ID = "editor-selection-region";

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
			className="selection-waveform-surface absolute inset-x-0 top-3 bottom-3 h-[calc(100%-1.5rem)] w-full"
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

export function createWavesurferPeaksFromSamples(samples: number[]) {
	if (samples.length === 0) {
		return new Float32Array([0]);
	}

	return Float32Array.from(samples, (sample) => clampAmplitude(sample));
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

		if (!container) {
			setRendererStatus("fallback");
			return;
		}

		let disposed = false;
		let wavesurfer: WaveSurfer | null = null;
		let regions: RegionsPlugin | null = null;
		let unsubscribeError: (() => void) | undefined;
		let unsubscribeRedrawComplete: (() => void) | undefined;
		let unsubscribeClick: (() => void) | undefined;
		let unsubscribeRegionClicked: (() => void) | undefined;
		let unsubscribeRegionUpdate: (() => void) | undefined;
		let unsubscribeRegionUpdated: (() => void) | undefined;

		setRendererStatus("loading");
		container.replaceChildren();

		void Promise.all([
			import("wavesurfer.js"),
			import("wavesurfer.js/plugins/regions"),
		])
			.then(([{ default: WaveSurferFactory }, { default: RegionsFactory }]) => {
				if (disposed) {
					return;
				}

				const style = getComputedStyle(container);
				regions = RegionsFactory.create();

				wavesurfer = WaveSurferFactory.create({
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
				regionsRef.current = regions;
				unsubscribeError = wavesurfer.on("error", () => {
					if (!disposed) {
						setRendererStatus("fallback");
					}
				});
				unsubscribeRedrawComplete = wavesurfer.on("redrawcomplete", () => {
					if (!disposed) {
						setRendererStatus("wavesurfer");
					}
				});
				unsubscribeClick = wavesurfer.on("click", (relativeX) => {
					if (!disposed) {
						callLatestCallback(
							onPlayheadSeekRequestedRef,
							secondsToMediaTimeUs(relativeX * durationSeconds),
						);
					}
				});
				unsubscribeRegionClicked = regions.on("region-clicked", (_, event) => {
					event.stopPropagation();
				});
				unsubscribeRegionUpdate = regions.on(
					"region-update",
					(region, side) => {
						if (disposed || syncingRegionRef.current) {
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
					},
				);
				unsubscribeRegionUpdated = regions.on(
					"region-updated",
					(region, side) => {
						if (disposed || syncingRegionRef.current) {
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
					},
				);
			})
			.catch(() => {
				if (!disposed) {
					setRendererStatus("fallback");
				}
			});

		function scheduleRegionPreview(change: WaveformRegionSelectionChange) {
			pendingRegionChangeRef.current = change;

			if (regionPreviewFrameRef.current !== null) {
				return;
			}

			regionPreviewFrameRef.current = requestWaveformFrame(() => {
				regionPreviewFrameRef.current = null;
				const pendingChange = pendingRegionChangeRef.current;
				pendingRegionChangeRef.current = null;

				if (pendingChange) {
					callLatestCallback(onSelectionPreviewRequestedRef, pendingChange);
				}
			});
		}

		function flushRegionPreview(change: WaveformRegionSelectionChange) {
			if (regionPreviewFrameRef.current !== null) {
				cancelWaveformFrame(regionPreviewFrameRef.current);
				regionPreviewFrameRef.current = null;
			}

			pendingRegionChangeRef.current = null;
			callLatestCallback(onSelectionPreviewRequestedRef, change);
		}

		return () => {
			disposed = true;
			unsubscribeError?.();
			unsubscribeRedrawComplete?.();
			unsubscribeClick?.();
			unsubscribeRegionClicked?.();
			unsubscribeRegionUpdate?.();
			unsubscribeRegionUpdated?.();
			if (regionPreviewFrameRef.current !== null) {
				cancelWaveformFrame(regionPreviewFrameRef.current);
				regionPreviewFrameRef.current = null;
			}
			pendingRegionChangeRef.current = null;
			selectionRegionRef.current = null;
			regionsRef.current = null;
			wavesurfer?.destroy();
			container.replaceChildren();
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

function WaveformCanvasFallback({ samples }: { samples: number[] }) {
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

function clampAmplitude(sample: number) {
	if (!Number.isFinite(sample) || sample <= 0) {
		return 0;
	}

	if (sample >= 1) {
		return 1;
	}

	return sample;
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
