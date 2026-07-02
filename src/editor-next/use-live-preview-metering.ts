import { useEffect, useRef, useState } from "react";

import type { AudioMix } from "@/editor-core/model";
import {
	type LivePreviewMeteringClipHoldState,
	type LivePreviewMeteringClock,
	type LivePreviewMeteringState,
	createLivePreviewMeteringTrackStates,
} from "./preview-metering-live";
import type { PreviewMeteringTrackStates } from "./preview-metering-preparation.types";

const EMPTY_LIVE_PREVIEW_METERING_STATE = {
	combinedState: {
		channels: [
			{ clipHeld: false, label: "Left", peakDb: -72 },
			{ clipHeld: false, label: "Right", peakDb: -72 },
		],
		partial: false,
		status: "ready",
	},
	trackStates: {},
} satisfies LivePreviewMeteringState;

export type UseLivePreviewMeteringOptions = {
	audioMix: AudioMix;
	clock?: LivePreviewMeteringClock | null;
	enabled: boolean;
	now?: () => number;
	soloedAudioTrackId: string | null;
	trackStates: PreviewMeteringTrackStates;
};

export function useLivePreviewMetering({
	audioMix,
	clock,
	enabled,
	now = previewNowMs,
	soloedAudioTrackId,
	trackStates,
}: UseLivePreviewMeteringOptions): LivePreviewMeteringState {
	const clipHoldStateRef = useRef<LivePreviewMeteringClipHoldState>({});
	const [liveMeteringState, setLiveMeteringState] =
		useState<LivePreviewMeteringState>(EMPTY_LIVE_PREVIEW_METERING_STATE);

	useEffect(() => {
		clipHoldStateRef.current = {};

		if (!enabled) {
			setLiveMeteringState(EMPTY_LIVE_PREVIEW_METERING_STATE);
			return;
		}

		let cancelled = false;
		let frameId: number | null = null;

		function updateLiveMeters() {
			if (cancelled) {
				return;
			}

			const result = createLivePreviewMeteringTrackStates({
				audioMix,
				isPlaying: clock?.getIsPlaying() ?? false,
				nowMs: now(),
				playheadUs: clock?.getPlayheadUs() ?? 0,
				previousClipHoldState: clipHoldStateRef.current,
				soloedAudioTrackId,
				trackStates,
			});
			clipHoldStateRef.current = result.clipHoldState;
			setLiveMeteringState({
				combinedState: result.combinedState,
				trackStates: result.trackStates,
			});

			if (clock) {
				frameId = requestPreviewMeteringFrame(updateLiveMeters);
			}
		}

		updateLiveMeters();

		return () => {
			cancelled = true;

			if (frameId !== null) {
				cancelPreviewMeteringFrame(frameId);
			}
		};
	}, [audioMix, clock, enabled, now, soloedAudioTrackId, trackStates]);

	return liveMeteringState;
}

function requestPreviewMeteringFrame(
	callback: FrameRequestCallback,
): number | null {
	if (typeof window.requestAnimationFrame !== "function") {
		return null;
	}

	return window.requestAnimationFrame(callback);
}

function cancelPreviewMeteringFrame(frameId: number) {
	if (typeof window.cancelAnimationFrame !== "function") {
		return;
	}

	window.cancelAnimationFrame(frameId);
}

function previewNowMs(): number {
	if (typeof window.performance?.now === "function") {
		return window.performance.now();
	}

	return Date.now();
}
