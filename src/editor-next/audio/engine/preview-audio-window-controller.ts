import type {
	MediaWindowGeneration,
	MediaWindowProvider,
	MediaWindowTrackState,
} from "./media-window-provider";
import type { ScheduledWindowEngine } from "./scheduled-window-engine";

const HORIZON_SECONDS = 2;
const PULL_INTERVAL_MS = 50;
type OwnedGeneration = {
	generation: MediaWindowGeneration;
	abort: AbortController;
	version: number;
	trackId?: string;
	throughSeconds: number;
};

/** Owns decode generations and transport intent; the asset hook owns the provider. */
export function createPreviewAudioWindowController(
	provider: MediaWindowProvider,
	engine: ScheduledWindowEngine,
	initialPlaybackRate = 1,
) {
	let destroyed = false;
	let version = 0;
	let desiredPlaying = false;
	let active: OwnedGeneration | null = null;
	const retries = new Map<string, OwnedGeneration>();
	const failures = new Map<string, string>();
	const listeners = new Set<() => void>();
	let readiness: Promise<void> = Promise.resolve();
	let lookahead: Promise<void> | null = null;
	let timer: ReturnType<typeof setInterval> | null = null;
	let playbackRate = initialPlaybackRate;
	const metrics = {
		generationsOpened: 0,
		generationsCancelled: 0,
		stalePullResults: 0,
		trackRetries: 0,
		cleanupCount: 0,
	};
	function notify() {
		for (const listener of listeners) listener();
	}
	function stopTimer() {
		if (timer !== null) {
			clearInterval(timer);
			timer = null;
		}
	}
	function cancel(owned: OwnedGeneration) {
		owned.abort.abort();
		metrics.generationsCancelled++;
		void owned.generation.cancel().catch(() => {});
	}
	function invalidate() {
		if (active) cancel(active);
		active = null;
		for (const owned of retries.values()) cancel(owned);
		retries.clear();
		lookahead = null;
		version++;
		stopTimer();
	}
	function current(owned: OwnedGeneration) {
		return (
			!destroyed &&
			owned.version === version &&
			(owned.trackId ? retries.get(owned.trackId) === owned : active === owned)
		);
	}
	function publish(
		owned: OwnedGeneration,
		states: readonly MediaWindowTrackState[],
	) {
		if (!current(owned)) {
			metrics.stalePullResults++;
			return;
		}
		const filtered = states.filter(
			(state) => owned.trackId || !retries.has(state.trackId),
		);
		for (const state of filtered) {
			if (state.kind === "failure") failures.set(state.trackId, state.reason);
			else failures.delete(state.trackId);
		}
		const generationId = engine.getGenerationId();
		if (generationId !== null)
			engine.applyTrackStates({ generationId, tracks: filtered });
		notify();
	}
	async function pull(owned: OwnedGeneration, through: number) {
		if (!current(owned) || through <= owned.throughSeconds) return;
		owned.throughSeconds = through;
		try {
			const result = await owned.generation.pullThrough(through);
			publish(owned, result.tracks);
		} catch (error) {
			if (!current(owned) || owned.abort.signal.aborted) return;
			publish(
				owned,
				owned.generation.trackIds.map((trackId) => ({
					trackId,
					kind: "failure",
					state: "failure",
					startSeconds: engine.getCurrentTime(),
					endSeconds: through,
					reason: error instanceof Error ? error.message : String(error),
				})),
			);
		}
	}
	function open(startSeconds: number, trackId?: string): OwnedGeneration {
		const abort = new AbortController();
		const generation = provider.openGeneration({
			signal: abort.signal,
			startSeconds,
			...(trackId ? { trackIds: [trackId], retryTrackIds: [trackId] } : {}),
		});
		metrics.generationsOpened++;
		return {
			generation,
			abort,
			version,
			trackId,
			throughSeconds: startSeconds,
		};
	}
	async function tick() {
		if (destroyed || !engine.isPlaying()) return;
		const next = engine.tick();
		if (!next.needsLookahead || !active || lookahead) return;
		const pending = Promise.all(
			[active, ...retries.values()].map((owned) =>
				pull(owned, next.throughSeconds),
			),
		).then(() => undefined);
		lookahead = pending;
		try {
			await pending;
		} finally {
			if (lookahead === pending) lookahead = null;
		}
	}
	async function resume() {
		if (destroyed || !desiredPlaying) return;
		await engine.play();
		if (!destroyed && desiredPlaying && engine.isPlaying() && timer === null)
			timer = setInterval(() => {
				void tick();
			}, PULL_INTERVAL_MS);
	}
	function prepare(timeSeconds: number) {
		if (destroyed) return Promise.resolve();
		const startSeconds = Math.max(
			0,
			Math.min(
				provider.durationSeconds,
				Number.isFinite(timeSeconds) ? timeSeconds : 0,
			),
		);
		engine.pause();
		invalidate();
		failures.clear();
		const owned = open(startSeconds);
		active = owned;
		engine.beginGeneration({ generationId: owned.generation.id, startSeconds });
		notify();
		const pending = (async () => {
			if (startSeconds >= provider.durationSeconds) {
				publish(
					owned,
					provider.trackIds.map((trackId) => ({
						trackId,
						kind: "silence",
						state: "silence",
						startSeconds,
						endSeconds: startSeconds,
					})),
				);
			} else
				await pull(
					owned,
					Math.min(provider.durationSeconds, startSeconds + HORIZON_SECONDS),
				);
			if (current(owned) && desiredPlaying && engine.getStatus() !== "failed")
				await resume();
		})();
		readiness = pending;
		return pending;
	}
	return {
		prepare,
		getFailures: () => failures as ReadonlyMap<string, string>,
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		getMetrics: () => ({
			...metrics,
			activeTimers: timer === null ? 0 : 1,
			engine: engine.getMetrics(),
		}),
		destroy() {
			if (destroyed) return;
			destroyed = true;
			desiredPlaying = false;
			stopTimer();
			engine.pause();
			invalidate();
			listeners.clear();
			failures.clear();
			void engine.destroy();
			metrics.cleanupCount++;
		},
		pause() {
			desiredPlaying = false;
			stopTimer();
			engine.pause();
		},
		async play() {
			if (destroyed) return;
			desiredPlaying = true;
			// A seek can replace the awaited preparation while a play command is pending.
			let pending: Promise<void>;
			do {
				pending = readiness;
				await pending;
			} while (pending !== readiness && !destroyed && desiredPlaying);
			if (!destroyed && desiredPlaying) await resume();
		},
		setTime(timeSeconds: number) {
			// The transport synchronizes its playhead before Play. A paused window at
			// that exact position already owns everything necessary for exact resume.
			if (
				active &&
				!engine.isPlaying() &&
				engine.getStatus() !== "preparing" &&
				Math.round(timeSeconds * 1_000_000) ===
					Math.round(engine.getCurrentTime() * 1_000_000)
			)
				return readiness;
			return prepare(timeSeconds);
		},
		setPlaybackRate(rate: number) {
			const normalized =
				Number.isFinite(rate) && rate > 0
					? Math.max(0.25, Math.min(4, rate))
					: 1;
			if (normalized === playbackRate) return readiness;
			playbackRate = normalized;
			engine.pause();
			engine.setPlaybackRate(normalized);
			return prepare(engine.getCurrentTime());
		},
		rebuildRouting() {
			return prepare(engine.getCurrentTime());
		},
		async retryTrack(trackId: string) {
			if (
				destroyed ||
				!provider.trackIds.includes(trackId) ||
				!failures.has(trackId)
			)
				return;
			const previous = retries.get(trackId);
			if (previous) cancel(previous);
			const start = engine.getCurrentTime();
			const owned = open(start, trackId);
			retries.set(trackId, owned);
			metrics.trackRetries++;
			await pull(
				owned,
				Math.min(provider.durationSeconds, start + HORIZON_SECONDS),
			);
		},
		tick,
	};
}
