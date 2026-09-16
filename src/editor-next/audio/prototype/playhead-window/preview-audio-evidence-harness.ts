import {
	type MediaWindowProvider,
	type MediaWindowPullResult,
	createMediaWindowProvider,
} from "../../engine/media-window-provider";
import type { ScheduledWindowAudioContextLike } from "../../engine/scheduled-window-engine";
import {
	type PlayheadWindowPrototype,
	type PlayheadWindowPrototypeMetrics,
	createPlayheadWindowPrototype,
} from "./playhead-window-prototype";
import {
	type PreparedPreviewAudioBaseline,
	type PreviewAudioDecoderWorkMetrics,
	audioBufferPcmBytes,
	prepareFullTrackDirectBaseline,
	prepareRemuxDecodeBridgeBaseline,
} from "./preview-audio-baselines";

export const PREVIEW_AUDIO_EVIDENCE_STRATEGIES = [
	"playhead-window",
	"full-track-direct",
	"remux-decode-bridge",
] as const;

export type PreviewAudioEvidenceStrategy =
	(typeof PREVIEW_AUDIO_EVIDENCE_STRATEGIES)[number];

export const PREVIEW_AUDIO_COUNTERBALANCED_ORDER: readonly (readonly PreviewAudioEvidenceStrategy[])[] =
	[
		["playhead-window", "full-track-direct", "remux-decode-bridge"],
		["full-track-direct", "remux-decode-bridge", "playhead-window"],
		["remux-decode-bridge", "playhead-window", "full-track-direct"],
		["playhead-window", "remux-decode-bridge", "full-track-direct"],
		["full-track-direct", "playhead-window", "remux-decode-bridge"],
	];

export type PreviewAudioEvidenceFixture = {
	durationSeconds: number;
	fileName: string;
	mimeType: string;
	sha256: string;
	sizeBytes: number;
	trackCount: number;
};

export type PreviewAudioEvidenceConfig = {
	chunkTargetSeconds: number;
	initialPlayheadSeconds: number;
	lookaheadSeconds: number;
	playbackRate: number;
	playbackSeconds: number;
	pumpIntervalMs: number;
	stallSchedule: readonly PreviewAudioEvidenceStall[];
	windowSeconds: number;
};

export type PreviewAudioEvidenceStall = {
	atPlaybackSeconds: number;
	durationMs: number;
};

export type PreviewAudioReadinessMetrics = {
	explicitFailureTrackCount: number;
	knownSilenceTrackCount: number;
	playableTrackCount: number;
	prepareToReadyMs: number;
	readyToSharedEpochMs: number;
};

export type PreviewAudioPcmMetrics = {
	afterCleanupBytes: number;
	atReadinessBytes: number;
	peakBytes: number;
};

export type PreviewAudioResponsivenessDistribution = {
	count: number;
	intervalsOver25Ms: number;
	intervalsOver50Ms: number;
	maxMs: number;
	medianMs: number;
	p95Ms: number;
};

export type PreviewAudioResponsivenessMetrics = {
	longTaskCount: number;
	longTaskMaxMs: number;
	longTaskTotalMs: number;
	timerIntervals: PreviewAudioResponsivenessDistribution;
};

export type PreviewAudioContinuityMetrics = {
	maxUnderrunMs: number;
	minLeadMs: number;
	totalUnderrunMs: number;
	underrunCount: number;
};

export type PreviewAudioSourceChurnMetrics = {
	nodesCreated: number;
	nodesDisconnected: number;
	nodesEnded: number;
	nodesStarted: number;
	nodesStopped: number;
	peakLiveNodes: number;
};

export type PreviewAudioCleanupMetrics = {
	contextsClosed: number;
	generationsCancelled: number;
	inputsDisposed: number;
	providersDisposed: number;
	residualNodes: number;
	residualPcmBytes: number;
	residualTimers: number;
	staleCompletionsDropped: number;
};

export type PreviewAudioEvidenceTrial = {
	cleanup: PreviewAudioCleanupMetrics;
	continuity: PreviewAudioContinuityMetrics;
	decoderWork: PreviewAudioDecoderWorkMetrics;
	errors: string[];
	fixtureSha256: string;
	id: string;
	pcm: PreviewAudioPcmMetrics;
	readiness: PreviewAudioReadinessMetrics;
	responsiveness: PreviewAudioResponsivenessMetrics;
	round: number;
	sourceChurn: PreviewAudioSourceChurnMetrics;
	strategy: PreviewAudioEvidenceStrategy;
};

export type PreviewAudioStrategySummary = {
	cleanupPassed: boolean;
	medianPeakPcmBytes: number;
	medianReadinessMs: number;
	p95ReadinessMs: number;
	totalUnderruns: number;
	trialCount: number;
};

export type PreviewAudioEvidenceRecord = {
	config: PreviewAudioEvidenceConfig;
	fixture: PreviewAudioEvidenceFixture;
	gitSha: string;
	issue: 108;
	recordedAt: string;
	runtime: {
		mediabunnyVersion: string;
		platform: string;
		userAgent: string;
	};
	schemaVersion: 1;
	summariesByStrategy: Record<
		PreviewAudioEvidenceStrategy,
		PreviewAudioStrategySummary
	>;
	trialOrder: PreviewAudioEvidenceStrategy[][];
	trials: PreviewAudioEvidenceTrial[];
};

