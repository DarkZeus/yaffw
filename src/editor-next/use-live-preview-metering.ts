import { useEffect, useMemo, useRef, useState } from "react";

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
			{ clipHeld: false, label: "Left", peakDb: -72 },
			{ clipHeld: false, label: "Right", peakDb: -72 },
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
	const knownTrackIdsKey = knownTrackIds.join("\u0000");
	const stableKnownTrackIds = useMemo(() => knownTrackIds, [knownTrackIdsKey]);
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
		let lastDisplayUpdateTimestampMs: number | null = null;

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

			timeoutId = requestPreviewMeteringPoll(
				updateLiveMeters,
				isPlaying
					? LIVE_PREVIEW_METERING_COMMIT_INTERVAL_MS
					: PAUSED_PREVIEW_METERING_POLL_INTERVAL_MS,
			);
		}

		function updateLiveMeters(timestampMs?: number) {
			if (cancelled) {
				return;
			}

			const isPlaying = clock?.getIsPlaying() ?? false;
			const displayTimestampMs =
				typeof timestampMs === "number" ? timestampMs : now();
			const elapsedDisplayMs =
				displayTimestampMs !== null && lastDisplayUpdateTimestampMs !== null
					? displayTimestampMs - lastDisplayUpdateTimestampMs
					: null;
			const shouldCommitDisplay =
				!isPlaying ||
				elapsedDisplayMs === null ||
				elapsedDisplayMs >= LIVE_PREVIEW_METERING_COMMIT_INTERVAL_MS;

			if (!shouldCommitDisplay) {
				scheduleNextUpdate(isPlaying);
				return;
			}

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
			const targetMeteringState = {
				combinedState: result.combinedState,
				trackStates: result.trackStates,
			} satisfies LivePreviewMeteringState;
			const displayMeteringState = smoothLivePreviewMeteringState({
				elapsedMs: elapsedDisplayMs,
				previousState: liveMeteringStateRef.current,
				targetState: targetMeteringState,
			});

			commitLiveMeteringState(displayMeteringState);

			if (displayTimestampMs !== null) {
				lastDisplayUpdateTimestampMs = displayTimestampMs;
			}

			scheduleNextUpdate(isPlaying);
		}

		updateLiveMeters();

		return () => {
			cancelled = true;

			if (timeoutId !== null) {
				cancelPreviewMeteringPoll(timeoutId);
			}
		};
	}, [audioMix, clock, enabled, now, soloedAudioTrackId, stableKnownTrackIds]);

	return liveMeteringState;
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
	if (elapsedMs === null || elapsedMs <= 0) {
		return targetState;
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
