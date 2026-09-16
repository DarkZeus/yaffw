import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import { analyzeLocalMediaAssetDraft } from "@/editor-core/local-file-analysis";
import { createLocalMediaAssetDraft } from "@/editor-core/local-file-import";
import type { ReadyMediaAsset } from "@/editor-core/model";
import { detectRuntimeSupport } from "@/editor-core/runtime-capabilities";
import { inspectBrowserLocalMediaAssetDraft } from "../../media-asset/adapters/browser-local-asset-analyzer";
import {
	type PreviewAudioEngine,
	type PreviewAudioEngineMeterSnapshot,
	applyPreviewAudioEngineMix,
	createPreviewAudioEngine,
} from "../engine/preview-audio-engine";
import { preparePreviewAudioResources } from "../engine/preview-audio-resources";
import {
	observeProductionContext,
	observeProductionProvider,
} from "./production-audio-observer";
import {
	createProductionAudioProfiler,
	delay,
	distribution,
	waitUntil,
} from "./production-audio-profiler";

const CONTROLLED_SHA256 =
	"75d390a7cf42f52b6360c28d8408447075742720bc3f7b3e31d467eab613400a";
const PLAYBACK_SECONDS = 30;
const STALLS = [
	{ atSeconds: 4, durationMs: 250 },
	{ atSeconds: 10, durationMs: 500 },
	{ atSeconds: 18, durationMs: 1_000 },
] as const;

export async function inspectProductionAudioFixture(file: File) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		await file.arrayBuffer(),
	);
	const sha256 = [...new Uint8Array(digest)]
		.map((value) => value.toString(16).padStart(2, "0"))
		.join("");
	const analysis = await analyzeLocalMediaAssetDraft(
		createLocalMediaAssetDraft(file),
		{
			inspect: inspectBrowserLocalMediaAssetDraft,
			runtime: detectRuntimeSupport(),
		},
	);
	if (analysis.status !== "ready") throw new Error(analysis.failure.message);
	return {
		asset: analysis.asset,
		fixture: {
			name: file.name,
			sizeBytes: file.size,
			sha256,
			durationUs: analysis.asset.durationUs,
			tracks: analysis.asset.tracks,
		},
	};
}

export async function prepareProductionAudioRun(
	file: File,
	asset: ReadyMediaAsset,
	failTrackId?: string,
) {
	const context = observeProductionContext();
	const abort = new AbortController();
	const started = performance.now();
	try {
		const prepared = await preparePreviewAudioResources({
			asset,
			source: file,
			signal: abort.signal,
		});
		const observed = observeProductionProvider(prepared.provider);
		if (failTrackId) observed.failNextPullForTrack(failTrackId);
		try {
			const engine = await createPreviewAudioEngine({
				...prepared,
				provider: observed.provider,
				outputChannels: 2,
				createAudioContext: context.createAudioContext,
				signal: abort.signal,
			});
			applyPreviewAudioEngineMix({
				audioMix: createDefaultAudioMix(asset),
				muted: false,
				previewAudioEngine: engine,
				resources: prepared.resources,
				volume: 1,
			});
			const readinessMs = performance.now() - started;
			return {
				engine,
				context,
				observed,
				readinessMs,
				async cleanup() {
					engine.destroy();
					await observed.provider.dispose();
					await context.waitForClose();
					abort.abort();
					return {
						engine: engine.getMetrics(),
						provider: observed.getMetrics(),
						context: context.getMetrics(),
					};
				},
			};
		} catch (error) {
			await observed.provider.dispose();
			throw error;
		}
	} catch (error) {
		abort.abort();
		await context.context.close();
		throw error;
	}
}

