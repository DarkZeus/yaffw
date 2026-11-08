import { useEffect, useEffectEvent, useState } from "react";
import {
	browserNowMs,
	cancelBrowserFrame,
	requestBrowserFrame,
} from "@/lib/browser-animation-frame";
import {
	advancePreviewMeterDisplay,
	previewMeterDisplaysEqual,
} from "./preview-metering-display";
import {
	type LivePreviewMeteringClock,
	type LivePreviewMeteringState,
	type PreviewMeterTarget,
	PREPARING_PREVIEW_METERS,
	createPreviewMeterTarget,
} from "./preview-metering-live";

const SIGNAL_SAMPLE_INTERVAL_MS = 50;
const PAUSED_READINESS_POLL_INTERVAL_MS = 250;

type MeteringPhase = "sampling" | "decaying" | "settled";

export function useLivePreviewMetering({
	clock,
	knownTrackIds,
	now = browserNowMs,
}: {
	clock: LivePreviewMeteringClock | null;
	knownTrackIds: string[];
	now?: () => number;
}): LivePreviewMeteringState {
	const readNow = useEffectEvent(now);
	const readKnownTrackIds = useEffectEvent(() => knownTrackIds);
	const [published, setPublished] = useState<{
		clock: LivePreviewMeteringClock;
		state: LivePreviewMeteringState;
	} | null>(null);

	useEffect(() => {
		if (!clock) return;
		const source = clock;

		let phase: MeteringPhase = "settled";
		let disposed = false;
		let generation = 0;
		let pollId: number | null = null;
		let frameId: number | null = null;
		let target: PreviewMeterTarget | null = null;
		let targetTimeMs = 0;
		let displayTimeMs: number | null = null;
		let displayed: LivePreviewMeteringState = PREPARING_PREVIEW_METERS;

		function cancelScheduledWork() {
			// An already dequeued callback can still run after its handle is canceled.
			generation += 1;
			if (pollId !== null) window.clearTimeout(pollId);
			if (frameId !== null) cancelBrowserFrame(frameId);
			pollId = null;
			frameId = null;
		}

		function paint(timestampMs: number) {
			if (!target || timestampMs < targetTimeMs) return phase !== "settled";
			const nowMs = Math.max(displayTimeMs ?? timestampMs, timestampMs);
			const { needsFrame, state } = advancePreviewMeterDisplay({
				elapsedMs: displayTimeMs === null ? null : nowMs - displayTimeMs,
				nowMs,
				previous: displayed,
				target,
			});
			displayTimeMs = nowMs;
			if (phase !== "sampling") phase = needsFrame ? "decaying" : "settled";
			if (!previewMeterDisplaysEqual(displayed, state)) {
				displayed = state;
				setPublished({ clock: source, state });
			}
			return needsFrame;
		}

		function scheduleFrame(owner: number) {
			if (frameId !== null) return;
			frameId = requestBrowserFrame((timestampMs) => {
				if (owner !== generation) return;
				frameId = null;
				if (paint(timestampMs)) scheduleFrame(owner);
			});
		}

		function refreshTarget(owner: number) {
			const status = source.getMeteringStatus();
			const ready = status === "ready" || status === "degraded";
			const sampleSignal = ready && source.getIsPlaying();
			const nowMs = readNow();
			// Paused reads only refresh readiness, channel layout, and failure details.
			const snapshot =
				ready || status === "failed"
					? source.readMeterSnapshot(sampleSignal)
					: null;
			if (owner !== generation) return;

			target = createPreviewMeterTarget({
				knownTrackIds: readKnownTrackIds(),
				meterSnapshot: snapshot,
				meteringStatus: status,
				nowMs,
				previousTarget: target,
				sampleSignal,
			});
			targetTimeMs = nowMs;
			if (sampleSignal) phase = "sampling";
			else if (phase === "sampling") phase = "decaying";
			const animate =
				displayTimeMs === null || !sampleSignal ? paint(nowMs) : true;
			if (animate) scheduleFrame(owner);

			const delay =
				phase === "sampling"
					? SIGNAL_SAMPLE_INTERVAL_MS
					: PAUSED_READINESS_POLL_INTERVAL_MS;
			pollId = window.setTimeout(() => {
				if (owner !== generation) return;
				pollId = null;
				refreshTarget(owner);
			}, delay);
		}

		const unsubscribe = source.subscribeToPlaybackStateChange(() => {
			if (disposed) return;
			cancelScheduledWork();
			refreshTarget(generation);
		});
		if (generation === 0) refreshTarget(generation);

		return () => {
			disposed = true;
			cancelScheduledWork();
			unsubscribe();
		};
	}, [clock]);

	return clock && published?.clock === clock
		? published.state
		: PREPARING_PREVIEW_METERS;
}
