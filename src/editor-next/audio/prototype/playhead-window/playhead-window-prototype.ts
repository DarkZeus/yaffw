import type {
	MediaWindowGeneration,
	MediaWindowProvider,
	MediaWindowTrackState,
} from "../../engine/media-window-provider";
import {
	type ScheduledWindowAudioContextLike,
	type ScheduledWindowEngine,
	type ScheduledWindowEngineMetrics,
	createScheduledWindowEngine,
} from "../../engine/scheduled-window-engine";

export type PlayheadWindowPrototypeAudioContextFactory =
	() => ScheduledWindowAudioContextLike;

export type PlayheadWindowPrototypeLoop = {
	endSeconds: number;
	startSeconds: number;
};

export type PlayheadWindowPrototypeMetrics = {
	cleanupCount: number;
	engine: ScheduledWindowEngineMetrics;
	generationsCancelled: number;
	generationsOpened: number;
	mediaReplacements: number;
	stalePullResults: number;
	trackRetries: number;
};

export type PlayheadWindowPrototype = {
	destroy: () => Promise<void>;
	getCurrentTime: () => number;
	getMetrics: () => PlayheadWindowPrototypeMetrics;
	getStatus: ScheduledWindowEngine["getStatus"];
	pause: () => void;
	play: () => Promise<void>;
	prepare: (startSeconds?: number) => Promise<void>;
	rebuildTrackRouting: (trackId: string) => Promise<void>;
	replaceProvider: (
		provider: MediaWindowProvider,
		startSeconds?: number,
	) => Promise<void>;
	retryTrack: (trackId: string) => Promise<void>;
	seek: (timeSeconds: number) => Promise<void>;
	setLoop: (loop: PlayheadWindowPrototypeLoop | null) => void;
	setPlaybackRate: (playbackRate: number) => Promise<void>;
	setTrackGain: (trackId: string, gain: number) => void;
	tick: () => Promise<void>;
};

export type CreatePlayheadWindowPrototypeOptions = {
	createAudioContext?: PlayheadWindowPrototypeAudioContextFactory;
	horizonSeconds: number;
	lowWaterSeconds: number;
	provider: MediaWindowProvider;
};

type OwnedGeneration = {
	abortController: AbortController;
	generation: MediaWindowGeneration;
	version: number;
};

type MutableMetrics = Omit<PlayheadWindowPrototypeMetrics, "engine">;

