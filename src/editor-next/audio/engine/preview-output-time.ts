import type { ScheduledWindowPlaybackEpoch } from "./scheduled-window-engine";

type OutputTimestamp = { contextTime?: number; performanceTime?: number };

/**
 * Presentation-only projection of the browser output timestamp onto the source epoch.
 * No baseLatency/outputLatency subtraction: the timestamp already describes output.
 * The transport still ends/loops on rendering time; there is no output drain phase.
 */
export function createPreviewOutputTime() {
	let epochId: number | undefined;
	let lastTime = 0;
	let lastPair: { contextTime: number; performanceTime: number } | undefined;
	return {
		read({
			epoch,
			renderingTimeSeconds,
			contextTimeSeconds,
			performanceTimeMilliseconds,
			timestamp,
		}: {
			epoch: ScheduledWindowPlaybackEpoch | null;
			renderingTimeSeconds: number;
			contextTimeSeconds: number;
			performanceTimeMilliseconds: number;
			timestamp?: OutputTimestamp;
		}) {
			if (!epoch) {
				epochId = undefined;
				lastPair = undefined;
				return renderingTimeSeconds;
			}
			if (epoch.id !== epochId) {
				epochId = epoch.id;
				lastTime = epoch.mediaTimeSeconds;
				lastPair = undefined;
			}
			const contextTime = timestamp?.contextTime ?? Number.NaN;
			const performanceTime = timestamp?.performanceTime ?? Number.NaN;
			const ageSeconds = (performanceTimeMilliseconds - performanceTime) / 1000;
			// Bound extrapolation to 250 ms; tolerate 20 ms of clock sampling skew.
			// A pair-to-pair clock discrepancy over 100 ms invalidates the mapping
			// (for example after an output-device change). These are validity guards,
			// not a device-latency estimate or a correction applied to scheduling.
			const valid =
				Number.isFinite(contextTime) &&
				Number.isFinite(performanceTime) &&
				contextTime > 0 &&
				performanceTime > 0 &&
				ageSeconds >= -0.02 &&
				ageSeconds <= 0.25 &&
				contextTime <= contextTimeSeconds + 0.02 &&
				(!lastPair ||
					(contextTime >= lastPair.contextTime &&
						performanceTime >= lastPair.performanceTime &&
						Math.abs(
							contextTime -
								lastPair.contextTime -
								(performanceTime - lastPair.performanceTime) / 1000,
						) <= 0.1));
			const candidate = valid
				? epoch.mediaTimeSeconds +
					(contextTime + Math.max(0, ageSeconds) - epoch.contextTimeSeconds) *
						epoch.playbackRate
				: renderingTimeSeconds;
			lastPair = valid ? { contextTime, performanceTime } : undefined;
			// Invalid reads use the established clock. On recovery hold until output catches
			// up, avoiding backward UI jumps; a new scheduler epoch explicitly resets this.
			lastTime = Math.min(
				epoch.endSeconds,
				Math.max(
					epoch.mediaTimeSeconds,
					lastTime,
					Math.min(renderingTimeSeconds, candidate),
				),
			);
			return lastTime;
		},
	};
}
