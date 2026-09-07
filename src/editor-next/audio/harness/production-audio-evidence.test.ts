import { describe, expect, it } from "vitest";
import {
	type ProductionAudioTrial,
	evaluateProductionAudioTrials,
} from "./production-audio-evidence";
import { distribution } from "./production-audio-profiler";

describe("production evidence acceptance gate", () => {
	it("requires all five complete trials even when every supplied trial passes", () => {
		expect(evaluateProductionAudioTrials([]).passed).toBe(false);
		expect(evaluateProductionAudioTrials([passingTrial()]).passed).toBe(false);
		expect(evaluateProductionAudioTrials(fiveTrials()).passed).toBe(true);
	});

	it.each([
		[
			"underrun",
			(trial: ProductionAudioTrial) => {
				trial.beforeCleanup.engine.underruns = 1;
			},
		],
		[
			"PCM over horizon budget",
			(trial: ProductionAudioTrial) => {
				trial.beforeCleanup.engine.peakRetainedPcmBytes = 2 * 1024 * 1024 + 1;
			},
		],
		[
			"unclosed context",
			(trial: ProductionAudioTrial) => {
				trial.cleanup.context.contextsClosed = 0;
			},
		],
		[
			"undisconnected source",
			(trial: ProductionAudioTrial) => {
				trial.cleanup.context.residualSources = 1;
			},
		],
		[
			"active timer",
			(trial: ProductionAudioTrial) => {
				trial.cleanup.engine.activeTimers = 1;
			},
		],
		[
			"missed stall",
			(trial: ProductionAudioTrial) => {
				trial.responsiveness.stalls.pop();
			},
		],
		[
			"incomplete playback",
			(trial: ProductionAudioTrial) => {
				trial.observedPlaybackSeconds = 29.99;
			},
		],
		[
			"readiness outlier",
			(trial: ProductionAudioTrial) => {
				trial.readinessMs = 251;
			},
		],
		[
			"runtime error",
			(trial: ProductionAudioTrial) => {
				trial.errors.push("decode failed");
			},
		],
		[
			"missing track at barrier",
			(trial: ProductionAudioTrial) => {
				trial.readinessStates = { first: "playable" };
			},
		],
	])("fails on %s in any trial", (_name, mutate) => {
		const trials = fiveTrials();
		mutate(trials[4]);
		expect(evaluateProductionAudioTrials(trials).passed).toBe(false);
	});
});

function fiveTrials() {
	return Array.from({ length: 5 }, () => passingTrial());
}

function passingTrial(): ProductionAudioTrial {
	const metrics = {
		generationsOpened: 1,
		generationsCancelled: 1,
		stalePullResults: 0,
		trackRetries: 0,
		cleanupCount: 1,
		activeTimers: 0,
		engine: {
			cleanupCount: 1,
			generationResets: 1,
			maxUnderrunSeconds: 0,
			minScheduledLeadSeconds: 0.5,
			peakLiveSourceNodes: 24,
			peakRetainedPcmBytes: 1_700_000,
			retainedPcmBytes: 0,
			sourceNodesCreated: 360,
			sourceNodesEnded: 336,
			sourceNodesStopped: 24,
			staleTrackStatePublications: 0,
			totalUnderrunSeconds: 0,
			underruns: 0,
		},
	};
	return {
		trialNumber: 1,
		readinessMs: 25,
		readinessStates: { first: "playable", second: "playable" },
		observedPlaybackSeconds: 30,
		atReadiness: structuredClone(metrics),
		beforeCleanup: structuredClone(metrics),
		responsiveness: {
			allTimerIntervals: distribution([10, 11, 10]),
			naturalTimerIntervals: distribution([10, 11, 10]),
			longTasks: null,
			stalls: [250, 500, 1_000].map((duration) => ({
				requestedMs: duration,
				actualMs: duration,
			})),
		},
		cleanup: {
			engine: structuredClone(metrics),
			provider: {
				generationsOpened: 1,
				generationsCancelled: 1,
				activeGenerations: 0,
				pulls: 58,
				publishedChunks: 360,
				publishedPcmBytes: 24_000_000,
				publishedMediaSeconds: 63,
				disposalsCompleted: 1,
				initialTrackStates: { first: "playable", second: "playable" },
			},
			context: {
				contextsClosed: 1,
				contextState: "closed",
				sourcesCreated: 360,
				sourcesDisconnected: 360,
				residualSources: 0,
			},
		},
		errors: [],
	};
}