async function runTrial(
	file: File,
	asset: ReadyMediaAsset,
	trialNumber: number,
) {
	const profiler = createProductionAudioProfiler();
	const run = await prepareProductionAudioRun(file, asset).catch((error) => {
		profiler.stop();
		throw error;
	});
	const atReadiness = run.engine.getMetrics();
	const readinessStates = run.observed.getMetrics().initialTrackStates;
	const errors: string[] = [];
	let observedPlaybackSeconds = 0;
	let beforeCleanup = atReadiness;
	try {
		if (run.engine.getStatus() !== "ready")
			throw new Error(`Unexpected readiness status: ${run.engine.getStatus()}`);
		await run.engine.play();
		const start = performance.now();
		let stallIndex = 0;
		while (performance.now() - start < PLAYBACK_SECONDS * 1_000) {
			const elapsed = (performance.now() - start) / 1_000;
			const stall = STALLS[stallIndex];
			if (stall && elapsed >= stall.atSeconds) {
				profiler.stall(stall.durationMs);
				stallIndex++;
			}
			await delay(20);
		}
		observedPlaybackSeconds = (performance.now() - start) / 1_000;
		beforeCleanup = run.engine.getMetrics();
	} catch (error) {
		errors.push(error instanceof Error ? error.message : String(error));
	} finally {
		run.engine.pause();
	}
	const responsiveness = profiler.stop();
	const cleanup = await run.cleanup();
	return {
		trialNumber,
		readinessMs: run.readinessMs,
		readinessStates,
		observedPlaybackSeconds,
		atReadiness,
		beforeCleanup,
		responsiveness,
		cleanup,
		errors,
	};
}

export type ProductionAudioTrial = Awaited<ReturnType<typeof runTrial>>;

export function evaluateProductionAudioTrials(trials: ProductionAudioTrial[]) {
	const readiness = distribution(trials.map((trial) => trial.readinessMs));
	const gates = {
		fiveCompleteTrials:
			trials.length === 5 &&
			trials.every(
				(trial) =>
					trial.observedPlaybackSeconds >= 30 && trial.errors.length === 0,
			),
		medianReadinessBelow100MsAndBothBaselines:
			readiness.medianMs < 100 && readiness.medianMs < 259,
		p95ReadinessBelow250Ms: readiness.p95Ms < 250,
		peakPcmAtMost2MiB: trials.every(
			(trial) =>
				trial.beforeCleanup.engine.peakRetainedPcmBytes <= 2 * 1024 * 1024,
		),
		zeroUnderruns: trials.every(
			(trial) => trial.beforeCleanup.engine.underruns === 0,
		),
		naturalTimerP95AtMost25Ms: trials.every(
			(trial) =>
				trial.responsiveness.naturalTimerIntervals.count > 0 &&
				trial.responsiveness.naturalTimerIntervals.p95Ms <= 25,
		),
		sourceChurnAtMost14PerSecond: trials.every(
			(trial) =>
				trial.beforeCleanup.engine.sourceNodesCreated /
					trial.observedPlaybackSeconds <=
				14,
		),
		allStallsObserved: trials.every(
			(trial) =>
				trial.responsiveness.stalls.length === 3 &&
				trial.responsiveness.stalls.every(
					(stall, index) => stall.actualMs >= STALLS[index].durationMs,
				),
		),
		allTracksCrossReadinessBarrier: trials.every(
			(trial) =>
				Object.values(trial.readinessStates).length === 2 &&
				Object.values(trial.readinessStates).every(
					(state) =>
						state === "playable" || state === "silence" || state === "failure",
				),
		),
		cleanup: trials.every((trial) => cleanupPassed(trial.cleanup)),
	};
	return { readiness, gates, passed: Object.values(gates).every(Boolean) };
}

