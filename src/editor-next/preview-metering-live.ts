import type { PreviewAudioEngineMeterSnapshot } from "./preview-audio-engine";
import type { PreviewLevelMeterChannel } from "./preview-level-meter";
import { previewPeakMeterVisualRange } from "./preview-level-meter";

const PREVIEW_METERING_CLIP_HOLD_MS = 750;
const COMBINED_PREVIEW_OUTPUT_CLIP_HOLD_KEY = "__combined-preview-output__";

export type LivePreviewMeteringSourceStatus =
	| "failed"
	| "idle"
	| "preparing"
	| "ready";

export type LivePreviewMeteringTrackState =
	| {
			status: "preparing";
			trackId: string;
	  }
	| {
			channels: PreviewLevelMeterChannel[];
			excluded: boolean;
			status: "ready";
			trackId: string;
	  }
	| {
			reason: string;
			status: "unavailable";
			trackId: string;
	  };

export type LivePreviewMeteringTrackStates = Record<
	string,
	LivePreviewMeteringTrackState
>;

export type LivePreviewMeteringCombinedState =
	| {
			channels: PreviewLevelMeterChannel[];
			partial: boolean;
			reason?: string;
			status: "ready";
	  }
	| {
			reason?: string;
			status: "preparing";
	  }
	| {
			reason: string;
			status: "unavailable";
	  };

export type LivePreviewMeteringState = {
	combinedState: LivePreviewMeteringCombinedState;
	trackStates: LivePreviewMeteringTrackStates;
};

export type LivePreviewMeteringClock = {
	getIsPlaying: () => boolean;
	getMeteringStatus: () => LivePreviewMeteringSourceStatus;
	readMeterSnapshot: () => PreviewAudioEngineMeterSnapshot | null;
};

export type LivePreviewMeteringClipHoldState = Record<
	string,
	Record<number, number>
>;

export type CreateLivePreviewMeteringTrackStatesOptions = {
	excludedTrackIds?: ReadonlySet<string>;
	isPlaying: boolean;
	knownTrackIds: string[];
	meterSnapshot: PreviewAudioEngineMeterSnapshot | null;
	meteringStatus: LivePreviewMeteringSourceStatus;
	nowMs: number;
	previousClipHoldState?: LivePreviewMeteringClipHoldState;
};

export type LivePreviewMeteringTrackStatesResult = {
	clipHoldState: LivePreviewMeteringClipHoldState;
} & LivePreviewMeteringState;

export function createLivePreviewMeteringTrackStates({
	excludedTrackIds = new Set(),
	isPlaying,
	knownTrackIds,
	meterSnapshot,
	meteringStatus,
	nowMs,
	previousClipHoldState = {},
}: CreateLivePreviewMeteringTrackStatesOptions): LivePreviewMeteringTrackStatesResult {
	if (meteringStatus === "failed") {
		return createUnavailableLivePreviewMeteringState(knownTrackIds);
	}

	if (meteringStatus !== "ready" || !meterSnapshot) {
		return createPreparingLivePreviewMeteringState(knownTrackIds);
	}

	const clipHoldState: LivePreviewMeteringClipHoldState = {};
	const trackStates: LivePreviewMeteringTrackStates = {};
	const trackIds = createMeteredTrackIds(knownTrackIds, meterSnapshot);

	for (const trackId of trackIds) {
		const snapshotState = meterSnapshot.trackStates[trackId];

		if (!snapshotState) {
			trackStates[trackId] = {
				status: "preparing",
				trackId,
			};
			continue;
		}

		if (snapshotState.status === "unavailable") {
			trackStates[trackId] = snapshotState;
			continue;
		}

		const meteredChannels = createMeterChannelsFromEnginePeaks({
			channels: snapshotState.channels,
			isPlaying,
			nowMs,
			previousClipHoldByChannel: previousClipHoldState[trackId],
		});

		if (Object.keys(meteredChannels.clipHoldByChannel).length > 0) {
			clipHoldState[trackId] = meteredChannels.clipHoldByChannel;
		}

		trackStates[trackId] = {
			channels: meteredChannels.channels,
			excluded: excludedTrackIds.has(trackId),
			status: "ready",
			trackId,
		};
	}

	const combinedState = createCombinedLivePreviewMeteringState({
		isPlaying,
		meterSnapshot,
		nowMs,
		previousClipHoldByChannel:
			previousClipHoldState[COMBINED_PREVIEW_OUTPUT_CLIP_HOLD_KEY],
	});

	if (Object.keys(combinedState.clipHoldByChannel).length > 0) {
		clipHoldState[COMBINED_PREVIEW_OUTPUT_CLIP_HOLD_KEY] =
			combinedState.clipHoldByChannel;
	}

	return {
		clipHoldState,
		combinedState: combinedState.state,
		trackStates,
	};
}