export type PreviewAudioTrialRequest = {
	config: PreviewAudioEvidenceConfig;
	fixture: PreviewAudioEvidenceFixture;
	round: number;
	signal: AbortSignal;
	source: Blob;
	strategy: PreviewAudioEvidenceStrategy;
};

export type PreviewAudioTrialExecutor = (
	request: PreviewAudioTrialRequest,
) => Promise<PreviewAudioEvidenceTrial>;

export type RunPreviewAudioEvidenceOptions = {
	config: PreviewAudioEvidenceConfig;
	executeTrial: PreviewAudioTrialExecutor;
	fixture: PreviewAudioEvidenceFixture;
	gitSha?: string;
	mediabunnyVersion?: string;
	onTrial?: (
		trial: PreviewAudioEvidenceTrial,
		completed: number,
		total: number,
	) => void;
	recordedAt?: string;
	signal?: AbortSignal;
	source: Blob;
};

export async function runPreviewAudioEvidence({
	config,
	executeTrial,
	fixture,
	gitSha = "unknown",
	mediabunnyVersion = "1.52.2",
	onTrial,
	recordedAt = new Date().toISOString(),
	signal = new AbortController().signal,
	source,
}: RunPreviewAudioEvidenceOptions): Promise<PreviewAudioEvidenceRecord> {
	validateFixture(source, fixture);
	validateConfig(config);
	const trials: PreviewAudioEvidenceTrial[] = [];
	const total = PREVIEW_AUDIO_COUNTERBALANCED_ORDER.flat().length;

	for (const [
		roundIndex,
		strategies,
	] of PREVIEW_AUDIO_COUNTERBALANCED_ORDER.entries()) {
		for (const strategy of strategies) {
			throwIfAborted(signal);
			const trial = await executeTrial({
				config,
				fixture,
				round: roundIndex + 1,
				signal,
				source,
				strategy,
			});
			assertTrialIdentity(trial, fixture, roundIndex + 1, strategy);
			trials.push(trial);
			onTrial?.(trial, trials.length, total);
		}
	}

	const record: PreviewAudioEvidenceRecord = {
		config: cloneConfig(config),
		fixture: { ...fixture },
		gitSha,
		issue: 108,
		recordedAt,
		runtime: {
			mediabunnyVersion,
			platform: globalThis.navigator?.platform ?? "unknown",
			userAgent: globalThis.navigator?.userAgent ?? "unknown",
		},
		schemaVersion: 1,
		summariesByStrategy: summarizeTrials(trials),
		trialOrder: PREVIEW_AUDIO_COUNTERBALANCED_ORDER.map((round) => [...round]),
		trials,
	};

	assertCompletePreviewAudioEvidence(record);
	return record;
}

export function assertCompletePreviewAudioEvidence(
	record: PreviewAudioEvidenceRecord,
) {
	if (record.schemaVersion !== 1 || record.issue !== 108) {
		throw new Error("Unexpected Preview audio evidence schema.");
	}
	if (record.trials.length !== 15) {
		throw new Error(
			`Expected 15 controlled trials, got ${record.trials.length}.`,
		);
	}

	for (const strategy of PREVIEW_AUDIO_EVIDENCE_STRATEGIES) {
		const trials = record.trials.filter((trial) => trial.strategy === strategy);
		if (trials.length !== 5) {
			throw new Error(
				`Expected five ${strategy} trials, got ${trials.length}.`,
			);
		}
		for (const trial of trials) {
			if (trial.errors.length > 0) {
				throw new Error(
					`${trial.id} recorded errors: ${trial.errors.join("; ")}`,
				);
			}
			if (trial.fixtureSha256 !== record.fixture.sha256) {
				throw new Error(`${trial.id} used a different fixture.`);
			}
			if (
				trial.pcm.afterCleanupBytes !== 0 ||
				trial.cleanup.residualNodes !== 0 ||
				trial.cleanup.residualPcmBytes !== 0 ||
				trial.cleanup.residualTimers !== 0
			) {
				throw new Error(`${trial.id} failed the cleanup gate.`);
			}
			if (
				trial.readiness.playableTrackCount +
					trial.readiness.knownSilenceTrackCount +
					trial.readiness.explicitFailureTrackCount !==
				record.fixture.trackCount
			) {
				throw new Error(`${trial.id} did not resolve every required track.`);
			}
			if (trial.responsiveness.timerIntervals.count === 0) {
				throw new Error(`${trial.id} recorded no responsiveness samples.`);
			}
		}
	}

	const candidate = record.summariesByStrategy["playhead-window"];
	const direct = record.summariesByStrategy["full-track-direct"];
	const bridge = record.summariesByStrategy["remux-decode-bridge"];
	if (
		candidate.medianReadinessMs >= 100 ||
		candidate.p95ReadinessMs >= 250 ||
		candidate.medianReadinessMs >= direct.medianReadinessMs ||
		candidate.medianReadinessMs >= bridge.medianReadinessMs
	) {
		throw new Error("The playhead-window readiness gate failed.");
	}
	if (candidate.medianPeakPcmBytes > 2 * 1024 * 1024) {
		throw new Error("The playhead-window PCM gate failed.");
	}
	if (candidate.totalUnderruns !== 0) {
		throw new Error("The playhead-window continuity gate failed.");
	}
	for (const trial of record.trials.filter(
		(trial) => trial.strategy === "playhead-window",
	)) {
		if (trial.responsiveness.timerIntervals.p95Ms > 25) {
			throw new Error(`${trial.id} failed the renderer responsiveness gate.`);
		}
		if (trial.sourceChurn.nodesCreated / record.config.playbackSeconds > 14) {
			throw new Error(`${trial.id} failed the source-node churn gate.`);
		}
		if (
			trial.cleanup.contextsClosed !== 1 ||
			trial.cleanup.providersDisposed !== 1
		) {
			throw new Error(`${trial.id} did not close candidate ownership.`);
		}
	}

	// JSON round-tripping is a required property of the durable evidence record.
	JSON.parse(JSON.stringify(record)) as PreviewAudioEvidenceRecord;
}