export async function runProductionAudioEvidence({
	file,
	revision,
	onTrial,
}: {
	file: File;
	revision: string;
	onTrial?: (trial: ProductionAudioTrial) => void;
}) {
	const { asset, fixture } = await inspectProductionAudioFixture(file);
	if (fixture.sha256 !== CONTROLLED_SHA256)
		throw new Error(
			"Performance evidence requires the recorded 120-second two-track AAC fixture.",
		);
	const trials: ProductionAudioTrial[] = [];
	for (let trialNumber = 1; trialNumber <= 5; trialNumber++) {
		const trial = await runTrial(file, asset, trialNumber);
		trials.push(trial);
		onTrial?.(trial);
	}
	return {
		issue: 109,
		schemaVersion: 1,
		recordedAt: new Date().toISOString(),
		revision,
		runtime: {
			userAgent: navigator.userAgent,
			platform: navigator.platform,
			mediabunnyVersion: "1.52.2",
		},
		fixture,
		config: {
			playbackSeconds: PLAYBACK_SECONDS,
			windowSeconds: 2,
			lowWaterSeconds: 1.5,
			pumpIntervalMs: 50,
			chunkTargetSeconds: 0.2,
			stalls: STALLS,
		},
		measurementScope:
			"Production engine scheduler retained AudioBuffer PCM; provider publication counters do not claim decoder-internal memory or decode work. Source disconnect and AudioContext close observed independently. Sample, iterator and Input ownership covered by provider tests.",
		trials,
		evaluation: evaluateProductionAudioTrials(trials),
	};
}

function cleanupPassed(
	cleanup: Awaited<
		ReturnType<Awaited<ReturnType<typeof prepareProductionAudioRun>>["cleanup"]>
	>,
) {
	return (
		cleanup.engine.engine.retainedPcmBytes === 0 &&
		cleanup.engine.activeTimers === 0 &&
		cleanup.provider.activeGenerations === 0 &&
		cleanup.provider.disposalsCompleted === 1 &&
		cleanup.context.residualSources === 0 &&
		cleanup.context.contextsClosed === 1
	);
}

function meterPeaks(snapshot: PreviewAudioEngineMeterSnapshot) {
	return {
		tracks: Object.fromEntries(
			Object.entries(snapshot.trackStates).map(([id, track]) => [
				id,
				track.status === "ready"
					? Math.max(0, ...track.channels.map((channel) => channel.peak))
					: null,
			]),
		),
		combined:
			snapshot.combinedState.status === "ready"
				? Math.max(
						0,
						...snapshot.combinedState.channels.map((channel) => channel.peak),
					)
				: null,
	};
}

async function sampleMeters(engine: PreviewAudioEngine) {
	await delay(150);
	return meterPeaks(engine.readMeterSnapshot());
}