function createPreparingLivePreviewMeteringState(
	knownTrackIds: string[],
): LivePreviewMeteringTrackStatesResult {
	return {
		clipHoldState: {},
		combinedState: {
			reason: "Preparing engine meter taps",
			status: "preparing",
		},
		trackStates: Object.fromEntries(
			knownTrackIds.map((trackId) => [
				trackId,
				{
					status: "preparing",
					trackId,
				} satisfies LivePreviewMeteringTrackState,
			]),
		),
	};
}

function createUnavailableLivePreviewMeteringState(
	knownTrackIds: string[],
): LivePreviewMeteringTrackStatesResult {
	const reason = "Preview audio engine meter taps unavailable";

	return {
		clipHoldState: {},
		combinedState: {
			reason,
			status: "unavailable",
		},
		trackStates: Object.fromEntries(
			knownTrackIds.map((trackId) => [
				trackId,
				{
					reason,
					status: "unavailable",
					trackId,
				} satisfies LivePreviewMeteringTrackState,
			]),
		),
	};
}

function createMeteredTrackIds(
	knownTrackIds: string[],
	meterSnapshot: PreviewAudioEngineMeterSnapshot,
) {
	return Array.from(
		new Set([...knownTrackIds, ...Object.keys(meterSnapshot.trackStates)]),
	);
}

function createCombinedLivePreviewMeteringState({
	isPlaying,
	meterSnapshot,
	nowMs,
	previousClipHoldByChannel,
}: {
	isPlaying: boolean;
	meterSnapshot: PreviewAudioEngineMeterSnapshot;
	nowMs: number;
	previousClipHoldByChannel?: Record<number, number>;
}): {
	clipHoldByChannel: Record<number, number>;
	state: LivePreviewMeteringCombinedState;
} {
	if (meterSnapshot.combinedState.status === "unavailable") {
		return {
			clipHoldByChannel: {},
			state: meterSnapshot.combinedState,
		};
	}

	const meteredChannels = createMeterChannelsFromEnginePeaks({
		channels: meterSnapshot.combinedState.channels,
		isPlaying,
		nowMs,
		previousClipHoldByChannel,
	});

	return {
		clipHoldByChannel: meteredChannels.clipHoldByChannel,
		state: {
			channels: meteredChannels.channels,
			partial: meterSnapshot.combinedState.partial,
			reason: meterSnapshot.combinedState.reason,
			status: "ready",
		},
	};
}

function createMeterChannelsFromEnginePeaks({
	channels,
	isPlaying,
	nowMs,
	previousClipHoldByChannel = {},
}: {
	channels: { label: string; peak: number }[];
	isPlaying: boolean;
	nowMs: number;
	previousClipHoldByChannel?: Record<number, number>;
}): {
	channels: PreviewLevelMeterChannel[];
	clipHoldByChannel: Record<number, number>;
} {
	const clipHoldByChannel: Record<number, number> = {};
	const meteredChannels = channels.map((channel, channelIndex) => {
		const peak = isPlaying ? channel.peak : 0;
		const clipped = peak >= 1;
		const lastClipMs = clipped
			? nowMs
			: previousClipHoldByChannel[channelIndex];
		const clipHeld =
			typeof lastClipMs === "number" &&
			nowMs - lastClipMs <= PREVIEW_METERING_CLIP_HOLD_MS;

		if (clipHeld && typeof lastClipMs === "number") {
			clipHoldByChannel[channelIndex] = lastClipMs;
		}

		return {
			clipHeld,
			label: channel.label,
			peakDb: linearPeakToDb(peak),
		};
	});

	return {
		channels: meteredChannels,
		clipHoldByChannel,
	};
}

function linearPeakToDb(peak: number): number {
	if (!Number.isFinite(peak) || peak <= 0) {
		return previewPeakMeterVisualRange.floorDb;
	}

	return Math.min(
		previewPeakMeterVisualRange.ceilingDb,
		Math.max(previewPeakMeterVisualRange.floorDb, 20 * Math.log10(peak)),
	);
}
