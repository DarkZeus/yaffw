import { useEffect, useRef, useState } from "react";

import type { AudioMix } from "@/editor-core/model";
import type { PreviewLevelMeterChannel } from "./preview-level-meter";
import {
	type LivePreviewMeteringClipHoldState,
	type LivePreviewMeteringClock,
	type LivePreviewMeteringState,
	createLivePreviewMeteringTrackStates,
} from "./preview-metering-live";

const EMPTY_LIVE_PREVIEW_METERING_STATE = {
	combinedState: {
		channels: [
			{ clipHeld: false, label: "Left", peakDb: -90 },
			{ clipHeld: false, label: "Right", peakDb: -90 },
		],
		partial: false,
		status: "ready",
	},
	trackStates: {},
} satisfies LivePreviewMeteringState;
const LIVE_PREVIEW_METERING_ATTACK_MS = 20;
const LIVE_PREVIEW_METERING_COMMIT_INTERVAL_MS = 50;
const LIVE_PREVIEW_METERING_RELEASE_MS = 220;
const LIVE_PREVIEW_METERING_SNAP_THRESHOLD_DB = 0.05;
const PAUSED_PREVIEW_METERING_POLL_INTERVAL_MS = 250;

export type UseLivePreviewMeteringOptions = {
	audioMix: AudioMix;
	clock?: LivePreviewMeteringClock | null;
	enabled: boolean;
	knownTrackIds: string[];
	now?: () => number;
	soloedAudioTrackId: string | null;
};

