import { LocateFixed, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from "mediabunny";
import {
	type MouseEvent as ReactMouseEvent,
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
	AudioMediaTrack,
	MediaTimeUs,
	ReadyMediaAsset,
	Selection,
} from "@/editor-core/model";
import {
	moveSelectionRangeByDelta,
	setSelectionEndFromPlayhead,
	setSelectionStartFromPlayhead,
} from "@/editor-core/selection";

type SelectionTimelineProps = {
	asset: ReadyMediaAsset;
	onPlayheadSeekRequested: (playheadUs: MediaTimeUs) => void;
	onSelectionEndCommitRequested: (playheadUs: MediaTimeUs) => void;
	onSelectionRangeMoveRequested: (deltaUs: MediaTimeUs) => void;
	onSelectionResetRequested: () => void;
	onSelectionStartCommitRequested: (playheadUs: MediaTimeUs) => void;
	playheadUs: MediaTimeUs;
	playheadUpdatesAreLive?: boolean;
	selection: Selection;
	selectionEditingDisabled?: boolean;
	source: Blob;
	waveformLaneLoader?: WaveformLaneLoader;
};

type DragState =
	| {
			type: "playhead";
	  }
	| {
			initialSelection: Selection;
			type: "end";
	  }
	| {
			initialSelection: Selection;
			startClientX: number;
			type: "range";
	  }
	| {
			initialSelection: Selection;
			type: "start";
	  };

type WaveformLaneLoader = (
	request: WaveformLaneRequest,
) => Promise<WaveformLaneResult>;

type WaveformLaneRequest = {
	assetDurationUs: MediaTimeUs;
	source: Blob;
	track: AudioMediaTrack;
	trackIndex: number;
};

type WaveformLaneResult =
	| {
			samples: number[];
			status: "ready";
	  }
	| {
			reason: string;
			status: "unavailable";
	  };

type WaveformLaneState = {
	track: AudioMediaTrack;
} & (
	| {
			status: "loading";
	  }
	| {
			samples: number[];
			status: "ready";
	  }
	| {
			reason: string;
			status: "unavailable";
	  }
);

const WAVEFORM_SAMPLE_COUNT = 8192;
const MINIMUM_ZOOM = 1;
const MAXIMUM_ZOOM = 4;

export function SelectionTimeline({
	asset,
	onPlayheadSeekRequested,
	onSelectionEndCommitRequested,
	onSelectionRangeMoveRequested,
	onSelectionResetRequested,
	onSelectionStartCommitRequested,
	playheadUs,
	playheadUpdatesAreLive = false,
	selection,
	selectionEditingDisabled = false,
	source,
	waveformLaneLoader = loadBrowserWaveformLane,
}: SelectionTimelineProps) {
	const trackRef = useRef<HTMLDivElement | null>(null);
	const scrollContainerRef = useRef<HTMLDivElement | null>(null);
	const dragAnimationFrameRef = useRef<number | null>(null);
	const latestDragClientXRef = useRef<number | null>(null);
	const [dragState, setDragState] = useState<DragState | null>(null);
	const [draftPlayheadUs, setDraftPlayheadUs] = useState<MediaTimeUs | null>(
		null,
	);
	const [draftSelection, setDraftSelection] = useState<Selection | null>(null);
	const [playheadFollowEnabled, setPlayheadFollowEnabled] = useState(false);
	const [zoom, setZoom] = useState(1);
	const laneStates = useWaveformLaneStates({
		asset,
		source,
		waveformLaneLoader,
	});
	const visibleSelection = draftSelection ?? selection;
	const selectionContext = useMemo(
		() => ({
			durationUs: asset.durationUs,
			frameTiming: asset.frameTiming,
		}),
		[asset.durationUs, asset.frameTiming],
	);
	const timeMarkers = useMemo(
		() => createTimeMarkers(asset.durationUs, zoom),
		[asset.durationUs, zoom],
	);

	useEffect(() => {
		if (!dragState) {
			return;
		}

		function applyDragMove(clientX: number) {
			if (!dragState) {
				return;
			}

			if (dragState.type === "playhead") {
				const nextPlayheadUs = mediaTimeFromClientX(
					clientX,
					trackRef.current,
					asset.durationUs,
				);
				setDraftPlayheadUs(nextPlayheadUs);
				onPlayheadSeekRequested(nextPlayheadUs);
				return;
			}

			if (dragState.type === "start") {
				const nextSelection = setSelectionStartFromPlayhead(
					dragState.initialSelection,
					mediaTimeFromClientX(clientX, trackRef.current, asset.durationUs),
					selectionContext,
				);
				setDraftSelection(nextSelection);
				onPlayheadSeekRequested(nextSelection.startUs);
				return;
			}

			if (dragState.type === "end") {
				const nextSelection = setSelectionEndFromPlayhead(
					dragState.initialSelection,
					mediaTimeFromClientX(clientX, trackRef.current, asset.durationUs),
					selectionContext,
				);
				setDraftSelection(nextSelection);
				onPlayheadSeekRequested(nextSelection.endUs);
				return;
			}

			const deltaUs = mediaDeltaFromClientX(
				clientX,
				dragState.startClientX,
				trackRef.current,
				asset.durationUs,
			);
			setDraftSelection(
				moveSelectionRangeByDelta(
					dragState.initialSelection,
					deltaUs,
					selectionContext,
				),
			);
		}

		function handlePointerMove(event: MouseEvent | PointerEvent) {
			if (!dragState) {
				return;
			}

			latestDragClientXRef.current = event.clientX;

			if (dragAnimationFrameRef.current !== null) {
				return;
			}

			dragAnimationFrameRef.current = requestTimelineFrame(() => {
				dragAnimationFrameRef.current = null;
				const latestClientX = latestDragClientXRef.current;

				if (latestClientX === null) {
					return;
				}

				applyDragMove(latestClientX);
			});
		}

		function handlePointerUp(event: MouseEvent | PointerEvent) {
			if (!dragState) {
				return;
			}

			if (dragAnimationFrameRef.current !== null) {
				cancelTimelineFrame(dragAnimationFrameRef.current);
				dragAnimationFrameRef.current = null;
			}
			latestDragClientXRef.current = null;

			if (dragState.type === "playhead") {
				const nextPlayheadUs = mediaTimeFromClientX(
					event.clientX,
					trackRef.current,
					asset.durationUs,
				);
				onPlayheadSeekRequested(nextPlayheadUs);
			}

			if (dragState.type === "start") {
				const nextSelection = setSelectionStartFromPlayhead(
					dragState.initialSelection,
					mediaTimeFromClientX(
						event.clientX,
						trackRef.current,
						asset.durationUs,
					),
					selectionContext,
				);
				onPlayheadSeekRequested(nextSelection.startUs);
				onSelectionStartCommitRequested(nextSelection.startUs);
			}

			if (dragState.type === "end") {
				const nextSelection = setSelectionEndFromPlayhead(
					dragState.initialSelection,
					mediaTimeFromClientX(
						event.clientX,
						trackRef.current,
						asset.durationUs,
					),
					selectionContext,
				);
				onPlayheadSeekRequested(nextSelection.endUs);
				onSelectionEndCommitRequested(nextSelection.endUs);
			}

			if (dragState.type === "range") {
				onSelectionRangeMoveRequested(
					mediaDeltaFromClientX(
						event.clientX,
						dragState.startClientX,
						trackRef.current,
						asset.durationUs,
					),
				);
			}

			setDraftSelection(null);
			setDraftPlayheadUs(null);
			setDragState(null);
		}

		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", handlePointerUp);
		window.addEventListener("mousemove", handlePointerMove);
		window.addEventListener("mouseup", handlePointerUp);

		return () => {
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", handlePointerUp);
			window.removeEventListener("mousemove", handlePointerMove);
			window.removeEventListener("mouseup", handlePointerUp);
			if (dragAnimationFrameRef.current !== null) {
				cancelTimelineFrame(dragAnimationFrameRef.current);
				dragAnimationFrameRef.current = null;
			}
			latestDragClientXRef.current = null;
			setDraftPlayheadUs(null);
		};
	}, [
		asset.durationUs,
		dragState,
		onPlayheadSeekRequested,
		onSelectionEndCommitRequested,
		onSelectionRangeMoveRequested,
		onSelectionStartCommitRequested,
		selectionContext,
	]);

	function beginHandleDrag(
		event:
			| ReactMouseEvent<HTMLButtonElement>
			| ReactPointerEvent<HTMLButtonElement>,
		type: "end" | "start",
	) {
		event.preventDefault();
		event.stopPropagation();
		if (selectionEditingDisabled) {
			return;
		}
		setDraftSelection(selection);
		setDragState({
			initialSelection: selection,
			type,
		});
	}

	function beginPlayheadDrag(
		event:
			| ReactMouseEvent<HTMLButtonElement>
			| ReactPointerEvent<HTMLButtonElement>,
	) {
		event.preventDefault();
		event.stopPropagation();
		setDraftPlayheadUs(
			mediaTimeFromClientX(event.clientX, trackRef.current, asset.durationUs),
		);
		setDragState({
			type: "playhead",
		});
	}

	function beginRangeDrag(
		event:
			| ReactMouseEvent<HTMLButtonElement>
			| ReactPointerEvent<HTMLButtonElement>,
	) {
		event.preventDefault();
		event.stopPropagation();
		if (selectionEditingDisabled) {
			return;
		}
		setDraftSelection(selection);
		setDragState({
			initialSelection: selection,
			startClientX: event.clientX,
			type: "range",
		});
	}

	function seekFromLanePointer(
		event:
			| ReactMouseEvent<HTMLButtonElement>
			| ReactPointerEvent<HTMLButtonElement>,
	) {
		onPlayheadSeekRequested(
			mediaTimeFromClientX(event.clientX, trackRef.current, asset.durationUs),
		);
	}

	function shouldUseMouseFallback() {
		return typeof window.PointerEvent === "undefined";
	}

	const selectionStartPercent = mediaTimeToPercent(
		visibleSelection.startUs,
		asset.durationUs,
	);
	const selectionEndPercent = mediaTimeToPercent(
		visibleSelection.endUs,
		asset.durationUs,
	);
	const playheadPercent = mediaTimeToPercent(
		draftPlayheadUs ?? playheadUs,
		asset.durationUs,
	);
	const selectionMotionClassName =
		dragState === null
			? "transition-[left,width] duration-200 ease-out motion-reduce:transition-none"
			: "transition-none";
	const playheadMotionClassName =
		dragState === null && !playheadUpdatesAreLive
			? "transition-[left] duration-100 ease-linear motion-reduce:transition-none"
			: "transition-none";
	const centerPlayheadInScrollContainer = useCallback(
		(behavior: ScrollBehavior) => {
			const scrollContainer = scrollContainerRef.current;
			const track = trackRef.current;

			if (!scrollContainer || !track) {
				return;
			}

			const maxScrollLeft =
				scrollContainer.scrollWidth - scrollContainer.clientWidth;

			if (maxScrollLeft <= 0) {
				return;
			}

			const trackWidth =
				track.getBoundingClientRect().width ||
				scrollContainer.clientWidth * zoom ||
				scrollContainer.scrollWidth;
			const playheadCenterX = (playheadPercent / 100) * trackWidth;
			const nextScrollLeft = clamp(
				playheadCenterX - scrollContainer.clientWidth / 2,
				0,
				maxScrollLeft,
			);

			if (Math.abs(scrollContainer.scrollLeft - nextScrollLeft) < 0.5) {
				return;
			}

			if (typeof scrollContainer.scrollTo === "function") {
				scrollContainer.scrollTo({
					behavior,
					left: nextScrollLeft,
				});
				return;
			}

			scrollContainer.scrollLeft = nextScrollLeft;
		},
		[playheadPercent, zoom],
	);

	useEffect(() => {
		if (!playheadFollowEnabled || dragState !== null) {
			return;
		}

		centerPlayheadInScrollContainer(playheadUpdatesAreLive ? "auto" : "smooth");
	}, [
		centerPlayheadInScrollContainer,
		dragState,
		playheadFollowEnabled,
		playheadUpdatesAreLive,
	]);

	return (
		<section
			aria-label="Selection timeline"
			className="grid gap-4 rounded-md border bg-background p-4"
		>
			<div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
				<div className="grid gap-2">
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant="outline">Media-time surface</Badge>
						<Badge variant="secondary">
							{asset.tracks.audio.length === 1
								? "1 waveform lane"
								: `${asset.tracks.audio.length} waveform lanes`}
						</Badge>
					</div>
					<dl className="grid gap-2 text-sm sm:grid-cols-3">
						<TimelineFact
							label="Selection start"
							value={formatMediaTime(visibleSelection.startUs)}
						/>
						<TimelineFact
							label="Selection end"
							value={formatMediaTime(visibleSelection.endUs)}
						/>
						<TimelineFact
							label="Selection duration"
							value={formatMediaTime(
								visibleSelection.endUs - visibleSelection.startUs,
							)}
						/>
					</dl>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<Button
						aria-label="Reset selection"
						disabled={selectionEditingDisabled}
						onClick={onSelectionResetRequested}
						size="icon"
						type="button"
						variant="outline"
					>
						<RotateCcw data-icon="inline-start" />
					</Button>
					<Button
						aria-label="Zoom out timeline"
						disabled={zoom <= MINIMUM_ZOOM}
						onClick={() =>
							setZoom((currentZoom) => clampZoom(currentZoom - 0.5))
						}
						size="icon"
						type="button"
						variant="outline"
					>
						<ZoomOut data-icon="inline-start" />
					</Button>
					<label className="grid min-w-36 gap-1 text-xs font-medium text-muted-foreground">
						Zoom
						<input
							aria-label="Timeline zoom"
							className="h-7 accent-primary"
							max={MAXIMUM_ZOOM}
							min={MINIMUM_ZOOM}
							onChange={(event) =>
								setZoom(clampZoom(Number.parseFloat(event.currentTarget.value)))
							}
							step="0.5"
							type="range"
							value={zoom}
						/>
					</label>
					<Button
						aria-label="Zoom in timeline"
						disabled={zoom >= MAXIMUM_ZOOM}
						onClick={() =>
							setZoom((currentZoom) => clampZoom(currentZoom + 0.5))
						}
						size="icon"
						type="button"
						variant="outline"
					>
						<ZoomIn data-icon="inline-start" />
					</Button>
					<Button
						aria-label="Keep playhead centered"
						aria-pressed={playheadFollowEnabled}
						onClick={() =>
							setPlayheadFollowEnabled(
								(currentFollowEnabled) => !currentFollowEnabled,
							)
						}
						size="icon"
						title="Keep playhead centered"
						type="button"
						variant={playheadFollowEnabled ? "secondary" : "outline"}
					>
						<LocateFixed data-icon="inline-start" />
					</Button>
				</div>
			</div>

			<div
				className="overflow-x-auto rounded-md border border-slate-700 bg-slate-900 text-slate-100 shadow-lg"
				data-testid="selection-timeline-scroll"
				ref={scrollContainerRef}
			>
				<div
					className="relative"
					data-testid="selection-timeline-track"
					ref={trackRef}
					style={{
						minWidth: `${zoom * 100}%`,
					}}
				>
					<button
						aria-label="Seek timeline ruler"
						className="relative block h-12 w-full cursor-crosshair border-0 border-b border-slate-700 bg-slate-900 p-0 text-left"
						onMouseDown={(event) => {
							if (shouldUseMouseFallback()) {
								seekFromLanePointer(event);
							}
						}}
						onPointerDown={seekFromLanePointer}
						type="button"
					>
						{timeMarkers.map((marker) => (
							<div
								className="absolute top-0 flex h-full -translate-x-px flex-col items-center justify-end gap-1 pb-1"
								key={marker.timeUs}
								style={{ left: `${marker.percent}%` }}
							>
								<div className="h-4 w-px bg-slate-600" />
								<span className="font-mono text-[11px] text-slate-400">
									{formatMediaTime(marker.timeUs)}
								</span>
							</div>
						))}
					</button>

					<div
						className="relative"
						data-testid="selection-timeline-lane-surface"
					>
						<div className="relative max-h-72 overflow-y-auto">
							{asset.tracks.audio.length > 0 ? (
								asset.tracks.audio.map((track, trackIndex) => (
									<WaveformLane
										key={track.id}
										lane={laneStates[track.id] ?? { status: "loading", track }}
										onPointerDown={seekFromLanePointer}
										trackIndex={trackIndex}
									/>
								))
							) : (
								<div className="grid min-h-24 place-items-center border-b border-slate-700 px-4 text-sm text-slate-400">
									No audio tracks available for waveform lanes.
								</div>
							)}
						</div>

						<div
							aria-hidden="true"
							className={`pointer-events-none absolute inset-y-0 z-30 border-y-2 border-emerald-400 bg-transparent ${selectionMotionClassName}`}
							data-testid="selection-range-outline"
							style={{
								left: `${selectionStartPercent}%`,
								width: `${selectionEndPercent - selectionStartPercent}%`,
							}}
						/>
						<button
							aria-label="Move selection range"
							className={`absolute inset-y-0 z-20 cursor-grab border-0 bg-transparent active:cursor-grabbing ${selectionMotionClassName}`}
							disabled={selectionEditingDisabled}
							onMouseDown={(event) => {
								if (shouldUseMouseFallback()) {
									beginRangeDrag(event);
								}
							}}
							onPointerDown={beginRangeDrag}
							style={{
								left: `${selectionStartPercent}%`,
								width: `${selectionEndPercent - selectionStartPercent}%`,
							}}
							type="button"
						/>
						<button
							aria-label="Selection start handle"
							className={`absolute inset-y-0 z-40 flex w-5 -translate-x-1/2 cursor-ew-resize items-stretch justify-center border-0 bg-transparent p-0 ${selectionMotionClassName}`}
							disabled={selectionEditingDisabled}
							onMouseDown={(event) => {
								if (shouldUseMouseFallback()) {
									beginHandleDrag(event, "start");
								}
							}}
							onPointerDown={(event) => beginHandleDrag(event, "start")}
							style={{ left: `${selectionStartPercent}%` }}
							type="button"
						>
							<span
								className="block h-full w-0.5 bg-emerald-400 shadow-[4px_0_8px_rgb(52_211_153_/_0.55)]"
								data-testid="selection-start-handle-rail"
							/>
						</button>
						<button
							aria-label="Selection end handle"
							className={`absolute inset-y-0 z-40 flex w-5 -translate-x-1/2 cursor-ew-resize items-stretch justify-center border-0 bg-transparent p-0 ${selectionMotionClassName}`}
							disabled={selectionEditingDisabled}
							onMouseDown={(event) => {
								if (shouldUseMouseFallback()) {
									beginHandleDrag(event, "end");
								}
							}}
							onPointerDown={(event) => beginHandleDrag(event, "end")}
							style={{ left: `${selectionEndPercent}%` }}
							type="button"
						>
							<span
								className="block h-full w-0.5 bg-emerald-400 shadow-[-4px_0_8px_rgb(52_211_153_/_0.55)]"
								data-testid="selection-end-handle-rail"
							/>
						</button>
						<button
							aria-label="Playhead handle"
							className={`absolute -top-2 bottom-0 z-50 flex w-5 -translate-x-1/2 cursor-ew-resize items-stretch justify-center border-0 bg-transparent p-0 ${playheadMotionClassName}`}
							onMouseDown={(event) => {
								if (shouldUseMouseFallback()) {
									beginPlayheadDrag(event);
								}
							}}
							onPointerDown={beginPlayheadDrag}
							style={{ left: `${playheadPercent}%` }}
							type="button"
						>
							<span className="relative block w-0.5 bg-red-500 shadow-[0_0_0_1px_rgb(15_23_42)]">
								<span className="absolute -top-1 left-1/2 h-0 w-0 -translate-x-1/2 border-x-[7px] border-t-[10px] border-x-transparent border-t-red-500" />
							</span>
						</button>
					</div>
				</div>
			</div>
		</section>
	);
}

function useWaveformLaneStates({
	asset,
	source,
	waveformLaneLoader,
}: {
	asset: ReadyMediaAsset;
	source: Blob;
	waveformLaneLoader: WaveformLaneLoader;
}) {
	const [laneStates, setLaneStates] = useState<
		Record<string, WaveformLaneState>
	>({});

	useEffect(() => {
		let cancelled = false;

		setLaneStates(
			Object.fromEntries(
				asset.tracks.audio.map((track) => [
					track.id,
					{
						status: "loading",
						track,
					} satisfies WaveformLaneState,
				]),
			),
		);

		asset.tracks.audio.forEach((track, trackIndex) => {
			void waveformLaneLoader({
				assetDurationUs: asset.durationUs,
				source,
				track,
				trackIndex,
			})
				.then((result) => {
					if (cancelled) {
						return;
					}

					setLaneStates((currentStates) => ({
						...currentStates,
						[track.id]: {
							...result,
							track,
						},
					}));
				})
				.catch((error: unknown) => {
					if (cancelled) {
						return;
					}

					setLaneStates((currentStates) => ({
						...currentStates,
						[track.id]: {
							reason: errorToMessage(error),
							status: "unavailable",
							track,
						},
					}));
				});
		});

		return () => {
			cancelled = true;
		};
	}, [asset.durationUs, asset.tracks.audio, source, waveformLaneLoader]);

	return laneStates;
}

function WaveformLane({
	lane,
	onPointerDown,
	trackIndex,
}: {
	lane: WaveformLaneState;
	onPointerDown: (
		event:
			| ReactMouseEvent<HTMLButtonElement>
			| ReactPointerEvent<HTMLButtonElement>,
	) => void;
	trackIndex: number;
}) {
	const label = lane.track.label ?? `Audio ${trackIndex + 1}`;
	const language = lane.track.language ?? "und";

	return (
		<div className="relative border-b border-slate-700 bg-slate-800">
			<div
				className="pointer-events-none relative z-30 flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-700 bg-slate-900/90 px-3 py-2 backdrop-blur"
				data-testid={`waveform-lane-header-${lane.track.id}`}
			>
				<span className="truncate text-sm font-medium text-slate-100">
					{label}
				</span>
				{language !== "und" ? (
					<Badge
						className="border-slate-600 font-mono text-slate-300"
						variant="outline"
					>
						{language}
					</Badge>
				) : null}
				<div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
					<span>
						{lane.track.channels ? `${lane.track.channels}ch` : "Audio"}
					</span>
					{lane.track.codec ? <span>{lane.track.codec}</span> : null}
				</div>
				<LaneStatus lane={lane} />
			</div>
			<button
				aria-label={`Seek ${label} waveform lane`}
				className="relative block h-16 w-full cursor-crosshair overflow-hidden bg-slate-800 text-left"
				onMouseDown={(event) => {
					if (typeof window.PointerEvent === "undefined") {
						onPointerDown(event);
					}
				}}
				onPointerDown={onPointerDown}
				type="button"
			>
				<div className="absolute inset-x-0 top-1/2 h-px bg-slate-700" />
				{lane.status === "ready" ? (
					<WaveformCanvas label={label} samples={lane.samples} />
				) : null}
				{lane.status === "loading" ? (
					<div className="absolute inset-0 grid place-items-center text-xs text-slate-400">
						Loading waveform
					</div>
				) : null}
				{lane.status === "unavailable" ? (
					<div className="absolute inset-0 grid place-items-center px-4 text-xs text-slate-400">
						Waveform unavailable
					</div>
				) : null}
			</button>
		</div>
	);
}

function LaneStatus({ lane }: { lane: WaveformLaneState }) {
	if (lane.status === "ready") {
		return (
			<Badge className="bg-cyan-500/15 text-cyan-200" variant="secondary">
				Waveform ready
			</Badge>
		);
	}

	if (lane.status === "unavailable") {
		return (
			<Badge
				className="border-slate-600 text-slate-300"
				title={lane.reason}
				variant="outline"
			>
				Unavailable
			</Badge>
		);
	}

	return (
		<Badge className="border-slate-600 text-slate-300" variant="outline">
			Loading
		</Badge>
	);
}

function WaveformCanvas({
	label,
	samples,
}: {
	label: string;
	samples: number[];
}) {
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
			context.fillStyle = "rgba(8, 183, 196, 0.18)";
			context.fillRect(0, centerY - 1, width, 2);
			context.fillStyle = "rgba(6, 182, 212, 0.92)";

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

	return (
		<canvas
			aria-label={`${label} waveform detail`}
			className="absolute inset-x-0 top-3 bottom-3 h-[calc(100%-1.5rem)] w-full"
			data-sample-count={samples.length}
			ref={canvasRef}
		/>
	);
}

function TimelineFact({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid gap-1 rounded-md border bg-card px-3 py-2">
			<dt className="text-xs text-muted-foreground">{label}</dt>
			<dd className="font-mono text-sm tabular-nums">{value}</dd>
		</div>
	);
}

async function loadBrowserWaveformLane({
	assetDurationUs,
	source,
	trackIndex,
}: WaveformLaneRequest): Promise<WaveformLaneResult> {
	try {
		const input = new Input({
			formats: ALL_FORMATS,
			source: new BlobSource(source),
		});
		const tracks = await input.getAudioTracks();
		const track = tracks[trackIndex];

		if (!track) {
			return {
				reason: "The analyzed audio track is no longer available.",
				status: "unavailable",
			};
		}

		if (!(await track.canDecode())) {
			return {
				reason: "This browser cannot decode the audio track for waveform use.",
				status: "unavailable",
			};
		}

		const assetDurationSeconds = assetDurationUs / 1_000_000;
		const trackEndTimestamp = await track.computeDuration();

		if (
			!Number.isFinite(assetDurationSeconds) ||
			assetDurationSeconds <= 0 ||
			!Number.isFinite(trackEndTimestamp) ||
			trackEndTimestamp <= 0
		) {
			return {
				reason: "The audio track duration could not be measured.",
				status: "unavailable",
			};
		}

		const sink = new AudioBufferSink(track);
		const buckets = new Array<number>(WAVEFORM_SAMPLE_COUNT).fill(0);
		let framesRead = 0;
		let sampleRate = 0;

		for await (const { buffer, timestamp } of sink.buffers(
			0,
			Math.min(assetDurationSeconds, trackEndTimestamp),
		)) {
			sampleRate = buffer.sampleRate;
			addAudioBufferToBuckets({
				buffer,
				buckets,
				mediaDurationSeconds: assetDurationSeconds,
				timestampSeconds: timestamp,
			});
			framesRead += buffer.length;
		}

		if (framesRead === 0 || sampleRate === 0) {
			return {
				reason: "No audio samples were decoded for this track.",
				status: "unavailable",
			};
		}

		return {
			samples: normalizeBuckets(buckets),
			status: "ready",
		};
	} catch (error) {
		return {
			reason: errorToMessage(error),
			status: "unavailable",
		};
	}
}

export function addAudioBufferToBuckets({
	buffer,
	buckets,
	mediaDurationSeconds,
	timestampSeconds,
}: {
	buffer: AudioBuffer;
	buckets: number[];
	mediaDurationSeconds: number;
	timestampSeconds: number;
}) {
	const channelData = Array.from(
		{ length: buffer.numberOfChannels },
		(_, index) => buffer.getChannelData(index),
	);
	const secondsPerBucket = mediaDurationSeconds / buckets.length;

	for (let frameIndex = 0; frameIndex < buffer.length; frameIndex += 1) {
		const sampleTimestampSeconds =
			timestampSeconds + frameIndex / buffer.sampleRate;

		if (
			sampleTimestampSeconds < 0 ||
			sampleTimestampSeconds >= mediaDurationSeconds
		) {
			continue;
		}

		let amplitude = 0;

		for (const channel of channelData) {
			amplitude += Math.abs(channel[frameIndex] ?? 0);
		}

		const bucketIndex = Math.min(
			buckets.length - 1,
			Math.floor(sampleTimestampSeconds / secondsPerBucket),
		);
		buckets[bucketIndex] = Math.max(
			buckets[bucketIndex],
			amplitude / Math.max(1, channelData.length),
		);
	}
}

function normalizeBuckets(buckets: number[]): number[] {
	const maximumAmplitude = Math.max(0.01, ...buckets);

	return buckets.map((bucket) => bucket / maximumAmplitude);
}

function requestTimelineFrame(callback: () => void): number {
	if (typeof window.requestAnimationFrame === "function") {
		return window.requestAnimationFrame(callback);
	}

	return window.setTimeout(callback, 16);
}

function cancelTimelineFrame(frameId: number) {
	if (typeof window.cancelAnimationFrame === "function") {
		window.cancelAnimationFrame(frameId);
		return;
	}

	window.clearTimeout(frameId);
}

function createTimeMarkers(durationUs: MediaTimeUs, zoom: number) {
	const markerCount = Math.max(5, Math.min(17, Math.round(5 + zoom * 3)));

	return Array.from({ length: markerCount }, (_, index) => {
		const percent = markerCount === 1 ? 0 : (index / (markerCount - 1)) * 100;

		return {
			percent,
			timeUs: Math.round((durationUs * percent) / 100),
		};
	});
}

function mediaTimeFromClientX(
	clientX: number,
	trackElement: HTMLElement | null,
	durationUs: MediaTimeUs,
) {
	const rect = trackElement?.getBoundingClientRect();

	if (!Number.isFinite(clientX) || !rect || rect.width <= 0) {
		return 0;
	}

	return Math.round(
		clamp((clientX - rect.left) / rect.width, 0, 1) * durationUs,
	);
}

function mediaDeltaFromClientX(
	clientX: number,
	startClientX: number,
	trackElement: HTMLElement | null,
	durationUs: MediaTimeUs,
) {
	const rect = trackElement?.getBoundingClientRect();

	if (!Number.isFinite(clientX) || !rect || rect.width <= 0) {
		return 0;
	}

	return Math.round(((clientX - startClientX) / rect.width) * durationUs);
}

function mediaTimeToPercent(timeUs: MediaTimeUs, durationUs: MediaTimeUs) {
	if (durationUs <= 0) {
		return 0;
	}

	return clamp((timeUs / durationUs) * 100, 0, 100);
}

function clampZoom(zoom: number) {
	return clamp(zoom, MINIMUM_ZOOM, MAXIMUM_ZOOM);
}

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

function formatMediaTime(timeUs: number): string {
	const totalMilliseconds = Math.floor(timeUs / 1_000);
	const milliseconds = totalMilliseconds % 1_000;
	const totalSeconds = Math.floor(totalMilliseconds / 1_000);
	const seconds = totalSeconds % 60;
	const totalMinutes = Math.floor(totalSeconds / 60);
	const minutes = totalMinutes % 60;
	const hours = Math.floor(totalMinutes / 60);

	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
		2,
		"0",
	)}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(
		3,
		"0",
	)}`;
}

function errorToMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}