export type PreviewAudioFunctionalScenario = {
	config: PreviewAudioEvidenceConfig;
	fixture: PreviewAudioEvidenceFixture;
	name: string;
	signal?: AbortSignal;
	source: Blob;
};

export async function runPreviewAudioFunctionalScenario(
	scenario: PreviewAudioFunctionalScenario,
	executeTrial: PreviewAudioTrialExecutor,
) {
	const signal = scenario.signal ?? new AbortController().signal;
	const trial = await executeTrial({
		config: scenario.config,
		fixture: scenario.fixture,
		round: 0,
		signal,
		source: scenario.source,
		strategy: "playhead-window",
	});

	return {
		name: scenario.name,
		stallSchedule: scenario.config.stallSchedule.map((stall) => ({ ...stall })),
		trial,
	};
}

export type PreviewAudioFunctionalOperation = {
	detail?: string;
	name: string;
	status: "failed" | "passed";
};

export type PreviewAudioBrowserFunctionalResult = {
	afterDestroy: PlayheadWindowPrototypeMetrics;
	beforeDestroy: PlayheadWindowPrototypeMetrics;
	loopWrapGapMs: number;
	operations: PreviewAudioFunctionalOperation[];
	statusBeforeDestroy: ReturnType<PlayheadWindowPrototype["getStatus"]>;
};

/**
 * Exercises discontinuities and ownership changes separately from timed trials.
 * Keeping these operations out of the comparison rounds prevents seeks, retries,
 * and deliberate stalls from biasing readiness medians.
 */