export function useLivePreviewMetering({
	audioMix,
	clock,
	enabled,
	knownTrackIds,
	now = previewNowMs,
	soloedAudioTrackId,
}: UseLivePreviewMeteringOptions): LivePreviewMeteringState {
	const stableKnownTrackIdsRef = useRef(knownTrackIds);
	if (!stringArraysEqual(stableKnownTrackIdsRef.current, knownTrackIds)) {
		stableKnownTrackIdsRef.current = knownTrackIds;
	}
	const stableKnownTrackIds = stableKnownTrackIdsRef.current;
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
		let timeoutId: number | null = null;
		let animationFrameId: number | null = null;
		let lastDisplayUpdateTimestampMs: number | null = null;
		let lastTargetSampleTimestampMs: number | null = null;
		let targetMeteringState = liveMeteringStateRef.current;

		function cancelScheduledPoll() {
			if (timeoutId === null) {
				return;
			}

			cancelPreviewMeteringPoll(timeoutId);
			timeoutId = null;
		}

		function cancelScheduledAnimationFrame() {
			if (animationFrameId === null) {
				return;
			}

			cancelPreviewMeteringFrame(animationFrameId);
			animationFrameId = null;
		}

		function commitLiveMeteringState(nextState: LivePreviewMeteringState) {
			if (
				livePreviewMeteringStatesEqual(liveMeteringStateRef.current, nextState)
			) {
				return;
			}

			liveMeteringStateRef.current = nextState;
			setLiveMeteringState(nextState);
		}

		function scheduleNextPoll(isPlaying: boolean) {
			if (!clock || cancelled) {
				return;
			}

			cancelScheduledPoll();
			timeoutId = requestPreviewMeteringPoll(
				() => {
					timeoutId = null;
					updateLiveMeterTarget();
				},
				isPlaying
					? LIVE_PREVIEW_METERING_COMMIT_INTERVAL_MS
					: PAUSED_PREVIEW_METERING_POLL_INTERVAL_MS,
			);
		}

		function scheduleAnimationFrame() {
			if (!clock || cancelled || animationFrameId !== null) {
				return;
			}

			let requestedFrameId: number | null = null;
			requestedFrameId = requestPreviewMeteringFrame(
				function animateLiveMeters(timestampMs) {
					if (animationFrameId !== requestedFrameId) {
						return;
					}

					animationFrameId = null;
					advanceLiveMeters(timestampMs);
				},
			);
			animationFrameId = requestedFrameId;
		}

		function sampleLiveMeterTarget(displayTimestampMs: number) {
			const isPlaying = clock?.getIsPlaying() ?? false;
			const result = createLivePreviewMeteringTrackStates({
				excludedTrackIds: createExcludedTrackIds({
					audioMix,
					knownTrackIds: stableKnownTrackIds,
					soloedAudioTrackId,
				}),
				isPlaying,
				knownTrackIds: stableKnownTrackIds,
				meterSnapshot: clock?.readMeterSnapshot() ?? null,
				meteringStatus: clock?.getMeteringStatus() ?? "idle",
				nowMs: displayTimestampMs,
				previousClipHoldState: clipHoldStateRef.current,
			});
			clipHoldStateRef.current = result.clipHoldState;
			targetMeteringState = {
				combinedState: result.combinedState,
				trackStates: result.trackStates,
			};

			return isPlaying;
		}

		function commitSmoothedMeteringState(displayTimestampMs: number) {
			if (
				lastDisplayUpdateTimestampMs !== null &&
				displayTimestampMs <= lastDisplayUpdateTimestampMs
			) {
				return;
			}

			const elapsedDisplayMs =
				lastDisplayUpdateTimestampMs !== null
					? displayTimestampMs - lastDisplayUpdateTimestampMs
					: null;
			const displayMeteringState = smoothLivePreviewMeteringState({
				elapsedMs: elapsedDisplayMs,
				previousState: liveMeteringStateRef.current,
				targetState: targetMeteringState,
			});

			commitLiveMeteringState(displayMeteringState);
			lastDisplayUpdateTimestampMs = displayTimestampMs;
		}

		function scheduleFrameIfDisplayNeedsSmoothing() {
			if (
				!livePreviewMeteringStatesEqual(
					liveMeteringStateRef.current,
					targetMeteringState,
				)
			) {
				scheduleAnimationFrame();
			}
		}

		function updateLiveMeterTarget(forceSample = false) {
			if (cancelled) {
				return;
			}

			const displayTimestampMs = now();
			const meterIsPlaying = clock?.getIsPlaying() ?? false;
			const elapsedSampleMs =
				lastTargetSampleTimestampMs === null
					? null
					: displayTimestampMs - lastTargetSampleTimestampMs;

			if (
				!forceSample &&
				meterIsPlaying &&
				elapsedSampleMs !== null &&
				elapsedSampleMs < LIVE_PREVIEW_METERING_COMMIT_INTERVAL_MS
			) {
				scheduleAnimationFrame();
				scheduleNextPoll(meterIsPlaying);
				return;
			}

			const isPlaying = sampleLiveMeterTarget(displayTimestampMs);
			lastTargetSampleTimestampMs = displayTimestampMs;

			if (isPlaying) {
				if (lastDisplayUpdateTimestampMs === null) {
					commitLiveMeteringState(targetMeteringState);
					lastDisplayUpdateTimestampMs = displayTimestampMs;
				}
				scheduleAnimationFrame();
			} else {
				commitSmoothedMeteringState(displayTimestampMs);
				scheduleFrameIfDisplayNeedsSmoothing();
			}

			scheduleNextPoll(isPlaying);
		}

		function handlePlaybackStateChange() {
			cancelScheduledPoll();
			cancelScheduledAnimationFrame();
			updateLiveMeterTarget(true);
		}

		function advanceLiveMeters(timestampMs: number) {
			if (cancelled) {
				return;
			}

			const isPlaying = clock?.getIsPlaying() ?? false;

			if (
				!isPlaying &&
				livePreviewMeteringStatesEqual(
					liveMeteringStateRef.current,
					targetMeteringState,
				)
			) {
				return;
			}

			commitSmoothedMeteringState(timestampMs);
			if (isPlaying) {
				scheduleAnimationFrame();
			} else {
				scheduleFrameIfDisplayNeedsSmoothing();
			}
		}

		const unsubscribeFromPlaybackStateChange =
			clock?.subscribeToPlaybackStateChange(handlePlaybackStateChange);
		updateLiveMeterTarget();

		return () => {
			cancelled = true;
			unsubscribeFromPlaybackStateChange?.();
			cancelScheduledPoll();
			cancelScheduledAnimationFrame();
		};
	}, [audioMix, clock, enabled, now, soloedAudioTrackId, stableKnownTrackIds]);

	return liveMeteringState;
}

function stringArraysEqual(left: string[], right: string[]): boolean {
	if (left.length !== right.length) {
		return false;
	}

	return left.every((value, index) => value === right[index]);
}

function smoothLivePreviewMeteringState({
	elapsedMs,
	previousState,
	targetState,
}: {
	elapsedMs: number | null;
	previousState: LivePreviewMeteringState;
	targetState: LivePreviewMeteringState;
}): LivePreviewMeteringState {
	if (elapsedMs === null) {
		return targetState;
	}

	if (elapsedMs <= 0) {
		return previousState;
	}

	return {
		combinedState: smoothCombinedState({
			elapsedMs,
			previousState: previousState.combinedState,
			targetState: targetState.combinedState,
		}),
		trackStates: smoothTrackStateRecords({
			elapsedMs,
			previousStates: previousState.trackStates,
			targetStates: targetState.trackStates,
		}),
	};
}

