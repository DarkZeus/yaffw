import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { MediaTimeUs, Selection } from "@/editor-core/model";
import {
	type SelectionCommandContext,
	moveSelectionRangeByDelta,
	setSelectionEndFromPlayhead,
	setSelectionStartFromPlayhead,
} from "@/editor-core/selection";
import {
	cancelBrowserFrame,
	requestBrowserFrame,
} from "@/lib/browser-animation-frame";
import type { ActiveMediaAssetCleanupScope } from "../../media-work/scopes/active-media-asset-cleanup-scope";
import type { MediaCleanupRegistration } from "../../media-work/scopes/synchronous-media-work-scope";
import {
	type TimelineTrackGeometry,
	clientXToMediaDelta,
	clientXToMediaTime,
	mediaTimeToPercent,
} from "./selection-timeline-geometry";

export type SelectionGestureKind = "start" | "end" | "range" | "playhead";
export type SelectionGestureOrigin = "timeline" | "waveform";
export type BeginSelectionGesture = (
	event: MouseEvent | PointerEvent,
	target: HTMLElement,
	kind: SelectionGestureKind,
	origin: SelectionGestureOrigin,
) => (() => void) | undefined;

type GestureDraft = {
	origin: SelectionGestureOrigin;
	playheadUs: MediaTimeUs | null;
	selection: Selection | null;
};

type SelectionGestureOptions = {
	activeMediaAssetCleanupScope?: ActiveMediaAssetCleanupScope;
	source: Blob;
	context: SelectionCommandContext;
	selection: Selection;
	selectionEditingDisabled: boolean;
	readGeometry: () => TimelineTrackGeometry | null;
	readPlayheadUs: () => MediaTimeUs;
	onGestureStarted: () => void;
	onPlayheadPreviewRequested: (playheadUs: MediaTimeUs) => void;
	onPlayheadSeekRequested: (playheadUs: MediaTimeUs) => void;
	onSelectionStartCommitRequested: (playheadUs: MediaTimeUs) => void;
	onSelectionEndCommitRequested: (playheadUs: MediaTimeUs) => void;
	onSelectionRangeMoveRequested: (deltaUs: MediaTimeUs) => void;
};