export async function runBrowserPreviewAudioFunctionalScenarios({
	config,
	signal = new AbortController().signal,
	source,
}: {
	config: PreviewAudioEvidenceConfig;
	signal?: AbortSignal;
	source: Blob;
}): Promise<PreviewAudioBrowserFunctionalResult> {
	const operations: PreviewAudioFunctionalOperation[] = [];
	const audioContexts: AudioContext[] = [];
	const provider = await createMediaWindowProvider({
		batchDurationSeconds: config.chunkTargetSeconds,
		source,
	});
	const prototype = createPlayheadWindowPrototype({
		createAudioContext: () => {
			const audioContext = new AudioContext();
			audioContexts.push(audioContext);
			return asScheduledWindowAudioContext(audioContext);
		},
		horizonSeconds: config.windowSeconds,
		lowWaterSeconds: Math.min(
			config.lookaheadSeconds,
			config.windowSeconds * 0.75,
		),
		provider,
	});
	let destroyed = false;
	let loopWrapGapMs = 0;

	const exercise = async (
		name: string,
		operation: () => Promise<void> | void,
	) => {
		try {
			throwIfAborted(signal);
			await operation();
			operations.push({ name, status: "passed" });
		} catch (error) {
			operations.push({
				detail: errorToMessage(error),
				name,
				status: "failed",
			});
			throw error;
		}
	};

	try {
		await audioContexts[0]?.resume();
		await exercise("initial readiness", () =>
			prototype.prepare(config.initialPlayheadSeconds),
		);
		assertFunctional(
			prototype.getStatus() === "ready" || prototype.getStatus() === "degraded",
			"Initial readiness did not resolve every required track.",
		);
		await exercise("shared-epoch play", async () => {
			await prototype.play();
			assertFunctional(
				prototype.getStatus() !== "preparing",
				"Playback crossed the readiness barrier too early.",
			);
		});
		await exercise("pause and resume", async () => {
			prototype.pause();
			await prototype.play();
			assertFunctional(
				prototype.getStatus() !== "failed",
				"Resume left every track failed.",
			);
		});
		await exercise("seek invalidation", async () => {
			const target = config.initialPlayheadSeconds + 5;
			await prototype.seek(target);
			assertFunctional(
				Math.abs(prototype.getCurrentTime() - target) < 0.05,
				"Seek did not publish the requested playhead.",
			);
		});
		await exercise("playback-rate invalidation", async () => {
			const before = prototype.getMetrics().generationsCancelled;
			await prototype.setPlaybackRate(1.5);
			assertFunctional(
				prototype.getMetrics().generationsCancelled > before,
				"Playback-rate change did not invalidate the old generation.",
			);
		});
		await exercise("selection looping", async () => {
			const loopStart = config.initialPlayheadSeconds + 5;
			const loopEnd = loopStart + 0.05;
			prototype.setLoop({
				endSeconds: loopEnd,
				startSeconds: loopStart,
			});
			await prototype.seek(loopStart);
			blockRenderer(75);
			const overshootMs = Math.max(
				0,
				(prototype.getCurrentTime() - loopEnd) * 1_000,
			);
			const wrapStartedAt = performance.now();
			await prototype.tick();
			loopWrapGapMs = overshootMs + performance.now() - wrapStartedAt;
			assertFunctional(
				Math.abs(prototype.getCurrentTime() - loopStart) < 0.05,
				"Selection loop did not wrap to its start.",
			);
			assertFunctional(
				loopWrapGapMs <= 100,
				`Selection loop exceeded the 100ms control-wrap budget (${loopWrapGapMs.toFixed(1)}ms).`,
			);
			prototype.setLoop(null);
		});
		const firstTrackId = provider.trackIds[0];
		if (firstTrackId) {
			await exercise("routing rebuild", async () => {
				const before = prototype.getMetrics().generationsCancelled;
				prototype.setTrackGain(firstTrackId, 0.5);
				await prototype.rebuildTrackRouting(firstTrackId);
				assertFunctional(
					prototype.getMetrics().generationsCancelled > before,
					"Routing rebuild did not invalidate scheduled work.",
				);
			});
			await exercise("track retry isolation", async () => {
				const before = prototype.getMetrics();
				await prototype.retryTrack(firstTrackId);
				const after = prototype.getMetrics();
				assertFunctional(
					after.trackRetries === before.trackRetries + 1 &&
						after.generationsOpened === before.generationsOpened + 1,
					"Track retry did not remain isolated to one new generation.",
				);
			});
		}
		await exercise("renderer stall recovery", async () => {
			const before = prototype.getMetrics().engine.underruns;
			blockRenderer(config.stallSchedule[0]?.durationMs ?? 250);
			await prototype.tick();
			assertFunctional(
				prototype.getMetrics().engine.underruns === before,
				"The accepted short renderer stall caused an underrun.",
			);
		});
		await exercise("concurrent completion invalidation", async () => {
			const staleTick = prototype.tick();
			const target = config.initialPlayheadSeconds + 8;
			await prototype.seek(target);
			await staleTick;
			assertFunctional(
				Math.abs(prototype.getCurrentTime() - target) < 0.05,
				"Concurrent completion displaced the new generation.",
			);
		});
		await exercise("Media replacement", async () => {
			const replacement = await createMediaWindowProvider({
				batchDurationSeconds: config.chunkTargetSeconds,
				source,
			});
			try {
				const replacementStartSeconds = Math.min(
					config.initialPlayheadSeconds + 10,
					Math.max(0, replacement.durationSeconds - config.windowSeconds),
				);
				await prototype.replaceProvider(replacement, replacementStartSeconds);
				if (prototype.getStatus() === "failed") {
					throw new Error("Replacement left the prototype unavailable.");
				}
				assertFunctional(
					prototype.getMetrics().mediaReplacements === 1,
					"Media replacement ownership was not recorded.",
				);
			} catch (error) {
				await replacement.dispose();
				throw error;
			}
		});

		const statusBeforeDestroy = prototype.getStatus();
		const beforeDestroy = prototype.getMetrics();
		await exercise("teardown", async () => {
			await prototype.destroy();
			const cleanup = prototype.getMetrics();
			assertFunctional(
				cleanup.cleanupCount === 1 &&
					cleanup.engine.retainedPcmBytes === 0 &&
					cleanup.engine.sourceNodesCreated ===
						cleanup.engine.sourceNodesEnded + cleanup.engine.sourceNodesStopped,
				"Teardown retained candidate audio ownership.",
			);
		});
		destroyed = true;
		const afterDestroy = prototype.getMetrics();
		return {
			afterDestroy,
			beforeDestroy,
			loopWrapGapMs,
			operations,
			statusBeforeDestroy,
		};
	} finally {
		if (!destroyed) await prototype.destroy();
	}
}

export function createBrowserPreviewAudioTrialExecutor(): PreviewAudioTrialExecutor {
	return async (request) => runBrowserTrial(request);
}