function createExcludedTrackIds({
	audioMix,
	knownTrackIds,
	soloedAudioTrackId,
}: {
	audioMix: AudioMix;
	knownTrackIds: string[];
	soloedAudioTrackId: string | null;
}): ReadonlySet<string> {
	return new Set(
		knownTrackIds.filter((trackId) => {
			const decision = audioMix.tracks[trackId];

			return decision?.include === false && soloedAudioTrackId !== trackId;
		}),
	);
}

function smoothCombinedState({
	elapsedMs,
	previousState,
	targetState,
}: {
	elapsedMs: number;
	previousState: LivePreviewMeteringState["combinedState"];
	targetState: LivePreviewMeteringState["combinedState"];
}): LivePreviewMeteringState["combinedState"] {
	if (previousState.status !== "ready" || targetState.status !== "ready") {
		return targetState;
	}

	return {
		...targetState,
		channels: smoothMeterChannels({
			elapsedMs,
			previousChannels: previousState.channels,
			targetChannels: targetState.channels,
		}),
	};
}

function smoothTrackStateRecords({
	elapsedMs,
	previousStates,
	targetStates,
}: {
	elapsedMs: number;
	previousStates: LivePreviewMeteringState["trackStates"];
	targetStates: LivePreviewMeteringState["trackStates"];
}): LivePreviewMeteringState["trackStates"] {
	const smoothedStates: LivePreviewMeteringState["trackStates"] = {};

	for (const [trackId, targetState] of Object.entries(targetStates)) {
		const previousState = previousStates[trackId];

		if (
			!previousState ||
			previousState.status !== "ready" ||
			targetState.status !== "ready"
		) {
			smoothedStates[trackId] = targetState;
			continue;
		}

		smoothedStates[trackId] = {
			...targetState,
			channels: smoothMeterChannels({
				elapsedMs,
				previousChannels: previousState.channels,
				targetChannels: targetState.channels,
			}),
		};
	}

	return smoothedStates;
}

function smoothMeterChannels({
	elapsedMs,
	previousChannels,
	targetChannels,
}: {
	elapsedMs: number;
	previousChannels: PreviewLevelMeterChannel[];
	targetChannels: PreviewLevelMeterChannel[];
}): PreviewLevelMeterChannel[] {
	if (previousChannels.length !== targetChannels.length) {
		return targetChannels;
	}

	return targetChannels.map((targetChannel, channelIndex) => {
		const previousChannel = previousChannels[channelIndex];

		if (!previousChannel || previousChannel.label !== targetChannel.label) {
			return targetChannel;
		}

		return {
			...targetChannel,
			peakDb: smoothPeakDb({
				elapsedMs,
				previousPeakDb: previousChannel.peakDb,
				targetPeakDb: targetChannel.peakDb,
			}),
		};
	});
}

function smoothPeakDb({
	elapsedMs,
	previousPeakDb,
	targetPeakDb,
}: {
	elapsedMs: number;
	previousPeakDb: number;
	targetPeakDb: number;
}): number {
	if (!Number.isFinite(previousPeakDb) || !Number.isFinite(targetPeakDb)) {
		return targetPeakDb;
	}

	const timeConstantMs =
		targetPeakDb >= previousPeakDb
			? LIVE_PREVIEW_METERING_ATTACK_MS
			: LIVE_PREVIEW_METERING_RELEASE_MS;
	const alpha = 1 - Math.exp(-elapsedMs / timeConstantMs);
	const smoothedPeakDb =
		previousPeakDb + (targetPeakDb - previousPeakDb) * alpha;

	return Math.abs(targetPeakDb - smoothedPeakDb) <=
		LIVE_PREVIEW_METERING_SNAP_THRESHOLD_DB
		? targetPeakDb
		: smoothedPeakDb;
}

function requestPreviewMeteringPoll(
	callback: () => void,
	delayMs: number,
): number | null {
	if (typeof window.setTimeout !== "function") {
		return null;
	}

	return window.setTimeout(callback, delayMs);
}

function cancelPreviewMeteringPoll(timeoutId: number) {
	if (typeof window.clearTimeout !== "function") {
		return;
	}

	window.clearTimeout(timeoutId);
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
