import { useEffect, useRef, useState } from "react";

import type { AudioMix } from "@/editor-core/model";
import type { PreviewLevelMeterChannel } from "./preview-level-meter";
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
const LIVE_PREVIEW_METERING_UI_INTERVAL_MS = 50;
const PAUSED_PREVIEW_METERING_POLL_INTERVAL_MS = 250;

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
	const liveMeteringStateRef = useRef<LivePreviewMeteringState>(
		EMPTY_LIVE_PREVIEW_METERING_STATE,
	);
	const [liveMeteringState, setLiveMeteringState] =
		useState<LivePreviewMeteringState>(EMPTY_LIVE_PREVIEW_METERING_STATE);

	useEffect(() => {
		clipHoldStateRef.current = {};

		if (!enabled) {
			liveMeteringStateRef.current = EMPTY_LIVE_PREVIEW_METERING_STATE;
			setLiveMeteringState(EMPTY_LIVE_PREVIEW_METERING_STATE);
			return;
		}

		let cancelled = false;
		let frameId: number | null = null;
		let timeoutId: number | null = null;
		let lastPlayingUpdateTimestampMs: number | null = null;

		function commitLiveMeteringState(nextState: LivePreviewMeteringState) {
			if (
				livePreviewMeteringStatesEqual(liveMeteringStateRef.current, nextState)
			) {
				return;
			}

			liveMeteringStateRef.current = nextState;
			setLiveMeteringState(nextState);
		}

		function scheduleNextUpdate(isPlaying: boolean) {
			if (!clock || cancelled) {
				return;
			}

			if (isPlaying) {
				frameId = requestPreviewMeteringFrame(updateLiveMeters);
				return;
			}

			timeoutId = requestPausedPreviewMeteringPoll(updateLiveMeters);
		}

		function updateLiveMeters(timestampMs?: number) {
			if (cancelled) {
				return;
			}

			const isPlaying = clock?.getIsPlaying() ?? false;

			if (
				isPlaying &&
				typeof timestampMs === "number" &&
				lastPlayingUpdateTimestampMs !== null &&
				timestampMs - lastPlayingUpdateTimestampMs <
					LIVE_PREVIEW_METERING_UI_INTERVAL_MS
			) {
				scheduleNextUpdate(isPlaying);
				return;
			}

			const result = createLivePreviewMeteringTrackStates({
				audioMix,
				isPlaying,
				nowMs: now(),
				playheadUs: clock?.getPlayheadUs() ?? 0,
				previousClipHoldState: clipHoldStateRef.current,
				soloedAudioTrackId,
				trackStates,
			});
			clipHoldStateRef.current = result.clipHoldState;
			commitLiveMeteringState({
				combinedState: result.combinedState,
				trackStates: result.trackStates,
			});

			if (isPlaying && typeof timestampMs === "number") {
				lastPlayingUpdateTimestampMs = timestampMs;
			}

			if (!isPlaying) {
				lastPlayingUpdateTimestampMs = null;
			}

			scheduleNextUpdate(isPlaying);
		}

		updateLiveMeters();

		return () => {
			cancelled = true;

			if (frameId !== null) {
				cancelPreviewMeteringFrame(frameId);
			}

			if (timeoutId !== null) {
				cancelPausedPreviewMeteringPoll(timeoutId);
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

function requestPausedPreviewMeteringPoll(callback: () => void): number | null {
	if (typeof window.setTimeout !== "function") {
		return null;
	}

	return window.setTimeout(callback, PAUSED_PREVIEW_METERING_POLL_INTERVAL_MS);
}

function cancelPausedPreviewMeteringPoll(timeoutId: number) {
	if (typeof window.clearTimeout !== "function") {
		return;
	}

	window.clearTimeout(timeoutId);
}

function livePreviewMeteringStatesEqual(
	left: LivePreviewMeteringState,
	right: LivePreviewMeteringState,
): boolean {
	return (
		combinedStatesEqual(left.combinedState, right.combinedState) &&
		trackStateRecordsEqual(left.trackStates, right.trackStates)
	);
}

function combinedStatesEqual(
	left: LivePreviewMeteringState["combinedState"],
	right: LivePreviewMeteringState["combinedState"],
): boolean {
	if (left.status !== right.status) {
		return false;
	}

	if (left.status === "ready" && right.status === "ready") {
		return (
			left.partial === right.partial &&
			left.reason === right.reason &&
			channelsEqual(left.channels, right.channels)
		);
	}

	return left.reason === right.reason;
}

function trackStateRecordsEqual(
	left: LivePreviewMeteringState["trackStates"],
	right: LivePreviewMeteringState["trackStates"],
): boolean {
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);

	if (leftKeys.length !== rightKeys.length) {
		return false;
	}

	return leftKeys.every((trackId) => {
		const leftState = left[trackId];
		const rightState = right[trackId];

		if (!leftState || !rightState || leftState.status !== rightState.status) {
			return false;
		}

		if (leftState.status === "ready" && rightState.status === "ready") {
			return (
				leftState.excluded === rightState.excluded &&
				channelsEqual(leftState.channels, rightState.channels)
			);
		}

		if (
			leftState.status === "unavailable" &&
			rightState.status === "unavailable"
		) {
			return leftState.reason === rightState.reason;
		}

		return true;
	});
}

function channelsEqual(
	left: PreviewLevelMeterChannel[],
	right: PreviewLevelMeterChannel[],
): boolean {
	if (left.length !== right.length) {
		return false;
	}

	return left.every((leftChannel, index) => {
		const rightChannel = right[index];

		return (
			Boolean(rightChannel) &&
			leftChannel.clipHeld === rightChannel.clipHeld &&
			leftChannel.label === rightChannel.label &&
			leftChannel.peakDb === rightChannel.peakDb
		);
	});
}

function previewNowMs(): number {
	if (typeof window.performance?.now === "function") {
		return window.performance.now();
	}

	return Date.now();
}