async function runBrowserTrial(
	request: PreviewAudioTrialRequest,
): Promise<PreviewAudioEvidenceTrial> {
	const audioContext = new AudioContext();
	const probe = createResponsivenessProbe();
	const churn = createEmptyChurn();
	const cleanup = createEmptyCleanup();
	const decoderWork = createEmptyDecoderWork();
	const pcm: PreviewAudioPcmMetrics = {
		afterCleanupBytes: 0,
		atReadinessBytes: 0,
		peakBytes: 0,
	};
	const readiness: PreviewAudioReadinessMetrics = {
		explicitFailureTrackCount: 0,
		knownSilenceTrackCount: 0,
		playableTrackCount: 0,
		prepareToReadyMs: 0,
		readyToSharedEpochMs: 0,
	};
	const scheduledRanges = new Map<string, Array<[number, number]>>();
	const liveBuffers = new Set<AudioBuffer>();
	const liveNodes = new Set<AudioBufferSourceNode>();
	let timer: number | undefined;
	let candidatePullPromise: Promise<void> | null = null;
	let baseline: PreparedPreviewAudioBaseline | undefined;
	let prototype: PlayheadWindowPrototype | undefined;
	let prototypeMetrics: PlayheadWindowPrototypeMetrics | undefined;
	let candidateProviderDisposals = 0;
	const startedAt = performance.now();
	const errors: string[] = [];
	const minLeadSeconds = Number.POSITIVE_INFINITY;

	probe.start();
	try {
		await audioContext.resume();
		if (request.strategy === "playhead-window") {
			const provider = await createMediaWindowProvider({
				batchDurationSeconds: request.config.chunkTargetSeconds,
				source: request.source,
			});
			decoderWork.rangeRequests = provider.trackIds.length;
			const instrumentedProvider = instrumentProvider(
				provider,
				(result) => {
					decoderWork.windowPulls += 1;
					if (decoderWork.windowPulls === 1) {
						readiness.playableTrackCount = result.tracks.filter(
							(track) => track.state === "playable",
						).length;
						readiness.knownSilenceTrackCount = result.tracks.filter(
							(track) => track.state === "silence",
						).length;
						readiness.explicitFailureTrackCount = result.tracks.filter(
							(track) => track.state === "failure",
						).length;
					}
					for (const track of result.tracks) {
						if (track.state !== "playable") continue;
						for (const chunk of track.chunks) {
							decoderWork.decodedFrames += chunk.audioBuffer.length;
							decoderWork.decodedMediaSeconds +=
								chunk.endSeconds - chunk.startSeconds;
							decoderWork.decodedOutputChunks += 1;
						}
					}
				},
				() => {
					candidateProviderDisposals += 1;
				},
			);
			prototype = createPlayheadWindowPrototype({
				createAudioContext: () => asScheduledWindowAudioContext(audioContext),
				horizonSeconds: request.config.windowSeconds,
				lowWaterSeconds: Math.min(
					request.config.lookaheadSeconds,
					request.config.windowSeconds * 0.75,
				),
				provider: instrumentedProvider,
			});
			await prototype.prepare(request.config.initialPlayheadSeconds);
			if (request.config.playbackRate !== 1) {
				await prototype.setPlaybackRate(request.config.playbackRate);
			}
			prototypeMetrics = prototype.getMetrics();
			pcm.atReadinessBytes = prototypeMetrics.engine.retainedPcmBytes;
			pcm.peakBytes = pcm.atReadinessBytes;
			readiness.prepareToReadyMs = performance.now() - startedAt;
			await prototype.play();
			readiness.readyToSharedEpochMs =
				performance.now() - startedAt - readiness.prepareToReadyMs;
			timer = window.setInterval(async () => {
				if (candidatePullPromise) return;
				candidatePullPromise = (async () => {
					try {
						await prototype?.tick();
						prototypeMetrics = prototype?.getMetrics();
						pcm.peakBytes = Math.max(
							pcm.peakBytes,
							prototypeMetrics?.engine.peakRetainedPcmBytes ?? 0,
						);
					} catch (error) {
						if (!request.signal.aborted) errors.push(errorToMessage(error));
					} finally {
						candidatePullPromise = null;
					}
				})();
				await candidatePullPromise;
			}, request.config.pumpIntervalMs);
		} else {
			baseline =
				request.strategy === "full-track-direct"
					? await prepareFullTrackDirectBaseline({
							audioContext,
							signal: request.signal,
							source: request.source,
						})
					: await prepareRemuxDecodeBridgeBaseline({
							audioContext,
							signal: request.signal,
							source: request.source,
						});
			Object.assign(decoderWork, baseline.decoderWork);
			cleanup.inputsDisposed = baseline.cleanup.inputsDisposed;
			readiness.playableTrackCount = baseline.buffers.length;
			readiness.prepareToReadyMs = performance.now() - startedAt;
			pcm.atReadinessBytes = baseline.retainedPcmBytes();
			pcm.peakBytes = pcm.atReadinessBytes;
			const epoch = audioContext.currentTime + 0.05;
			for (const item of baseline.buffers) {
				liveBuffers.add(item.audioBuffer);
				scheduleBuffer({
					buffer: item.audioBuffer,
					epoch,
					endMediaSeconds: item.startSeconds + item.audioBuffer.duration,
					startMediaSeconds: item.startSeconds,
					trackId: item.trackId,
				});
			}
			readiness.readyToSharedEpochMs =
				performance.now() - startedAt - readiness.prepareToReadyMs;
		}

		await runTimedPlayback(request.config);
	} catch (error) {
		errors.push(errorToMessage(error));
	} finally {
		if (timer !== undefined) {
			clearInterval(timer);
			timer = undefined;
		}
		await candidatePullPromise;
		if (prototype) {
			prototypeMetrics = prototype.getMetrics();
			await prototype.destroy();
			prototypeMetrics = prototype.getMetrics();
			cleanup.generationsCancelled = prototypeMetrics.generationsCancelled;
			cleanup.providersDisposed = candidateProviderDisposals;
			cleanup.contextsClosed = prototypeMetrics.engine.cleanupCount;
			cleanup.staleCompletionsDropped = prototypeMetrics.stalePullResults;
			churn.nodesCreated = prototypeMetrics.engine.sourceNodesCreated;
			churn.nodesStarted = prototypeMetrics.engine.sourceNodesCreated;
			churn.nodesEnded = prototypeMetrics.engine.sourceNodesEnded;
			churn.nodesStopped = prototypeMetrics.engine.sourceNodesStopped;
			churn.nodesDisconnected = prototypeMetrics.engine.sourceNodesCreated;
			churn.peakLiveNodes = prototypeMetrics.engine.peakLiveSourceNodes;
			pcm.peakBytes = Math.max(
				pcm.peakBytes,
				prototypeMetrics.engine.peakRetainedPcmBytes,
			);
			pcm.afterCleanupBytes = prototypeMetrics.engine.retainedPcmBytes;
			cleanup.residualNodes = Math.max(
				0,
				prototypeMetrics.engine.sourceNodesCreated -
					prototypeMetrics.engine.sourceNodesEnded -
					prototypeMetrics.engine.sourceNodesStopped,
			);
			cleanup.residualPcmBytes = prototypeMetrics.engine.retainedPcmBytes;
		}
		await baseline?.dispose();
		for (const node of liveNodes) {
			try {
				node.stop();
				churn.nodesStopped += 1;
			} catch {
				// Already ended sources are still safe to disconnect.
			}
			node.disconnect();
			churn.nodesDisconnected += 1;
			node.buffer = null;
		}
		liveNodes.clear();
		liveBuffers.clear();
		if (!prototype) {
			await audioContext.close();
			cleanup.contextsClosed += 1;
		}
		if (!prototype) {
			cleanup.residualNodes = liveNodes.size;
			cleanup.residualPcmBytes = pcmBytes(liveBuffers);
		}
		cleanup.residualTimers = timer === undefined ? 0 : 1;
		pcm.afterCleanupBytes = Math.max(
			pcm.afterCleanupBytes,
			cleanup.residualPcmBytes,
		);
		probe.stop();
	}

	const continuity = computeContinuity(
		scheduledRanges,
		request.config.initialPlayheadSeconds,
		request.config.initialPlayheadSeconds + request.config.playbackSeconds,
		minLeadSeconds,
	);
	if (prototypeMetrics) {
		continuity.underrunCount = prototypeMetrics.engine.underruns;
		continuity.maxUnderrunMs =
			prototypeMetrics.engine.maxUnderrunSeconds * 1_000;
		continuity.totalUnderrunMs =
			prototypeMetrics.engine.totalUnderrunSeconds * 1_000;
		continuity.minLeadMs =
			(prototypeMetrics.engine.minScheduledLeadSeconds ?? 0) * 1_000;
	}

	return {
		cleanup,
		continuity,
		decoderWork,
		errors,
		fixtureSha256: request.fixture.sha256,
		id: `round-${request.round}-${request.strategy}`,
		pcm,
		readiness,
		responsiveness: probe.snapshot(),
		round: request.round,
		sourceChurn: churn,
		strategy: request.strategy,
	};

	function scheduleBuffer({
		buffer,
		epoch,
		endMediaSeconds,
		startMediaSeconds,
		trackId,
	}: {
		buffer: AudioBuffer;
		epoch: number;
		endMediaSeconds: number;
		startMediaSeconds: number;
		trackId: string;
	}) {
		if (
			endMediaSeconds <= request.config.initialPlayheadSeconds ||
			startMediaSeconds >=
				request.config.initialPlayheadSeconds + request.config.playbackSeconds
		) {
			liveBuffers.delete(buffer);
			return;
		}
		const sourceNode = audioContext.createBufferSource();
		churn.nodesCreated += 1;
		sourceNode.buffer = buffer;
		sourceNode.playbackRate.value = request.config.playbackRate;
		sourceNode.connect(audioContext.destination);
		const offsetSeconds = Math.max(
			0,
			request.config.initialPlayheadSeconds - startMediaSeconds,
		);
		const startAt =
			epoch +
			Math.max(0, startMediaSeconds - request.config.initialPlayheadSeconds) /
				request.config.playbackRate;
		sourceNode.start(startAt, offsetSeconds);
		churn.nodesStarted += 1;
		liveNodes.add(sourceNode);
		churn.peakLiveNodes = Math.max(churn.peakLiveNodes, liveNodes.size);
		sourceNode.onended = () => {
			churn.nodesEnded += 1;
			sourceNode.disconnect();
			churn.nodesDisconnected += 1;
			sourceNode.buffer = null;
			liveNodes.delete(sourceNode);
			liveBuffers.delete(buffer);
		};
		const ranges = scheduledRanges.get(trackId) ?? [];
		ranges.push([startMediaSeconds, endMediaSeconds]);
		scheduledRanges.set(trackId, ranges);
	}
}