export function createPlayheadWindowPrototype({
	createAudioContext,
	horizonSeconds,
	lowWaterSeconds,
	provider: initialProvider,
}: CreatePlayheadWindowPrototypeOptions): PlayheadWindowPrototype {
	let provider = initialProvider;
	let engine = createEngine(provider);
	let activeGeneration: OwnedGeneration | null = null;
	const retryGenerations = new Map<string, OwnedGeneration>();
	const metrics: MutableMetrics = {
		cleanupCount: 0,
		generationsCancelled: 0,
		generationsOpened: 0,
		mediaReplacements: 0,
		stalePullResults: 0,
		trackRetries: 0,
	};
	let destroyed = false;
	let generationVersion = 0;
	let lookaheadPromise: Promise<void> | null = null;
	let loop: PlayheadWindowPrototypeLoop | null = null;
	let readinessPromise: Promise<void> | null = null;

	function createEngine(nextProvider: MediaWindowProvider) {
		return createScheduledWindowEngine({
			createAudioContext,
			durationSeconds: nextProvider.durationSeconds,
			horizonSeconds,
			lowWaterSeconds,
			trackIds: nextProvider.trackIds,
		});
	}

	function generationIsCurrent(ownership: OwnedGeneration) {
		return (
			!destroyed &&
			activeGeneration === ownership &&
			ownership.version === generationVersion
		);
	}

	async function cancelOwnedGeneration(ownership: OwnedGeneration | null) {
		if (!ownership) {
			return;
		}

		ownership.abortController.abort();
		metrics.generationsCancelled += 1;
		try {
			await ownership.generation.cancel();
		} catch {
			// Cancellation is best-effort; publication still uses version checks.
		}
	}

	function cancelActiveWork() {
		const previousGeneration = activeGeneration;
		activeGeneration = null;
		const previousRetries = Array.from(retryGenerations.values());
		retryGenerations.clear();
		generationVersion += 1;
		lookaheadPromise = null;

		return Promise.all([
			cancelOwnedGeneration(previousGeneration),
			...previousRetries.map(cancelOwnedGeneration),
		]);
	}

	function publishPullFailure(
		ownership: OwnedGeneration,
		startSeconds: number,
		endSeconds: number,
		failure: unknown,
	) {
		if (!generationIsCurrent(ownership)) {
			return;
		}

		const reason = failure instanceof Error ? failure.message : String(failure);
		engine.applyTrackStates({
			generationId: ownership.generation.id,
			tracks: ownership.generation.trackIds.map(
				(trackId): MediaWindowTrackState => ({
					endSeconds,
					kind: "failure",
					reason,
					startSeconds,
					state: "failure",
					trackId,
				}),
			),
		});
	}

	async function pullInitialWindow(
		ownership: OwnedGeneration,
		startSeconds: number,
	) {
		const throughSeconds = Math.min(
			provider.durationSeconds,
			loop?.endSeconds ?? provider.durationSeconds,
			startSeconds + horizonSeconds,
		);
		try {
			const result = await ownership.generation.pullThrough(throughSeconds);
			if (!generationIsCurrent(ownership)) {
				metrics.stalePullResults += 1;
				return;
			}

			engine.applyTrackStates({
				generationId: ownership.generation.id,
				tracks: result.tracks,
			});
		} catch (error) {
			if (isAbortError(error) || !generationIsCurrent(ownership)) {
				return;
			}

			publishPullFailure(ownership, startSeconds, throughSeconds, error);
		}
	}

	function startGeneration(startSeconds: number) {
		if (destroyed) {
			return Promise.reject(
				new Error("The playhead-window prototype has been destroyed."),
			);
		}

		const normalizedStartSeconds = Math.min(
			Math.max(Number.isFinite(startSeconds) ? startSeconds : 0, 0),
			provider.durationSeconds,
		);
		void cancelActiveWork();
		const abortController = new AbortController();
		const generation = provider.openGeneration({
			signal: abortController.signal,
			startSeconds: normalizedStartSeconds,
		});
		const ownership: OwnedGeneration = {
			abortController,
			generation,
			version: generationVersion,
		};
		activeGeneration = ownership;
		metrics.generationsOpened += 1;
		engine.beginGeneration({
			generationId: generation.id,
			startSeconds: normalizedStartSeconds,
		});
		const preparation =
			normalizedStartSeconds >= provider.durationSeconds
				? Promise.resolve().then(() => {
						if (!generationIsCurrent(ownership)) {
							return;
						}
						engine.applyTrackStates({
							generationId: generation.id,
							tracks: generation.trackIds.map(
								(trackId): MediaWindowTrackState => ({
									endSeconds: normalizedStartSeconds,
									kind: "silence",
									startSeconds: normalizedStartSeconds,
									state: "silence",
									trackId,
								}),
							),
						});
					})
				: pullInitialWindow(ownership, normalizedStartSeconds);
		readinessPromise = preparation;

		return preparation;
	}

	async function pullLookahead(throughSeconds: number) {
		const mainGeneration = activeGeneration;
		if (!mainGeneration || lookaheadPromise) {
			return lookaheadPromise ?? Promise.resolve();
		}

		const ownerships = [mainGeneration, ...retryGenerations.values()];
		const expectedEngineGenerationId = engine.getGenerationId();
		if (expectedEngineGenerationId === null) {
			return;
		}
		const expectedVersion = generationVersion;
		const pending = Promise.all(
			ownerships.map(async (ownership) => {
				try {
					const result = await ownership.generation.pullThrough(throughSeconds);
					if (
						destroyed ||
						expectedVersion !== generationVersion ||
						expectedEngineGenerationId !== engine.getGenerationId()
					) {
						metrics.stalePullResults += 1;
						return;
					}

					engine.applyTrackStates({
						generationId: expectedEngineGenerationId,
						tracks: result.tracks,
					});
				} catch (error) {
					if (!isAbortError(error) && expectedVersion === generationVersion) {
						publishLookaheadFailures({
							endSeconds: throughSeconds,
							error,
							expectedEngineGenerationId,
							ownership,
						});
					}
				}
			}),
		).then(() => undefined);
		lookaheadPromise = pending;
		try {
			await pending;
		} finally {
			if (lookaheadPromise === pending) {
				lookaheadPromise = null;
			}
		}
	}

	function publishLookaheadFailures({
		endSeconds,
		error,
		expectedEngineGenerationId,
		ownership,
	}: {
		endSeconds: number;
		error: unknown;
		expectedEngineGenerationId: number | null;
		ownership: OwnedGeneration;
	}) {
		if (expectedEngineGenerationId === null) {
			return;
		}

		const reason = error instanceof Error ? error.message : String(error);
		engine.applyTrackStates({
			generationId: expectedEngineGenerationId,
			tracks: ownership.generation.trackIds.map(
				(trackId): MediaWindowTrackState => ({
					endSeconds,
					kind: "failure",
					reason,
					startSeconds: engine.getCurrentTime(),
					state: "failure",
					trackId,
				}),
			),
		});
	}

	async function resumeAfterInvalidation(
		startSeconds: number,
		wasPlaying: boolean,
	) {
		await startGeneration(startSeconds);
		if (wasPlaying && engine.getStatus() !== "failed") {
			await engine.play();
		}
	}

	return {
		async destroy() {
			if (destroyed) {
				return;
			}

			destroyed = true;
			await cancelActiveWork();
			await engine.destroy();
			await provider.dispose();
			metrics.cleanupCount += 1;
		},
		getCurrentTime: () => engine.getCurrentTime(),
		getMetrics: () => ({ ...metrics, engine: engine.getMetrics() }),
		getStatus: () => engine.getStatus(),
		pause: () => engine.pause(),
		async play() {
			if (!readinessPromise) {
				await startGeneration(engine.getCurrentTime());
			} else {
				await readinessPromise;
			}
			await engine.play();
		},
		prepare: (startSeconds = 0) => startGeneration(startSeconds),
		async rebuildTrackRouting(trackId: string) {
			const wasPlaying = engine.isPlaying();
			engine.pause();
			const currentTimeSeconds = engine.getCurrentTime();
			engine.rebuildTrackRouting(trackId);
			await resumeAfterInvalidation(currentTimeSeconds, wasPlaying);
		},
		async replaceProvider(nextProvider, startSeconds = 0) {
			if (destroyed) {
				throw new Error("The playhead-window prototype has been destroyed.");
			}

			await cancelActiveWork();
			await engine.destroy();
			await provider.dispose();
			provider = nextProvider;
			engine = createEngine(nextProvider);
			engine.setPlaybackEnd(loop?.endSeconds ?? null);
			readinessPromise = null;
			metrics.mediaReplacements += 1;
			await startGeneration(startSeconds);
		},
		async retryTrack(trackId: string) {
			if (!provider.trackIds.includes(trackId)) {
				return;
			}
			const engineGenerationId = engine.getGenerationId();
			if (engineGenerationId === null) {
				await startGeneration(engine.getCurrentTime());
				return;
			}

			const previousRetry = retryGenerations.get(trackId) ?? null;
			if (previousRetry) {
				await cancelOwnedGeneration(previousRetry);
			}
			const abortController = new AbortController();
			const startSeconds = engine.getCurrentTime();
			const generation = provider.openGeneration({
				signal: abortController.signal,
				startSeconds,
				trackIds: [trackId],
			});
			const ownership: OwnedGeneration = {
				abortController,
				generation,
				version: generationVersion,
			};
			retryGenerations.set(trackId, ownership);
			metrics.generationsOpened += 1;
			metrics.trackRetries += 1;
			const throughSeconds = Math.min(
				provider.durationSeconds,
				startSeconds + horizonSeconds,
			);
			try {
				const result = await generation.pullThrough(throughSeconds);
				if (
					destroyed ||
					ownership.version !== generationVersion ||
					retryGenerations.get(trackId) !== ownership ||
					engine.getGenerationId() !== engineGenerationId
				) {
					metrics.stalePullResults += 1;
					return;
				}

				engine.applyTrackStates({
					generationId: engineGenerationId,
					tracks: result.tracks,
				});
			} catch (error) {
				if (!isAbortError(error) && ownership.version === generationVersion) {
					publishLookaheadFailures({
						endSeconds: throughSeconds,
						error,
						expectedEngineGenerationId: engineGenerationId,
						ownership,
					});
				}
			}
		},
		async seek(timeSeconds: number) {
			const wasPlaying = engine.isPlaying();
			engine.pause();
			await resumeAfterInvalidation(timeSeconds, wasPlaying);
		},
		setLoop(nextLoop) {
			if (
				nextLoop &&
				(!Number.isFinite(nextLoop.startSeconds) ||
					!Number.isFinite(nextLoop.endSeconds) ||
					nextLoop.startSeconds < 0 ||
					nextLoop.endSeconds <= nextLoop.startSeconds)
			) {
				throw new Error("Expected a positive selection-loop range.");
			}
			loop = nextLoop;
			engine.setPlaybackEnd(nextLoop?.endSeconds ?? null);
		},
		async setPlaybackRate(playbackRate: number) {
			const wasPlaying = engine.isPlaying();
			engine.pause();
			const currentTimeSeconds = engine.getCurrentTime();
			engine.setPlaybackRate(playbackRate);
			await resumeAfterInvalidation(currentTimeSeconds, wasPlaying);
		},
		setTrackGain: (trackId, gain) => engine.setTrackGain(trackId, gain),
		async tick() {
			if (destroyed) {
				return;
			}

			if (loop && engine.getCurrentTime() >= loop.endSeconds) {
				const wasPlaying = engine.isPlaying();
				engine.pause();
				await resumeAfterInvalidation(loop.startSeconds, wasPlaying);
				return;
			}
			const lookahead = engine.tick();
			if (lookahead.needsLookahead) {
				await pullLookahead(lookahead.throughSeconds);
			}
		},
	};
}

function isAbortError(error: unknown) {
	return error instanceof DOMException && error.name === "AbortError";
}
