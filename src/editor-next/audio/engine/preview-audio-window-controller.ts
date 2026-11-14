import { errorMessage } from "@/lib/error-message";
import type { PreviewAudioPlaybackState } from "../types/preview-audio-engine.types";
import type {
	MediaWindowGeneration,
	MediaWindowProvider,
	MediaWindowTrackState,
} from "./media-window-provider";
import {
	type PreviewAudioContextLifecycleSource,
	type PreviewAudioContextAvailability,
	createPreviewAudioContextLifecycle,
} from "./preview-audio-context-lifecycle";
import {
	PREVIEW_AUDIO_WINDOW_HORIZON_SECONDS,
	PREVIEW_AUDIO_WINDOW_PULL_INTERVAL_MS,
} from "./preview-audio-window-policy";
import type { ScheduledWindowEngine } from "./scheduled-window-engine";

type OwnedGeneration = {
	generation: MediaWindowGeneration;
	abort: AbortController;
	pendingPull: Promise<void> | null;
	phase: "priming" | "established";
	version: number;
	trackId?: string;
	throughSeconds: number;
};

type PlaybackIntent = { resumePending: boolean; videoReady?: Promise<void> };

/** Owns decode generations and transport intent; the asset hook owns the provider. */
export function createPreviewAudioWindowController(
	provider: MediaWindowProvider,
	engine: ScheduledWindowEngine,
	initialPlaybackRate = 1,
	audioContext: PreviewAudioContextLifecycleSource = {},
) {
	let destroyed = false;
	let version = 0;
	let playbackIntent: PlaybackIntent | null = null;
	let interruptedTimeSeconds: number | null = null;
	let active: OwnedGeneration | null = null;
	const retries = new Map<string, OwnedGeneration>();
	const listeners = new Set<() => void>();
	let readiness: Promise<void> = Promise.resolve();
	let timer: ReturnType<typeof setInterval> | null = null;
	let playbackRate = initialPlaybackRate;
	let playbackState: PreviewAudioPlaybackState =
		audioContext.state === "closed" ? "closed" : "paused";
	const contextLifecycle = createPreviewAudioContextLifecycle(
		audioContext,
		contextAvailabilityChanged,
	);
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
	function setPlaybackState(state: PreviewAudioPlaybackState) {
		if (playbackState === state) return;
		playbackState = state;
		notify();
	}
	function getCurrentTime() {
		return interruptedTimeSeconds ?? engine.getCurrentTime();
	}

	function contextAvailabilityChanged(
		availability: PreviewAudioContextAvailability,
	) {
		if (destroyed || playbackState === "closed") return;
		const intent = playbackIntent;
		if (availability === "closed") {
			playbackIntent = null;
			contextLifecycle.cancelResume();
			engine.pause();
			invalidate();
			setPlaybackState("closed");
			return;
		}
		if (!intent) return;
		if (availability === "running") {
			if (!intent.resumePending)
				startAutomatically(intent, resumePlayback(intent));
			return;
		}

		engine.pause();
		interruptedTimeSeconds = getCurrentTime();
		invalidate();
		if (!intent.resumePending) {
			setPlaybackState("interrupted");
			if (playbackIntent === intent)
				startAutomatically(intent, requestContextResume(intent));
		}
	}

	function startAutomatically(intent: PlaybackIntent, start: Promise<void>) {
		void start.catch(() => {
			if (playbackIntent === intent) pause();
		});
	}

	async function requestContextResume(intent: PlaybackIntent) {
		intent.resumePending = true;
		setPlaybackState(contextLifecycle.isRunning() ? "buffering" : "resuming");
		if (playbackIntent !== intent) return;
		const running = await contextLifecycle.resume();
		if (playbackIntent !== intent) return;
		if (!running || !contextLifecycle.isRunning()) {
			intent.resumePending = false;
			setPlaybackState("recovery-required");
			return;
		}
		if (intent.videoReady) {
			await intent.videoReady;
			if (playbackIntent !== intent) return;
			intent.videoReady = undefined;
			if (!contextLifecycle.isRunning()) {
				await requestContextResume(intent);
				return;
			}
		}
		intent.resumePending = false;
		await resumePlayback(intent);
	}

	async function resumePlayback(intent: PlaybackIntent) {
		const interruptionPosition = interruptedTimeSeconds;
		if (interruptionPosition !== null || !active) {
			const position = interruptionPosition ?? engine.getCurrentTime();
			interruptedTimeSeconds = null;
			void prepare(position);
		} else {
			setPlaybackState("buffering");
		}
		let pending: Promise<void>;
		do {
			pending = readiness;
			await pending;
		} while (pending !== readiness && playbackIntent === intent);
		if (playbackIntent === intent && active) await resume(active);
	}

	function pause() {
		playbackIntent = null;
		contextLifecycle.cancelResume();
		stopTimer();
		engine.pause();
		if (playbackState !== "closed") setPlaybackState("paused");
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
		const generationId = engine.getGenerationId();
		if (
			generationId === null ||
			!engine.applyTrackStates({ generationId, tracks: filtered })
		)
			return;
		owned.phase = "established";
		notify();
	}
	function pull(
		owned: OwnedGeneration,
		through: number,
	): Promise<void> | undefined {
		if (!current(owned) || owned.pendingPull || through <= owned.throughSeconds)
			return;
		// A recovering decoder can lag behind the playhead. Bound each pull as it catches up.
		const end = Math.min(
			through,
			owned.throughSeconds + PREVIEW_AUDIO_WINDOW_HORIZON_SECONDS,
		);
		owned.throughSeconds = end;
		const pending = readWindow(owned, end).finally(() => {
			owned.pendingPull = null;
		});
		owned.pendingPull = pending;
		return pending;
	}
	async function readWindow(owned: OwnedGeneration, through: number) {
		try {
			const result = await owned.generation.pullThrough(through);
			publish(owned, result);
		} catch (error) {
			if (!current(owned) || owned.abort.signal.aborted) return;
			publish(
				owned,
				owned.generation.trackIds.map((trackId) => ({
					trackId,
					kind: "failure",
					startSeconds: engine.getCurrentTime(),
					endSeconds: through,
					reason: errorMessage(error),
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
			pendingPull: null,
			phase: "priming",
			version,
			trackId,
			throughSeconds: startSeconds,
		};
	}
	function tick() {
		if (destroyed || !engine.isPlaying()) return;
		const next = engine.tick();
		if (!next.needsLookahead || !active) return;
		// Each generation owns its own in-flight pull, including track retries.
		for (const owned of [active, ...retries.values()])
			void pull(owned, next.throughSeconds);
	}
	function prime(owned: OwnedGeneration, startSeconds: number) {
		if (startSeconds < provider.durationSeconds) {
			return pull(
				owned,
				Math.min(
					provider.durationSeconds,
					startSeconds + PREVIEW_AUDIO_WINDOW_HORIZON_SECONDS,
				),
			);
		}
		publish(
			owned,
			owned.generation.trackIds.map((trackId) => ({
				kind: "silence",
				trackId,
				startSeconds,
				endSeconds: startSeconds,
			})),
		);
	}
	async function resume(owned: OwnedGeneration) {
		const intent = playbackIntent;
		if (
			!intent ||
			intent.resumePending ||
			!current(owned) ||
			!contextLifecycle.isRunning()
		)
			return;
		try {
			await engine.play();
		} catch (error) {
			if (playbackIntent === intent && current(owned)) throw error;
			return;
		}
		if (
			playbackIntent === intent &&
			current(owned) &&
			contextLifecycle.isRunning() &&
			engine.isPlaying()
		) {
			setPlaybackState("playing");
			if (timer === null && playbackIntent === intent && current(owned))
				timer = setInterval(tick, PREVIEW_AUDIO_WINDOW_PULL_INTERVAL_MS);
		}
	}
	function prepare(timeSeconds: number) {
		if (destroyed || playbackState === "closed") return Promise.resolve();
		const startSeconds = Math.max(
			0,
			Math.min(
				provider.durationSeconds,
				Number.isFinite(timeSeconds) ? timeSeconds : 0,
			),
		);
		if (interruptedTimeSeconds !== null) {
			interruptedTimeSeconds = startSeconds;
			notify();
			return Promise.resolve();
		}
		engine.pause();
		invalidate();
		const owned = open(startSeconds);
		active = owned;
		engine.beginGeneration({ generationId: owned.generation.id, startSeconds });
		const pending = Promise.resolve().then(async () => {
			if (!current(owned)) return;
			await prime(owned, startSeconds);
			const status = engine.getStatus();
			if (current(owned) && (status === "ready" || status === "degraded"))
				await resume(owned);
		});
		const retired = new Promise<void>((resolve) => {
			owned.abort.signal.addEventListener("abort", () => resolve(), {
				once: true,
			});
		});
		readiness = Promise.race([pending, retired]);
		if (
			playbackIntent &&
			!playbackIntent.resumePending &&
			contextLifecycle.isRunning()
		)
			setPlaybackState("buffering");
		notify();
		return pending;
	}
	return {
		initialize(timeSeconds: number) {
			void prepare(timeSeconds);
			return readiness;
		},
		getCurrentTime,
		getPlaybackState: () => playbackState,
		isTrackRetrying: (trackId: string) =>
			retries.get(trackId)?.phase === "priming",
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
			playbackIntent = null;
			contextLifecycle.destroy();
			stopTimer();
			engine.pause();
			invalidate();
			listeners.clear();
			playbackState = "closed";
			void engine.destroy();
			metrics.cleanupCount++;
		},
		pause,
		async play(videoReady?: Promise<void>) {
			if (destroyed || playbackState === "closed") return;
			if (engine.isPlaying() && contextLifecycle.isRunning()) return;
			const intent = { resumePending: false, videoReady };
			playbackIntent = intent;
			await requestContextResume(intent);
		},
		setTime(timeSeconds: number) {
			if (playbackState === "closed") return Promise.resolve();
			// The transport synchronizes its playhead before Play. A paused window at
			// that exact position already owns everything necessary for exact resume.
			if (
				active &&
				!engine.isPlaying() &&
				Math.round(timeSeconds * 1_000_000) ===
					Math.round(engine.getCurrentTime() * 1_000_000)
			)
				return readiness;
			return prepare(timeSeconds);
		},
		setPlaybackRate(rate: number) {
			if (playbackState === "closed") return Promise.resolve();
			const normalized =
				Number.isFinite(rate) && rate > 0
					? Math.max(0.25, Math.min(4, rate))
					: 1;
			if (normalized === playbackRate) return readiness;
			playbackRate = normalized;
			engine.pause();
			engine.setPlaybackRate(normalized);
			return prepare(getCurrentTime());
		},
		rebuildRouting() {
			return playbackState === "closed"
				? Promise.resolve()
				: prepare(getCurrentTime());
		},
		async retryTrack(trackId: string) {
			if (
				destroyed ||
				playbackState === "closed" ||
				engine.getTrackReadiness(trackId)?.kind !== "failure"
			)
				return;
			const previous = retries.get(trackId);
			if (previous?.phase === "priming") return;
			if (previous) cancel(previous);
			const start = engine.getCurrentTime();
			const owned = open(start, trackId);
			retries.set(trackId, owned);
			metrics.trackRetries++;
			notify();
			if (current(owned)) await prime(owned, start);
		},
		tick,
	};
}