async function runTimedPlayback(config: PreviewAudioEvidenceConfig) {
	const startedAt = performance.now();
	const pendingStalls = config.stallSchedule.map((stall) => ({
		...stall,
		complete: false,
	}));

	while (performance.now() - startedAt < config.playbackSeconds * 1_000) {
		for (const stall of pendingStalls) {
			if (
				!stall.complete &&
				performance.now() - startedAt >= stall.atPlaybackSeconds * 1_000
			) {
				stall.complete = true;
				const stallStarted = performance.now();
				while (performance.now() - stallStarted < stall.durationMs) {
					// Deliberately block only the renderer control thread.
				}
			}
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
}

function blockRenderer(durationMs: number) {
	const startedAt = performance.now();
	while (performance.now() - startedAt < durationMs) {
		// Intentional renderer-thread stall; Web Audio rendering continues.
	}
}

function instrumentProvider(
	provider: MediaWindowProvider,
	onPull: (result: MediaWindowPullResult) => void,
	onDispose: () => void,
): MediaWindowProvider {
	let disposed = false;
	return {
		getTrackMetadata: (trackId) => provider.getTrackMetadata(trackId),
		async dispose() {
			await provider.dispose();
			if (!disposed) {
				disposed = true;
				onDispose();
			}
		},
		durationSeconds: provider.durationSeconds,
		openGeneration(options) {
			const generation = provider.openGeneration(options);
			return {
				cancel: () => generation.cancel(),
				id: generation.id,
				async pullThrough(endSeconds) {
					const result = await generation.pullThrough(endSeconds);
					onPull(result);
					return result;
				},
				startSeconds: generation.startSeconds,
				trackIds: generation.trackIds,
			};
		},
		trackIds: provider.trackIds,
	};
}

function asScheduledWindowAudioContext(
	audioContext: AudioContext,
): ScheduledWindowAudioContextLike {
	// The prototype deliberately models only a small Web Audio subset. Native
	// AudioContext nodes implement that subset; the DOM overloads are invariant
	// in TypeScript even though the runtime methods are compatible.
	return audioContext as unknown as ScheduledWindowAudioContextLike;
}

function createResponsivenessProbe() {
	const intervals: number[] = [];
	const longTasks: number[] = [];
	let last = 0;
	let timer: number | undefined;
	let observer: PerformanceObserver | undefined;

	return {
		start() {
			last = performance.now();
			timer = window.setInterval(() => {
				const now = performance.now();
				intervals.push(now - last);
				last = now;
			}, 10);
			if (typeof PerformanceObserver === "undefined") return;
			try {
				observer = new PerformanceObserver((list) => {
					for (const entry of list.getEntries()) longTasks.push(entry.duration);
				});
				observer.observe({ entryTypes: ["longtask"] });
			} catch {
				observer = undefined;
			}
		},
		snapshot(): PreviewAudioResponsivenessMetrics {
			return {
				longTaskCount: longTasks.length,
				longTaskMaxMs: Math.max(0, ...longTasks),
				longTaskTotalMs: longTasks.reduce((sum, value) => sum + value, 0),
				timerIntervals: distribution(intervals),
			};
		},
		stop() {
			if (timer !== undefined) clearInterval(timer);
			timer = undefined;
			observer?.disconnect();
			observer = undefined;
		},
	};
}

function computeContinuity(
	rangesByTrack: Map<string, Array<[number, number]>>,
	startSeconds: number,
	endSeconds: number,
	minLeadSeconds: number,
): PreviewAudioContinuityMetrics {
	const holes: number[] = [];
	for (const ranges of rangesByTrack.values()) {
		const ordered = [...ranges].sort((left, right) => left[0] - right[0]);
		let cursor = startSeconds;
		for (const [start, end] of ordered) {
			if (end <= cursor || start >= endSeconds) continue;
			if (start > cursor) holes.push(Math.min(start, endSeconds) - cursor);
			cursor = Math.max(cursor, end);
			if (cursor >= endSeconds) break;
		}
		if (cursor < endSeconds) holes.push(endSeconds - cursor);
	}

	return {
		maxUnderrunMs: Math.max(0, ...holes) * 1_000,
		minLeadMs: Number.isFinite(minLeadSeconds) ? minLeadSeconds * 1_000 : 0,
		totalUnderrunMs: holes.reduce((sum, value) => sum + value, 0) * 1_000,
		underrunCount: holes.length,
	};
}

function summarizeTrials(
	trials: PreviewAudioEvidenceTrial[],
): PreviewAudioEvidenceRecord["summariesByStrategy"] {
	return Object.fromEntries(
		PREVIEW_AUDIO_EVIDENCE_STRATEGIES.map((strategy) => {
			const strategyTrials = trials.filter(
				(trial) => trial.strategy === strategy,
			);
			const readiness = strategyTrials.map(
				(trial) => trial.readiness.prepareToReadyMs,
			);
			return [
				strategy,
				{
					cleanupPassed: strategyTrials.every(
						(trial) =>
							trial.cleanup.residualNodes === 0 &&
							trial.cleanup.residualPcmBytes === 0 &&
							trial.cleanup.residualTimers === 0,
					),
					medianPeakPcmBytes: percentile(
						strategyTrials.map((trial) => trial.pcm.peakBytes),
						0.5,
					),
					medianReadinessMs: percentile(readiness, 0.5),
					p95ReadinessMs: percentile(readiness, 0.95),
					totalUnderruns: strategyTrials.reduce(
						(sum, trial) => sum + trial.continuity.underrunCount,
						0,
					),
					trialCount: strategyTrials.length,
				} satisfies PreviewAudioStrategySummary,
			];
		}),
	) as PreviewAudioEvidenceRecord["summariesByStrategy"];
}

function distribution(
	values: number[],
): PreviewAudioResponsivenessDistribution {
	return {
		count: values.length,
		intervalsOver25Ms: values.filter((value) => value > 25).length,
		intervalsOver50Ms: values.filter((value) => value > 50).length,
		maxMs: Math.max(0, ...values),
		medianMs: percentile(values, 0.5),
		p95Ms: percentile(values, 0.95),
	};
}

function percentile(values: number[], fraction: number) {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((left, right) => left - right);
	const index = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil(sorted.length * fraction) - 1),
	);
	return sorted[index] ?? 0;
}