export function useSelectionGesture(options: SelectionGestureOptions) {
	const latestOptions = useRef(options);
	const active = useRef<{
		kind: SelectionGestureKind;
		initialSelection: Selection;
		cancel: (restore: boolean) => void;
	} | null>(null);
	const [draft, setDraft] = useState<GestureDraft | null>(null);

	useLayoutEffect(() => {
		latestOptions.current = options;
	});

	useLayoutEffect(() => {
		return () => active.current?.cancel(false);
	}, [options.source, options.activeMediaAssetCleanupScope]);

	useLayoutEffect(() => {
		const gesture = active.current;
		if (
			gesture &&
			gesture.kind !== "playhead" &&
			(options.selectionEditingDisabled ||
				!selectionsEqual(options.selection, gesture.initialSelection))
		) {
			gesture.cancel(true);
		}
	}, [options.selection, options.selectionEditingDisabled]);

	const isGestureActive = useCallback(() => active.current !== null, []);
	const beginGesture = useCallback<BeginSelectionGesture>(
		(event, target, kind, origin) => {
			const initial = latestOptions.current;
			if (
				active.current ||
				event.button !== 0 ||
				("isPrimary" in event && !event.isPrimary) ||
				(kind !== "playhead" && initial.selectionEditingDisabled) ||
				initial.activeMediaAssetCleanupScope?.isCurrent() === false
			)
				return;

			const geometry = initial.readGeometry();
			if (!geometry) return;

			const pointerId = "pointerId" in event ? event.pointerId : null;
			const startX = event.clientX;
			const initialPlayheadUs = initial.readPlayheadUs();
			const initialSelection = initial.selection;
			const { context } = initial;
			const boundary =
				kind === "start" ? initialSelection.startUs : initialSelection.endUs;
			const pointerOffsetPx =
				startX -
				geometry.leftPx -
				(geometry.widthPx * mediaTimeToPercent(boundary, context.durationUs)) /
					100;
			const tracking = new AbortController();
			let frameId: number | null = null;
			let latestX = startX;
			let previewedPlayhead = false;
			let assetRegistration: MediaCleanupRegistration | undefined;
			const gesture = {
				kind,
				initialSelection,
				cancel: (restore: boolean) => finish(undefined, restore),
			};

			function readDraft(clientX: number): GestureDraft {
				const trackGeometry = latestOptions.current.readGeometry() ?? geometry;
				if (kind === "range") {
					const deltaUs = clientXToMediaDelta({
						clientX,
						durationUs: context.durationUs,
						startClientX: startX,
						trackGeometry,
					});
					return {
						origin,
						playheadUs: null,
						selection: moveSelectionRangeByDelta(
							initialSelection,
							deltaUs,
							context,
						),
					};
				}

				const time = clientXToMediaTime({
					clientX: kind === "playhead" ? clientX : clientX - pointerOffsetPx,
					durationUs: context.durationUs,
					trackGeometry,
				});
				if (kind === "playhead")
					return { origin, playheadUs: time, selection: null };

				const selection =
					kind === "start"
						? setSelectionStartFromPlayhead(initialSelection, time, context)
						: setSelectionEndFromPlayhead(initialSelection, time, context);
				return {
					origin,
					playheadUs: kind === "start" ? selection.startUs : selection.endUs,
					selection,
				};
			}

			function finish(clientX?: number, restore = false) {
				if (active.current !== gesture) return;
				// Retire ownership before release, cleanup, or any session callback.
				active.current = null;
				tracking.abort();
				assetRegistration?.dispose();
				if (frameId !== null) cancelBrowserFrame(frameId);
				if (pointerId !== null && target.hasPointerCapture?.(pointerId)) {
					target.releasePointerCapture(pointerId);
				}
				setDraft(null);

				const callbacks = latestOptions.current;
				if (
					clientX === undefined ||
					(kind !== "playhead" && callbacks.selectionEditingDisabled)
				) {
					if (restore && previewedPlayhead)
						callbacks.onPlayheadSeekRequested(initialPlayheadUs);
					return;
				}

				const next = readDraft(clientX);
				const selection = next.selection;
				const changed =
					selection !== null && !selectionsEqual(selection, initialSelection);
				if (
					next.playheadUs !== null &&
					(kind === "playhead" ||
						changed ||
						previewedPlayhead ||
						origin === "timeline")
				) {
					callbacks.onPlayheadSeekRequested(next.playheadUs);
				}
				if (!selection || !changed) return;
				if (kind === "start")
					callbacks.onSelectionStartCommitRequested(selection.startUs);
				if (kind === "end")
					callbacks.onSelectionEndCommitRequested(selection.endUs);
				if (kind === "range")
					callbacks.onSelectionRangeMoveRequested(
						selection.startUs - initialSelection.startUs,
					);
			}

			function ownsEvent(nextEvent: MouseEvent | PointerEvent) {
				return (
					active.current === gesture &&
					(pointerId === null ||
						("pointerId" in nextEvent && nextEvent.pointerId === pointerId))
				);
			}

			function move(nextEvent: MouseEvent | PointerEvent) {
				if (!ownsEvent(nextEvent)) return;
				latestX = nextEvent.clientX;
				if (frameId !== null) return;
				let fired = false;
				const requestedFrame = requestBrowserFrame(() => {
					fired = true;
					frameId = null;
					if (active.current !== gesture) return;
					const next = readDraft(latestX);
					setDraft(next);
					if (next.playheadUs !== null) {
						previewedPlayhead = true;
						latestOptions.current.onPlayheadPreviewRequested(next.playheadUs);
					}
				});
				if (!fired) frameId = requestedFrame;
			}

			function release(nextEvent: MouseEvent | PointerEvent) {
				if (ownsEvent(nextEvent))
					finish(nextEvent.button === 0 ? nextEvent.clientX : undefined, true);
			}

			function cancelPointer(nextEvent: PointerEvent) {
				if (ownsEvent(nextEvent)) gesture.cancel(true);
			}

			active.current = gesture;
			assetRegistration = initial.activeMediaAssetCleanupScope?.registerCleanup(
				() => gesture.cancel(false),
			);
			if (active.current !== gesture) return;

			const listeners = { signal: tracking.signal, capture: true };
			window.addEventListener(
				pointerId === null ? "mousemove" : "pointermove",
				move,
				listeners,
			);
			window.addEventListener(
				pointerId === null ? "mouseup" : "pointerup",
				release,
				listeners,
			);
			window.addEventListener("blur", () => gesture.cancel(true), listeners);
			window.addEventListener(
				"keydown",
				(keyEvent) => {
					if (keyEvent.key !== "Escape") return;
					keyEvent.preventDefault();
					gesture.cancel(true);
				},
				listeners,
			);
			if (pointerId !== null) {
				window.addEventListener("pointercancel", cancelPointer, listeners);
				target.addEventListener("lostpointercapture", cancelPointer, listeners);
				try {
					target.setPointerCapture?.(pointerId);
				} catch {
					// The window listeners still own the drag when capture is unavailable.
				}
			}

			event.preventDefault();
			initial.onGestureStarted();
			setDraft(
				kind === "playhead"
					? readDraft(startX)
					: { origin, playheadUs: null, selection: initialSelection },
			);
			return () => gesture.cancel(true);
		},
		[],
	);

	return { beginGesture, draft, isGestureActive };
}

function selectionsEqual(left: Selection, right: Selection) {
	return left.startUs === right.startUs && left.endUs === right.endUs;
}
