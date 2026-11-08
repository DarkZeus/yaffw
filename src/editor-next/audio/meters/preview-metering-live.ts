import type { PreviewAudioEngineMeterSnapshot } from "../types/preview-audio-engine.types";
import type { PreviewLevelMeterChannel } from "../types/preview-level-meter.types";
import { previewPeakMeterVisualRange } from "./preview-level-meter.constants";

const PREVIEW_METERING_CLIP_HOLD_MS = 750;

export type LivePreviewMeteringSourceStatus =
	| "degraded"
	| "failed"
	| "idle"
	| "preparing"
	| "ready";

export type LivePreviewMeteringTrackState<Channel = PreviewLevelMeterChannel> =
	| { status: "preparing"; trackId: string }
	| { channels: Channel[]; status: "ready"; trackId: string }
	| { reason: string; status: "unavailable"; trackId: string };

export type LivePreviewMeteringCombinedState<
	Channel = PreviewLevelMeterChannel,
> =
	| { channels: Channel[]; partial: boolean; reason?: string; status: "ready" }
	| { reason?: string; status: "preparing" }
	| { reason: string; status: "unavailable" };

export type LivePreviewMeteringState<Channel = PreviewLevelMeterChannel> = {
	combinedState: LivePreviewMeteringCombinedState<Channel>;
	trackStates: Record<string, LivePreviewMeteringTrackState<Channel>>;
};

export type LivePreviewMeteringClock = {
	getIsPlaying: () => boolean;
	getMeteringStatus: () => LivePreviewMeteringSourceStatus;
	readMeterSnapshot: (
		sampleSignal: boolean,
	) => PreviewAudioEngineMeterSnapshot | null;
	subscribeToPlaybackStateChange: (listener: () => void) => () => void;
};

export type PreviewMeterTargetChannel = {
	clipUntilMs: number | null;
	label: string;
	peakDb: number;
};

export type PreviewMeterTarget =
	LivePreviewMeteringState<PreviewMeterTargetChannel>;

export const PREPARING_PREVIEW_METERS = {
	combinedState: {
		reason: "Preparing engine meter taps",
		status: "preparing",
	},
	trackStates: {},
} satisfies LivePreviewMeteringState<never>;

export function createPreviewMeterTarget({
	knownTrackIds,
	meterSnapshot,
	meteringStatus,
	nowMs,
	previousTarget,
	sampleSignal,
}: {
	knownTrackIds: string[];
	meterSnapshot: PreviewAudioEngineMeterSnapshot | null;
	meteringStatus: LivePreviewMeteringSourceStatus;
	nowMs: number;
	previousTarget: PreviewMeterTarget | null;
	sampleSignal: boolean;
}): PreviewMeterTarget {
	if (meteringStatus === "failed") {
		const reason = "Preview audio engine meter taps unavailable";
		return {
			combinedState: { reason, status: "unavailable" },
			trackStates: Object.fromEntries(
				knownTrackIds.map((trackId) => [
					trackId,
					{ reason, status: "unavailable", trackId },
				]),
			),
		};
	}

	if (!meterSnapshot) {
		return {
			combinedState: PREPARING_PREVIEW_METERS.combinedState,
			trackStates: Object.fromEntries(
				knownTrackIds.map((trackId) => [
					trackId,
					{ status: "preparing", trackId },
				]),
			),
		};
	}

	const trackStates: PreviewMeterTarget["trackStates"] = {};
	for (const trackId of new Set([
		...knownTrackIds,
		...Object.keys(meterSnapshot.trackStates),
	])) {
		const state = meterSnapshot.trackStates[trackId];
		const previous = previousTarget?.trackStates[trackId];
		if (!state) {
			trackStates[trackId] = { status: "preparing", trackId };
		} else if (state.status === "unavailable") {
			trackStates[trackId] = state;
		} else {
			trackStates[trackId] = {
				...state,
				channels: createTargetChannels(
					state.channels,
					previous?.status === "ready" ? previous.channels : [],
					sampleSignal,
					nowMs,
				),
			};
		}
	}

	const combined = meterSnapshot.combinedState;
	const previousCombined = previousTarget?.combinedState;
	return {
		combinedState:
			combined.status === "unavailable"
				? combined
				: {
						...combined,
						channels: createTargetChannels(
							combined.channels,
							previousCombined?.status === "ready"
								? previousCombined.channels
								: [],
							sampleSignal,
							nowMs,
						),
					},
		trackStates,
	};
}

function createTargetChannels(
	channels: { label: string; peak: number }[],
	previousChannels: PreviewMeterTargetChannel[],
	sampleSignal: boolean,
	nowMs: number,
): PreviewMeterTargetChannel[] {
	return channels.map(({ label, peak }, index) => {
		const previous = previousChannels[index];
		const previousDeadline =
			previous?.label === label ? previous.clipUntilMs : null;
		const signalPeak = sampleSignal && Number.isFinite(peak) ? peak : 0;
		return {
			clipUntilMs:
				signalPeak >= 1
					? nowMs + PREVIEW_METERING_CLIP_HOLD_MS
					: previousDeadline !== null && previousDeadline > nowMs
						? previousDeadline
						: null,
			label,
			peakDb: linearPeakToDb(signalPeak),
		};
	});
}

function linearPeakToDb(peak: number): number {
	const { ceilingDb, floorDb } = previewPeakMeterVisualRange;
	return peak <= 0
		? floorDb
		: Math.min(ceilingDb, Math.max(floorDb, 20 * Math.log10(peak)));
}