function pcmBytes(buffers: Iterable<AudioBuffer>) {
	let total = 0;
	for (const buffer of buffers) total += audioBufferPcmBytes(buffer);
	return total;
}

function createEmptyDecoderWork(): PreviewAudioDecoderWorkMetrics {
	return {
		decodeAudioDataCalls: 0,
		decodedFrames: 0,
		decodedMediaSeconds: 0,
		decodedOutputChunks: 0,
		decodedSamples: 0,
		metadataPacketScans: 0,
		rangeRequests: 0,
		remuxedBytes: 0,
		remuxedPackets: 0,
		windowPulls: 0,
	};
}

function createEmptyCleanup(): PreviewAudioCleanupMetrics {
	return {
		contextsClosed: 0,
		generationsCancelled: 0,
		inputsDisposed: 0,
		providersDisposed: 0,
		residualNodes: 0,
		residualPcmBytes: 0,
		residualTimers: 0,
		staleCompletionsDropped: 0,
	};
}

function createEmptyChurn(): PreviewAudioSourceChurnMetrics {
	return {
		nodesCreated: 0,
		nodesDisconnected: 0,
		nodesEnded: 0,
		nodesStarted: 0,
		nodesStopped: 0,
		peakLiveNodes: 0,
	};
}

function validateFixture(source: Blob, fixture: PreviewAudioEvidenceFixture) {
	if (source.size !== fixture.sizeBytes) {
		throw new Error(
			`Fixture size changed: expected ${fixture.sizeBytes}, got ${source.size}.`,
		);
	}
	if (
		!fixture.sha256 ||
		fixture.trackCount < 2 ||
		fixture.durationSeconds <= 0
	) {
		throw new Error(
			"Evidence requires an identified long multi-track fixture.",
		);
	}
}