export async function runProductionAudioFunctionalChecks(
	file: File,
	revision: string,
) {
	const { asset, fixture } = await inspectProductionAudioFixture(file);
	if (asset.tracks.audio.length !== 2)
		throw new Error("Functional checks require two audio tracks.");
	const operations: { name: string; passed: boolean; evidence: unknown }[] = [];
	async function check(
		name: string,
		action: () => Promise<{ passed: boolean; evidence: unknown }>,
	) {
		try {
			operations.push({ name, ...(await action()) });
		} catch (error) {
			operations.push({
				name,
				passed: false,
				evidence: error instanceof Error ? error.message : String(error),
			});
		}
	}
	let run = await prepareProductionAudioRun(file, asset);
	const ids = asset.tracks.audio.map((track) => track.id);
	try {
		await run.engine.setTime(Math.min(6, asset.durationUs / 2_000_000));
		await run.engine.play();
		await check("Independent per-track and master meter taps", async () => {
			const peaks = await sampleMeters(run.engine);
			return {
				passed:
					ids.every((id) => (peaks.tracks[id] ?? 0) > 0.001) &&
					(peaks.combined ?? 0) > 0.001,
				evidence: peaks,
			};
		});
		await check("Preview mute preserves pre-output meters", async () => {
			run.engine.setOutputGain(0);
			const peaks = await sampleMeters(run.engine);
			run.engine.setOutputGain(1);
			return { passed: (peaks.combined ?? 0) > 0.001, evidence: peaks };
		});
		await check("Track volume affects its tap", async () => {
			const before = await sampleMeters(run.engine);
			run.engine.setTrackVolumeGain(0, 0.5);
			const after = await sampleMeters(run.engine);
			run.engine.setTrackVolumeGain(0, 1);
			const ratio = (after.tracks[ids[0]] ?? 0) / (before.tracks[ids[0]] ?? 1);
			return {
				passed: ratio > 0.4 && ratio < 0.6,
				evidence: { before, after, ratio },
			};
		});
		await check(
			"Include/exclude and solo gain boundary isolates a track",
			async () => {
				run.engine.setTrackMonitorGain(0, 0);
				const peaks = await sampleMeters(run.engine);
				run.engine.setTrackMonitorGain(0, 1);
				return {
					passed:
						peaks.tracks[ids[0]] === 0 && (peaks.tracks[ids[1]] ?? 0) > 0.001,
					evidence: peaks,
				};
			},
		);
		await check(
			"Channel routing rebuild retains playback and mono channel identity",
			async () => {
				const generation = run.engine.getMetrics().generationsOpened;
				run.engine.setTrackChannelMode(0, "use-left-as-mono");
				await waitUntil(() => run.engine.getStatus() === "ready");
				const peaks = await sampleMeters(run.engine);
				const snapshot = run.engine.readMeterSnapshot();
				const track = snapshot.trackStates[ids[0]];
				return {
					passed:
						run.engine.getMetrics().generationsOpened > generation &&
						(peaks.tracks[ids[0]] ?? 0) > 0.001 &&
						track.status === "ready" &&
						track.channels[0].label === "Mono",
					evidence: { snapshot, metrics: run.engine.getMetrics() },
				};
			},
		);
		await check(
			"Pause freezes audio clock and reports meter silence; resume advances",
			async () => {
				run.engine.pause();
				const paused = run.engine.getCurrentTime();
				await delay(200);
				const afterPause = run.engine.getCurrentTime();
				const peaks = await sampleMeters(run.engine);
				await run.engine.play();
				await delay(200);
				const resumed = run.engine.getCurrentTime();
				return {
					passed:
						Math.abs(paused - afterPause) < 0.001 &&
						peaks.combined === 0 &&
						resumed > paused + 0.1,
					evidence: { paused, afterPause, resumed, peaks },
				};
			},
		);
		await check("Latest seek wins and obsolete PCM is released", async () => {
			await Promise.all([
				run.engine.setTime(2),
				run.engine.setTime(4),
				run.engine.setTime(6),
			]);
			const time = run.engine.getCurrentTime();
			return {
				passed:
					time >= 6 &&
					time < 6.5 &&
					run.engine.getMetrics().engine.retainedPcmBytes <= 2 * 1024 * 1024,
				evidence: { time, metrics: run.engine.getMetrics() },
			};
		});
		await check("Playback rate follows audio-master clock", async () => {
			await run.engine.setPlaybackRate(2);
			const start = run.engine.getCurrentTime();
			const wallStart = performance.now();
			await delay(250);
			const mediaDelta = run.engine.getCurrentTime() - start;
			const wallDelta = (performance.now() - wallStart) / 1_000;
			await run.engine.setPlaybackRate(1);
			return {
				passed: Math.abs(mediaDelta / wallDelta - 2) < 0.2,
				evidence: { mediaDelta, wallDelta },
			};
		});
		await check(
			"Selection end clips sources; control-plane wrap completes within 100 ms",
			async () => {
				run.engine.setPlaybackEnd(3);
				await run.engine.setTime(2.8);
				await run.engine.play();
				await waitUntil(() => run.engine.getCurrentTime() >= 3);
				const boundaryTime = run.engine.getCurrentTime();
				const clippedPeaks = await sampleMeters(run.engine);
				const started = performance.now();
				await run.engine.setTime(2);
				await run.engine.play();
				const wrapMs = performance.now() - started;
				run.engine.setPlaybackEnd(null);
				return {
					passed:
						boundaryTime >= 3 && clippedPeaks.combined === 0 && wrapMs <= 100,
					evidence: { boundaryTime, clippedPeaks, wrapMs },
				};
			},
		);
		await check(
			"Per-track failure remains explicit; isolated retry recovers",
			async () => {
				run.observed.failNextPullForTrack(ids[0]);
				await run.engine.setTime(6);
				const failed = run.engine.readMeterSnapshot();
				const status = run.engine.getStatus();
				const before = run.engine.getMetrics();
				await run.engine.retryTrack(ids[0]);
				const recovered = await sampleMeters(run.engine);
				return {
					passed:
						status === "degraded" &&
						failed.trackStates[ids[0]].status === "unavailable" &&
						run.engine.getStatus() === "ready" &&
						run.engine.getMetrics().trackRetries === before.trackRetries + 1 &&
						(recovered.tracks[ids[0]] ?? 0) > 0.001,
					evidence: {
						status,
						failed,
						recovered,
						metrics: run.engine.getMetrics(),
					},
				};
			},
		);
		await check(
			"Replacement disposes the previous asset and starts fresh",
			async () => {
				const cleanup = await run.cleanup();
				run = await prepareProductionAudioRun(file, {
					...asset,
					id: `${asset.id}-replacement`,
				});
				await run.engine.play();
				const peaks = await sampleMeters(run.engine);
				return {
					passed: cleanupPassed(cleanup) && (peaks.combined ?? 0) > 0.001,
					evidence: { cleanup, peaks },
				};
			},
		);
	} finally {
		const cleanup = await run.cleanup();
		operations.push({
			name: "Final teardown releases sources, PCM, timers, provider and context",
			passed: cleanupPassed(cleanup),
			evidence: cleanup,
		});
	}
	return {
		issue: 109,
		schemaVersion: 1,
		recordedAt: new Date().toISOString(),
		revision,
		fixture,
		userAgent: navigator.userAgent,
		operations,
		passed: operations.every((operation) => operation.passed),
	};
}

