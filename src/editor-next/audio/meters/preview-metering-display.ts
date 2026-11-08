import type { PreviewLevelMeterChannel } from "../types/preview-level-meter.types";
import type {
	LivePreviewMeteringState,
	PreviewMeterTarget,
	PreviewMeterTargetChannel,
} from "./preview-metering-live";

const ATTACK_MS = 20;
const RELEASE_MS = 220;
const SNAP_THRESHOLD_DB = 0.05;

export function advancePreviewMeterDisplay({
	elapsedMs,
	nowMs,
	previous,
	target,
}: {
	elapsedMs: number | null;
	nowMs: number;
	previous: LivePreviewMeteringState;
	target: PreviewMeterTarget;
}): { needsFrame: boolean; state: LivePreviewMeteringState } {
	let needsFrame = false;

	function displayChannels(
		targetChannels: PreviewMeterTargetChannel[],
		previousChannels: PreviewLevelMeterChannel[] | undefined,
	) {
		const sameLayout = previousChannels?.length === targetChannels.length;
		return targetChannels.map(({ clipUntilMs, label, peakDb }, index) => {
			const previousChannel = sameLayout
				? previousChannels?.[index]
				: undefined;
			const displayedPeakDb =
				elapsedMs !== null && previousChannel?.label === label
					? smoothPeakDb(previousChannel.peakDb, peakDb, elapsedMs)
					: peakDb;
			const clipHeld = clipUntilMs !== null && nowMs < clipUntilMs;
			needsFrame ||= displayedPeakDb !== peakDb || clipHeld;
			return { clipHeld, label, peakDb: displayedPeakDb };
		});
	}

	const trackStates: LivePreviewMeteringState["trackStates"] = {};
	for (const [trackId, track] of Object.entries(target.trackStates)) {
		const previousTrack = previous.trackStates[trackId];
		trackStates[trackId] =
			track.status === "ready"
				? {
						...track,
						channels: displayChannels(
							track.channels,
							previousTrack?.status === "ready"
								? previousTrack.channels
								: undefined,
						),
					}
				: track;
	}

	const combined = target.combinedState;
	const previousCombined = previous.combinedState;
	const combinedState =
		combined.status === "ready"
			? {
					...combined,
					channels: displayChannels(
						combined.channels,
						previousCombined.status === "ready"
							? previousCombined.channels
							: undefined,
					),
				}
			: combined;

	return { needsFrame, state: { combinedState, trackStates } };
}

function smoothPeakDb(previous: number, target: number, elapsedMs: number) {
	if (elapsedMs === 0) return previous;
	const timeConstantMs = target >= previous ? ATTACK_MS : RELEASE_MS;
	const peakDb =
		target + (previous - target) * Math.exp(-elapsedMs / timeConstantMs);
	return Math.abs(target - peakDb) <= SNAP_THRESHOLD_DB ? target : peakDb;
}

export function previewMeterDisplaysEqual(
	left: LivePreviewMeteringState,
	right: LivePreviewMeteringState,
) {
	const leftCombined = left.combinedState;
	const rightCombined = right.combinedState;
	if (
		leftCombined.status !== rightCombined.status ||
		leftCombined.reason !== rightCombined.reason
	) {
		return false;
	}
	if (
		leftCombined.status === "ready" &&
		rightCombined.status === "ready" &&
		(leftCombined.partial !== rightCombined.partial ||
			!channelsEqual(leftCombined.channels, rightCombined.channels))
	) {
		return false;
	}

	const leftIds = Object.keys(left.trackStates);
	if (leftIds.length !== Object.keys(right.trackStates).length) return false;
	return leftIds.every((trackId) => {
		const leftTrack = left.trackStates[trackId];
		const rightTrack = right.trackStates[trackId];
		if (!rightTrack || leftTrack.status !== rightTrack.status) return false;
		if (leftTrack.status === "ready" && rightTrack.status === "ready") {
			return channelsEqual(leftTrack.channels, rightTrack.channels);
		}
		if (
			leftTrack.status === "unavailable" &&
			rightTrack.status === "unavailable"
		) {
			return (
				leftTrack.reason === rightTrack.reason &&
				leftTrack.retryStatus === rightTrack.retryStatus
			);
		}
		return true;
	});
}

function channelsEqual(
	left: PreviewLevelMeterChannel[],
	right: PreviewLevelMeterChannel[],
) {
	return (
		left.length === right.length &&
		left.every((channel, index) => {
			const other = right[index];
			return (
				channel.label === other.label &&
				channel.clipHeld === other.clipHeld &&
				channel.peakDb === other.peakDb
			);
		})
	);
}