function validateConfig(config: PreviewAudioEvidenceConfig) {
	for (const value of [
		config.chunkTargetSeconds,
		config.lookaheadSeconds,
		config.playbackRate,
		config.playbackSeconds,
		config.pumpIntervalMs,
		config.windowSeconds,
	]) {
		if (!Number.isFinite(value) || value <= 0) {
			throw new Error("Preview audio evidence configuration must be positive.");
		}
	}
}

function assertTrialIdentity(
	trial: PreviewAudioEvidenceTrial,
	fixture: PreviewAudioEvidenceFixture,
	round: number,
	strategy: PreviewAudioEvidenceStrategy,
) {
	if (
		trial.round !== round ||
		trial.strategy !== strategy ||
		trial.fixtureSha256 !== fixture.sha256
	) {
		throw new Error(
			"Trial executor returned mismatched controlled-run identity.",
		);
	}
}

function cloneConfig(
	config: PreviewAudioEvidenceConfig,
): PreviewAudioEvidenceConfig {
	return {
		...config,
		stallSchedule: config.stallSchedule.map((stall) => ({ ...stall })),
	};
}

function throwIfAborted(signal: AbortSignal) {
	if (signal.aborted) {
		throw signal.reason instanceof Error
			? signal.reason
			: new DOMException("Preview audio evidence run cancelled.", "AbortError");
	}
}

function errorToMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

function assertFunctional(
	condition: boolean,
	message: string,
): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}