export async function runProductionAudioGapChecks(
	file: File,
	revision: string,
) {
	const { asset, fixture } = await inspectProductionAudioFixture(file);
	if (
		fixture.sha256 !==
		"8c9ccca2c14f6ea4c093091341ab44287767a0d81872d6b6b907aef11f6d732f"
	) {
		throw new Error(
			"Gap checks require the generated yaffw-preview-audio-109-offset-gap.mp4 fixture.",
		);
	}
	const run = await prepareProductionAudioRun(file, asset);
	const ids = asset.tracks.audio.map((track) => track.id);
	const probes: {
		name: string;
		mediaTime: number;
		peaks: ReturnType<typeof meterPeaks>;
		passed: boolean;
	}[] = [];
	let cleanup: Awaited<ReturnType<typeof run.cleanup>>;
	try {
		for (const probe of [
			{
				name: "Initial silence before both non-zero starts",
				time: 0,
				expected: [false, false],
			},
			{
				name: "First track begins before second track",
				time: 0.9,
				expected: [true, false],
			},
			{ name: "Both offset tracks audible", time: 2.5, expected: [true, true] },
			{
				name: "Second track encoded silence preserves first track signal",
				time: 4.5,
				expected: [true, false],
			},
			{
				name: "Second track resumes after encoded silence",
				time: 6,
				expected: [true, true],
			},
			{
				name: "Known silence after audio ends before video",
				time: 10,
				expected: [false, false],
			},
		]) {
			await run.engine.setTime(probe.time);
			await run.engine.play();
			const peaks = await sampleMeters(run.engine);
			const mediaTime = run.engine.getCurrentTime();
			run.engine.pause();
			probes.push({
				name: probe.name,
				mediaTime,
				peaks,
				passed:
					mediaTime >= probe.time &&
					mediaTime < probe.time + 0.35 &&
					probe.expected.every((audible, index) =>
						audible
							? (peaks.tracks[ids[index]] ?? 0) > 0.001
							: peaks.tracks[ids[index]] === 0,
					),
			});
		}
	} finally {
		cleanup = await run.cleanup();
	}
	return {
		issue: 109,
		schemaVersion: 1,
		revision,
		recordedAt: new Date().toISOString(),
		fixture,
		userAgent: navigator.userAgent,
		probes,
		cleanup,
		passed:
			probes.length === 6 &&
			probes.every((probe) => probe.passed) &&
			cleanupPassed(cleanup),
		gapScope:
			"Encoded silence and non-zero track starts; real missing-packet intervals are covered by provider timestamp-projector tests.",
	};
}
