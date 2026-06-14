import {
	AudioWaveform,
	LocateFixed,
	RotateCcw,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import {
	type MouseEvent as ReactMouseEvent,
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import { Button } from "@/components/ui/button";
import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import type { MediaTimeUs, Selection } from "@/editor-core/model";
import {
	moveSelectionRangeByDelta,
	setSelectionEndFromPlayhead,
	setSelectionStartFromPlayhead,
} from "@/editor-core/selection";

import { formatMediaTime } from "./media-time-presentation";
import {
	MAXIMUM_TIMELINE_ZOOM,
	MINIMUM_TIMELINE_ZOOM,
	centeredTimelineScrollLeft,
	clampTimelineZoom,
	clientXToMediaDelta,
	clientXToMediaTime,
	createSelectionTimelineMarkers,
	mediaTimeToPercent,
} from "./selection-timeline-geometry";
import type {
	SelectionTimelineMarkerPlacement,
	TimelineTrackGeometry,
} from "./selection-timeline-geometry.types";
import type {
	DragState,
	SelectionTimelineProps,
} from "./selection-timeline.types";
import { WaveformLane } from "./selection-waveform-lane";
import {
	loadBrowserWaveformLane,
	useWaveformLaneStates,
} from "./selection-waveform-lanes";
import type { WaveformRegionSelectionChange } from "./selection-waveform-surface.types";

const EMPTY_AUDIO_PREVIEW_PREPARING_TRACK_IDS = new Set<string>();

export function SelectionTimeline({
	asset,
	audioMix = createDefaultAudioMix(asset),
	audioPreviewPreparingTrackIds = EMPTY_AUDIO_PREVIEW_PREPARING_TRACK_IDS,
	onAudioTrackChannelModeChange,
	onAudioTrackIncludedChange,
	onAudioTrackVolumePercentChange,
	onPlayheadSeekRequested,
	onSelectionEndCommitRequested,
	onSelectionRangeMoveRequested,
	onSelectionResetRequested,
	onSelectionStartCommitRequested,
	onSoloedAudioTrackChange,
	playheadUs,
	playheadUpdatesAreLive = false,
	selection,
	selectionEditingDisabled = false,
	soloedAudioTrackId = null,
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
	const [regionSelectionEditing, setRegionSelectionEditing] = useState(false);
	const [zoom, setZoom] = useState(1);
	const laneStates = useWaveformLaneStates({
		asset,
		source,
		waveformLaneLoader,
	});
	const visibleSelection = draftSelection ?? selection;
	const selectionEditInProgress = dragState !== null || regionSelectionEditing;
	const selectionContext = useMemo(
		() => ({
			durationUs: asset.durationUs,
			frameTiming: asset.frameTiming,
		}),
		[asset.durationUs, asset.frameTiming],
	);
	const timeMarkers = useMemo(
		() => createSelectionTimelineMarkers(asset.durationUs, zoom),
		[asset.durationUs, zoom],
	);
	const readyWaveformLaneCount = Object.values(laneStates).filter(
		(laneState) => laneState.status === "ready",
	).length;
	const selectionIsRegionBacked = readyWaveformLaneCount > 0;
	const minimumSelectionDurationUs = Math.max(
		1,
		Math.min(asset.frameTiming.frameDurationUs, asset.durationUs),
	);
	const normalizeRegionSelectionChange = useCallback(
		(change: WaveformRegionSelectionChange): Selection => {
			if (change.side === "start") {
				return setSelectionStartFromPlayhead(
					change.initialSelection,
					change.selection.startUs,
					selectionContext,
				);
			}

			if (change.side === "end") {
				return setSelectionEndFromPlayhead(
					change.initialSelection,
					change.selection.endUs,
					selectionContext,
				);
			}

			return moveSelectionRangeByDelta(
				change.initialSelection,
				change.selection.startUs - change.initialSelection.startUs,
				selectionContext,
			);
		},
		[selectionContext],
	);
	const previewRegionSelectionChange = useCallback(
		(change: WaveformRegionSelectionChange) => {
			const nextSelection = normalizeRegionSelectionChange(change);

			setRegionSelectionEditing(true);
			setDraftSelection(nextSelection);

			if (change.side === "start") {
				onPlayheadSeekRequested(nextSelection.startUs);
			}

			if (change.side === "end") {
				onPlayheadSeekRequested(nextSelection.endUs);
			}
		},
		[normalizeRegionSelectionChange, onPlayheadSeekRequested],
	);
	const commitRegionSelectionChange = useCallback(
		(change: WaveformRegionSelectionChange) => {
			const nextSelection = normalizeRegionSelectionChange(change);

			setDraftSelection(null);
			setRegionSelectionEditing(false);

			if (change.side === "start") {
				onPlayheadSeekRequested(nextSelection.startUs);
				onSelectionStartCommitRequested(nextSelection.startUs);
				return;
			}

			if (change.side === "end") {
				onPlayheadSeekRequested(nextSelection.endUs);
				onSelectionEndCommitRequested(nextSelection.endUs);
				return;
			}

			onSelectionRangeMoveRequested(
				nextSelection.startUs - change.initialSelection.startUs,
			);
		},
		[
			normalizeRegionSelectionChange,
			onPlayheadSeekRequested,
			onSelectionEndCommitRequested,
			onSelectionRangeMoveRequested,
			onSelectionStartCommitRequested,
		],
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
				const nextPlayheadUs = clientXToMediaTime({
					clientX,
					durationUs: asset.durationUs,
					trackGeometry: timelineTrackGeometryFromElement(trackRef.current),
				});
				setDraftPlayheadUs(nextPlayheadUs);
				onPlayheadSeekRequested(nextPlayheadUs);
				return;
			}

			if (dragState.type === "start") {
				const nextSelection = setSelectionStartFromPlayhead(
					dragState.initialSelection,
					clientXToMediaTime({
						clientX,
						durationUs: asset.durationUs,
						trackGeometry: timelineTrackGeometryFromElement(trackRef.current),
					}),
					selectionContext,
				);
				setDraftSelection(nextSelection);
				onPlayheadSeekRequested(nextSelection.startUs);
				return;
			}

			if (dragState.type === "end") {
				const nextSelection = setSelectionEndFromPlayhead(
					dragState.initialSelection,
					clientXToMediaTime({
						clientX,
						durationUs: asset.durationUs,
						trackGeometry: timelineTrackGeometryFromElement(trackRef.current),
					}),
					selectionContext,
				);
				setDraftSelection(nextSelection);
				onPlayheadSeekRequested(nextSelection.endUs);
				return;
			}

			const deltaUs = clientXToMediaDelta({
				clientX,
				durationUs: asset.durationUs,
				startClientX: dragState.startClientX,
				trackGeometry: timelineTrackGeometryFromElement(trackRef.current),
			});
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
				const nextPlayheadUs = clientXToMediaTime({
					clientX: event.clientX,
					durationUs: asset.durationUs,
					trackGeometry: timelineTrackGeometryFromElement(trackRef.current),
				});
				onPlayheadSeekRequested(nextPlayheadUs);
			}

			if (dragState.type === "start") {
				const nextSelection = setSelectionStartFromPlayhead(
					dragState.initialSelection,
					clientXToMediaTime({
						clientX: event.clientX,
						durationUs: asset.durationUs,
						trackGeometry: timelineTrackGeometryFromElement(trackRef.current),
					}),
					selectionContext,
				);
				onPlayheadSeekRequested(nextSelection.startUs);
				onSelectionStartCommitRequested(nextSelection.startUs);
			}

			if (dragState.type === "end") {
				const nextSelection = setSelectionEndFromPlayhead(
					dragState.initialSelection,
					clientXToMediaTime({
						clientX: event.clientX,
						durationUs: asset.durationUs,
						trackGeometry: timelineTrackGeometryFromElement(trackRef.current),
					}),
					selectionContext,
				);
				onPlayheadSeekRequested(nextSelection.endUs);
				onSelectionEndCommitRequested(nextSelection.endUs);
			}

			if (dragState.type === "range") {
				onSelectionRangeMoveRequested(
					clientXToMediaDelta({
						clientX: event.clientX,
						durationUs: asset.durationUs,
						startClientX: dragState.startClientX,
						trackGeometry: timelineTrackGeometryFromElement(trackRef.current),
					}),
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
			clientXToMediaTime({
				clientX: event.clientX,
				durationUs: asset.durationUs,
				trackGeometry: timelineTrackGeometryFromElement(trackRef.current),
			}),
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
			clientXToMediaTime({
				clientX: event.clientX,
				durationUs: asset.durationUs,
				trackGeometry: timelineTrackGeometryFromElement(trackRef.current),
			}),
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
	const selectionMotionClassName = !selectionEditInProgress
		? "transition-[left,width] duration-200 ease-out motion-reduce:transition-none"
		: "transition-none";
	const playheadMotionClassName =
		!selectionEditInProgress && !playheadUpdatesAreLive
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

			const trackWidth =
				track.getBoundingClientRect().width ||
				scrollContainer.clientWidth * zoom ||
				scrollContainer.scrollWidth;
			const nextScrollLeft = centeredTimelineScrollLeft({
				currentScrollLeft: scrollContainer.scrollLeft,
				maxScrollLeft,
				playheadPercent,
				trackWidthPx: trackWidth,
				viewportWidthPx: scrollContainer.clientWidth,
			});

			if (nextScrollLeft === null) {
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
		if (!playheadFollowEnabled || selectionEditInProgress) {
			return;
		}

		centerPlayheadInScrollContainer(playheadUpdatesAreLive ? "auto" : "smooth");
	}, [
		centerPlayheadInScrollContainer,
		playheadFollowEnabled,
		playheadUpdatesAreLive,
		selectionEditInProgress,
	]);

	return (
		<section
			aria-label="Selection timeline"
			className="grid min-h-full grid-rows-[38px_minmax(0,1fr)] gap-0 overflow-hidden rounded-md border bg-workbench-timeline xl:rounded-none xl:border-0"
		>
			<div className="flex min-w-0 items-center justify-between border-b border-workbench-border px-3">
				<div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
					<AudioWaveform
						aria-hidden="true"
						className="size-4 text-workbench-progress"
					/>
					<span className="truncate">Selection and waveform</span>
					<span className="hidden font-mono text-[11px] font-normal text-muted-foreground sm:inline">
						{formatMediaTime(visibleSelection.endUs - visibleSelection.startUs)}
					</span>
				</div>

				<div className="flex shrink-0 items-center gap-2">
					<Button
						aria-label="Reset selection"
						className="h-7 rounded border-workbench-border bg-workbench-viewer px-2 text-xs text-foreground hover:bg-workbench-hover"
						disabled={selectionEditingDisabled}
						onClick={onSelectionResetRequested}
						size="sm"
						type="button"
						variant="outline"
					>
						<RotateCcw data-icon="inline-start" />
						Reset
					</Button>
					<Button
						aria-label="Zoom out timeline"
						className="hidden size-7 rounded border-workbench-border bg-workbench-viewer text-muted-foreground hover:bg-workbench-hover hover:text-foreground sm:inline-flex"
						disabled={zoom <= MINIMUM_TIMELINE_ZOOM}
						onClick={() =>
							setZoom((currentZoom) => clampTimelineZoom(currentZoom - 0.5))
						}
						size="icon"
						type="button"
						variant="outline"
					>
						<ZoomOut data-icon="inline-start" />
					</Button>
					<label className="hidden min-w-28 items-center gap-2 text-xs font-medium text-muted-foreground sm:flex">
						<span>Zoom</span>
						<input
							aria-label="Timeline zoom"
							className="h-6 min-w-0 accent-primary"
							max={MAXIMUM_TIMELINE_ZOOM}
							min={MINIMUM_TIMELINE_ZOOM}
							onChange={(event) =>
								setZoom(
									clampTimelineZoom(
										Number.parseFloat(event.currentTarget.value),
									),
								)
							}
							step="0.5"
							type="range"
							value={zoom}
						/>
					</label>
					<Button
						aria-label="Zoom in timeline"
						className="hidden size-7 rounded border-workbench-border bg-workbench-viewer text-muted-foreground hover:bg-workbench-hover hover:text-foreground sm:inline-flex"
						disabled={zoom >= MAXIMUM_TIMELINE_ZOOM}
						onClick={() =>
							setZoom((currentZoom) => clampTimelineZoom(currentZoom + 0.5))
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
						className={`hidden size-7 rounded sm:inline-flex ${
							playheadFollowEnabled
								? "border-workbench-progress/50 bg-workbench-progress/15 text-workbench-progress hover:bg-workbench-progress/20 hover:text-workbench-progress"
								: "border-workbench-border bg-workbench-viewer text-muted-foreground hover:bg-workbench-hover hover:text-foreground"
						}`}
						onClick={() =>
							setPlayheadFollowEnabled(
								(currentFollowEnabled) => !currentFollowEnabled,
							)
						}
						size="icon"
						title="Keep playhead centered"
						type="button"
						variant="outline"
					>
						<LocateFixed data-icon="inline-start" />
					</Button>
				</div>
			</div>

			<div className="min-h-0 overflow-hidden p-4">
				<div
					className="h-full min-h-0 overflow-x-auto rounded border border-workbench-border bg-workbench-timeline text-workbench-timeline-foreground"
					data-testid="selection-timeline-scroll"
					ref={scrollContainerRef}
				>
					<div
						className="relative flex min-h-full flex-col"
						data-testid="selection-timeline-track"
						ref={trackRef}
						style={{
							minWidth: `${zoom * 100}%`,
						}}
					>
						<button
							aria-label="Seek timeline ruler"
							className="relative block h-12 w-full cursor-crosshair border-0 border-b border-workbench-border bg-workbench-ruler p-0 text-left"
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
									className="absolute top-0 h-full w-0 -translate-x-px"
									key={marker.timeUs}
									style={{ left: `${marker.percent}%` }}
								>
									<div className="absolute bottom-5 left-0 h-4 w-px bg-workbench-border-strong" />
									<span
										className={`absolute bottom-1 whitespace-nowrap font-mono text-[11px] text-muted-foreground ${timeMarkerLabelClassName(marker.placement)}`}
									>
										{formatMediaTime(marker.timeUs)}
									</span>
								</div>
							))}
						</button>

						<div
							className="relative min-h-0 flex-1"
							data-testid="selection-timeline-lane-surface"
						>
							<div className="relative max-h-72 overflow-y-auto">
								{asset.tracks.audio.length > 0 ? (
									asset.tracks.audio.map((track, trackIndex) => (
										<WaveformLane
											audioDecision={audioMix.tracks[track.id]}
											audioPreviewPreparing={audioPreviewPreparingTrackIds.has(
												track.id,
											)}
											durationUs={asset.durationUs}
											key={track.id}
											lane={
												laneStates[track.id] ?? { status: "loading", track }
											}
											minimumSelectionDurationUs={minimumSelectionDurationUs}
											onAudioTrackChannelModeChange={
												onAudioTrackChannelModeChange
											}
											onAudioTrackIncludedChange={onAudioTrackIncludedChange}
											onAudioTrackVolumePercentChange={
												onAudioTrackVolumePercentChange
											}
											onPlayheadSeekRequested={onPlayheadSeekRequested}
											onPointerDown={seekFromLanePointer}
											onSelectionCommitRequested={commitRegionSelectionChange}
											onSelectionPreviewRequested={previewRegionSelectionChange}
											onSoloedAudioTrackChange={onSoloedAudioTrackChange}
											selection={visibleSelection}
											selectionEditingDisabled={selectionEditingDisabled}
											selectionEditInProgress={selectionEditInProgress}
											soloedAudioTrackId={soloedAudioTrackId}
											trackIndex={trackIndex}
										/>
									))
								) : (
									<div className="grid min-h-24 place-items-center border-b border-workbench-border px-4 text-sm text-muted-foreground">
										No audio tracks available for waveform lanes.
									</div>
								)}
							</div>

							{selectionIsRegionBacked && dragState === null ? null : (
								<>
									<div
										aria-hidden="true"
										className={`pointer-events-none absolute inset-y-0 z-30 border-y-2 border-workbench-selected bg-transparent ${selectionMotionClassName}`}
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
											className="block h-full w-0.5 bg-workbench-selected shadow-[var(--shadow-workbench-selection-start)]"
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
											className="block h-full w-0.5 bg-workbench-selected shadow-[var(--shadow-workbench-selection-end)]"
											data-testid="selection-end-handle-rail"
										/>
									</button>
								</>
							)}
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
								<span className="relative block w-0.5 bg-workbench-playhead">
									<span className="absolute -top-1 left-1/2 h-0 w-0 -translate-x-1/2 border-x-[7px] border-t-[10px] border-x-transparent border-t-workbench-playhead" />
								</span>
							</button>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
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

function timeMarkerLabelClassName(placement: SelectionTimelineMarkerPlacement) {
	switch (placement) {
		case "end":
			return "right-0 text-right";
		case "middle":
			return "left-0 -translate-x-1/2 text-center";
		case "start":
			return "left-0 text-left";
	}
}

function timelineTrackGeometryFromElement(
	trackElement: HTMLElement | null,
): TimelineTrackGeometry | null {
	const rect = trackElement?.getBoundingClientRect();

	if (!rect || rect.width <= 0) {
		return null;
	}

	return {
		leftPx: rect.left,
		widthPx: rect.width,
	};
}
