import type {
	MediaWindowChunk,
	MediaWindowTrackState,
} from "./media-window-provider";

export type ScheduledWindowAudioNodeLike = {
	connect: (destination: ScheduledWindowAudioNodeLike) => unknown;
	disconnect?: () => void;
};

export type ScheduledWindowGainNodeLike = ScheduledWindowAudioNodeLike & {
	gain: { value: number };
};

export type ScheduledWindowBufferSourceNodeLike =
	ScheduledWindowAudioNodeLike & {
		buffer: AudioBuffer | null;
		onended: (() => void) | null;
		playbackRate: { value: number };
		start: (when?: number, offset?: number, duration?: number) => void;
		stop: () => void;
	};

export type ScheduledWindowAudioContextLike = {
	close?: () => Promise<void> | void;
	createBufferSource: () => ScheduledWindowBufferSourceNodeLike;
	createGain: () => ScheduledWindowGainNodeLike;
	currentTime: number;
	destination: ScheduledWindowAudioNodeLike;
	resume?: () => Promise<void> | void;
};

export type ScheduledWindowEngineStatus =
	| "degraded"
	| "failed"
	| "preparing"
	| "ready";

export type ScheduledWindowEngineMetrics = {
	cleanupCount: number;
	generationResets: number;
	maxUnderrunSeconds: number;
	minScheduledLeadSeconds: number | null;
	peakLiveSourceNodes: number;
	peakRetainedPcmBytes: number;
	retainedPcmBytes: number;
	sourceNodesCreated: number;
	sourceNodesEnded: number;
	sourceNodesStopped: number;
	staleTrackStatePublications: number;
	totalUnderrunSeconds: number;
	underruns: number;
};

export type ScheduledWindowTickResult = {
	needsLookahead: boolean;
	throughSeconds: number;
};

export type ScheduledWindowEngine = {
	applyTrackStates: (publication: {
		generationId: number;
		tracks: readonly MediaWindowTrackState[];
	}) => boolean;
	beginGeneration: (generation: {
		generationId: number;
		startSeconds: number;
	}) => void;
	destroy: () => Promise<void>;
	getCurrentTime: () => number;
	getGenerationId: () => number | null;
	getMetrics: () => ScheduledWindowEngineMetrics;
	getStatus: () => ScheduledWindowEngineStatus;
	isPlaying: () => boolean;
	pause: () => void;
	play: () => Promise<void>;
	rebuildTrackRouting: (trackId: string) => void;
	setPlaybackEnd: (endSeconds: number | null) => void;
	setPlaybackRate: (playbackRate: number) => void;
	setTrackGain: (trackId: string, gain: number) => void;
	tick: () => ScheduledWindowTickResult;
};

export type CreateScheduledWindowEngineOptions = {
	createAudioContext?: () => ScheduledWindowAudioContextLike;
	durationSeconds: number;
	horizonSeconds: number;
	lowWaterSeconds: number;
	trackIds: readonly string[];
	trackDestination?: (
		trackId: string,
		buffer: AudioBuffer,
	) => ScheduledWindowAudioNodeLike;
};

type ScheduledSource = {
	chunk: RetainedChunk;
	released: boolean;
	source: ScheduledWindowBufferSourceNodeLike;
};

type RetainedChunk = {
	cacheRetained: boolean;
	chunk: MediaWindowChunk;
	gapStartSeconds: number | null;
	id: number;
	scheduledSource: ScheduledSource | null;
};

type TrackRuntime = {
	coverageEndSeconds: number;
	gain: number;
	gainNode: ScheduledWindowGainNodeLike;
	lastState: Pick<MediaWindowTrackState, "kind"> | null;
	retainedChunks: RetainedChunk[];
	trackId: string;
};

const MIN_PLAYBACK_RATE = 0.25;
const MAX_PLAYBACK_RATE = 4;
const TIME_EPSILON_SECONDS = 1e-6;

export function createScheduledWindowEngine({
	createAudioContext = createDefaultAudioContext,
	durationSeconds,
	horizonSeconds,
	lowWaterSeconds,
	trackIds,
	trackDestination,
}: CreateScheduledWindowEngineOptions): ScheduledWindowEngine {
	validateConfiguration({ durationSeconds, horizonSeconds, lowWaterSeconds });
	const audioContext = createAudioContext();
	const tracks = new Map<string, TrackRuntime>(
		trackIds.map((trackId) => {
			const gainNode = audioContext.createGain();
			gainNode.gain.value = 1;
			if (!trackDestination) gainNode.connect(audioContext.destination);

			return [
				trackId,
				{
					coverageEndSeconds: 0,
					gain: 1,
					gainNode,
					lastState: null,
					retainedChunks: [],
					trackId,
				} as TrackRuntime,
			] as const;
		}),
	);
	const metrics: ScheduledWindowEngineMetrics = {
		cleanupCount: 0,
		generationResets: 0,
		maxUnderrunSeconds: 0,
		minScheduledLeadSeconds: null,
		peakLiveSourceNodes: 0,
		peakRetainedPcmBytes: 0,
		retainedPcmBytes: 0,
		sourceNodesCreated: 0,
		sourceNodesEnded: 0,
		sourceNodesStopped: 0,
		staleTrackStatePublications: 0,
		totalUnderrunSeconds: 0,
		underruns: 0,
	};
	const activeUnderrunTrackIds = new Set<string>();
	const activeUnderrunDurations = new Map<string, number>();
	let currentTimeSeconds = 0;
	let destroyed = false;
	let generationId: number | null = null;
	let nextChunkId = 1;
	let playbackRate = 1;
	let playbackEndSeconds: number | null = null;
	let playbackStartContextTimeSeconds = audioContext.currentTime;
	let playbackStartMediaTimeSeconds = 0;
	let playing = false;
	let playIntent = 0;

	function getCurrentTime() {
		if (!playing) {
			return currentTimeSeconds;
		}

		return clamp(
			playbackStartMediaTimeSeconds +
				(audioContext.currentTime - playbackStartContextTimeSeconds) *
					playbackRate,
			0,
			durationSeconds,
		);
	}

	function syncCurrentTime() {
		currentTimeSeconds = getCurrentTime();
		playbackStartContextTimeSeconds = audioContext.currentTime;
		playbackStartMediaTimeSeconds = currentTimeSeconds;
	}

	function updateRetainedPcmMetrics() {
		let retainedPcmBytes = 0;

		for (const track of tracks.values()) {
			for (const retained of track.retainedChunks) {
				if (!retained.cacheRetained && !retained.scheduledSource) {
					continue;
				}

				retainedPcmBytes += pcmBytes(retained.chunk.audioBuffer);
			}
		}

		metrics.retainedPcmBytes = retainedPcmBytes;
		metrics.peakRetainedPcmBytes = Math.max(
			metrics.peakRetainedPcmBytes,
			retainedPcmBytes,
		);
	}

	function compactReleasedChunks() {
		for (const track of tracks.values()) {
			track.retainedChunks = track.retainedChunks.filter(
				(retained) => retained.cacheRetained || retained.scheduledSource,
			);
		}
		updateRetainedPcmMetrics();
	}

	function releaseScheduledSource(
		scheduled: ScheduledSource,
		kind: "ended" | "stopped",
	) {
		if (scheduled.released) {
			return;
		}

		scheduled.released = true;
		if (
			kind === "ended" &&
			scheduled.chunk.chunk.endSeconds > getCurrentTime() + TIME_EPSILON_SECONDS
		) {
			scheduled.chunk.gapStartSeconds = getCurrentTime();
		}
		scheduled.source.onended = null;
		scheduled.source.disconnect?.();
		scheduled.source.buffer = null;
		if (scheduled.chunk.scheduledSource === scheduled) {
			scheduled.chunk.scheduledSource = null;
		}

		if (kind === "ended") {
			metrics.sourceNodesEnded += 1;
		} else {
			metrics.sourceNodesStopped += 1;
		}
		compactReleasedChunks();
	}

	function stopScheduledSources() {
		for (const track of tracks.values()) {
			for (const retained of track.retainedChunks) {
				const scheduled = retained.scheduledSource;
				if (!scheduled || scheduled.released) {
					continue;
				}

				try {
					scheduled.source.stop();
				} catch {
					// A one-shot source may already have completed.
				}
				releaseScheduledSource(scheduled, "stopped");
			}
		}
	}

	function scheduleRetainedChunks() {
		if (!playing || destroyed) {
			return;
		}

		const mediaTimeSeconds = getCurrentTime();
		const effectivePlaybackEndSeconds = playbackEndSeconds ?? durationSeconds;
		for (const track of tracks.values()) {
			if (track.lastState?.kind === "failure") {
				continue;
			}

			for (const retained of track.retainedChunks) {
				if (
					retained.scheduledSource ||
					retained.chunk.endSeconds <= mediaTimeSeconds + TIME_EPSILON_SECONDS
				) {
					continue;
				}

				const scheduledChunkEndSeconds = Math.min(
					retained.chunk.endSeconds,
					effectivePlaybackEndSeconds,
				);
				if (
					retained.chunk.startSeconds >= effectivePlaybackEndSeconds ||
					scheduledChunkEndSeconds <= mediaTimeSeconds
				) {
					continue;
				}

				const source = audioContext.createBufferSource();
				source.buffer = retained.chunk.audioBuffer;
				source.playbackRate.value = playbackRate;
				source.connect(
					trackDestination?.(track.trackId, retained.chunk.audioBuffer) ??
						track.gainNode,
				);
				const offsetSeconds = Math.max(
					0,
					mediaTimeSeconds - retained.chunk.startSeconds,
				);
				const whenSeconds =
					playbackStartContextTimeSeconds +
					Math.max(
						0,
						(retained.chunk.startSeconds - playbackStartMediaTimeSeconds) /
							playbackRate,
					);
				const scheduled: ScheduledSource = {
					chunk: retained,
					released: false,
					source,
				};
				retained.gapStartSeconds = null;
				retained.scheduledSource = scheduled;
				source.onended = () => releaseScheduledSource(scheduled, "ended");
				const scheduledDurationSeconds =
					scheduledChunkEndSeconds -
					Math.max(mediaTimeSeconds, retained.chunk.startSeconds);
				if (scheduledChunkEndSeconds < retained.chunk.endSeconds) {
					source.start(whenSeconds, offsetSeconds, scheduledDurationSeconds);
				} else {
					source.start(whenSeconds, offsetSeconds);
				}
				metrics.sourceNodesCreated += 1;
				const leadSeconds = Math.max(0, whenSeconds - audioContext.currentTime);
				metrics.minScheduledLeadSeconds =
					metrics.minScheduledLeadSeconds === null
						? leadSeconds
						: Math.min(metrics.minScheduledLeadSeconds, leadSeconds);
				metrics.peakLiveSourceNodes = Math.max(
					metrics.peakLiveSourceNodes,
					countLiveSourceNodes(),
				);
			}
		}
		updateRetainedPcmMetrics();
	}

	function countLiveSourceNodes() {
		let count = 0;
		for (const track of tracks.values()) {
			for (const retained of track.retainedChunks) {
				if (retained.scheduledSource && !retained.scheduledSource.released) {
					count += 1;
				}
			}
		}
		return count;
	}

	function clearRetainedChunks() {
		stopScheduledSources();
		for (const track of tracks.values()) {
			track.retainedChunks = [];
		}
		updateRetainedPcmMetrics();
	}

	function beginGeneration({
		generationId: nextGenerationId,
		startSeconds,
	}: {
		generationId: number;
		startSeconds: number;
	}) {
		if (destroyed) {
			return;
		}

		playing = false;
		playIntent += 1;
		clearRetainedChunks();
		generationId = nextGenerationId;
		currentTimeSeconds = clamp(startSeconds, 0, durationSeconds);
		playbackStartContextTimeSeconds = audioContext.currentTime;
		playbackStartMediaTimeSeconds = currentTimeSeconds;
		activeUnderrunTrackIds.clear();
		activeUnderrunDurations.clear();
		for (const track of tracks.values()) {
			track.coverageEndSeconds = currentTimeSeconds;
			track.lastState = null;
		}
		metrics.generationResets += 1;
	}

	function removeOverlappingChunks(
		track: TrackRuntime,
		startSeconds: number,
		endSeconds: number,
	) {
		for (const retained of track.retainedChunks) {
			if (
				retained.chunk.endSeconds <= startSeconds ||
				retained.chunk.startSeconds >= endSeconds
			) {
				continue;
			}

			retained.cacheRetained = false;
			const scheduled = retained.scheduledSource;
			if (scheduled && !scheduled.released) {
				try {
					scheduled.source.stop();
				} catch {
					// A one-shot source may already have completed.
				}
				releaseScheduledSource(scheduled, "stopped");
			}
		}
		compactReleasedChunks();
	}

	function applyTrackStates({
		generationId: publicationGenerationId,
		tracks: nextTrackStates,
	}: {
		generationId: number;
		tracks: readonly MediaWindowTrackState[];
	}) {
		if (destroyed || publicationGenerationId !== generationId) {
			metrics.staleTrackStatePublications += 1;
			return false;
		}

		for (const nextState of nextTrackStates) {
			const track = tracks.get(nextState.trackId);
			if (!track) {
				continue;
			}

			// Adjacent publications append coverage. Their PCM edges are rounded to
			// samples and can extend past the publication boundary; replacing that
			// tiny overlap would discard the entire previously scheduled chunk.
			if (
				nextState.kind === "failure" ||
				nextState.startSeconds < track.coverageEndSeconds
			) {
				removeOverlappingChunks(
					track,
					nextState.kind === "failure" ? 0 : nextState.startSeconds,
					nextState.kind === "failure" ? durationSeconds : nextState.endSeconds,
				);
			}
			track.lastState = { kind: nextState.kind };
			track.coverageEndSeconds = Math.max(
				track.coverageEndSeconds,
				nextState.endSeconds,
			);
			if (nextState.kind === "playable") {
				for (const nextChunk of nextState.chunks) {
					track.retainedChunks.push({
						cacheRetained: true,
						chunk: nextChunk,
						gapStartSeconds: null,
						id: nextChunkId,
						scheduledSource: null,
					});
					nextChunkId += 1;
				}
			}
			activeUnderrunTrackIds.delete(track.trackId);
			activeUnderrunDurations.delete(track.trackId);
		}

		updateRetainedPcmMetrics();
		scheduleRetainedChunks();
		return true;
	}

	function getStatus(): ScheduledWindowEngineStatus {
		const states = Array.from(tracks.values(), (track) => track.lastState);
		if (states.some((state) => state === null)) {
			return "preparing";
		}

		const failureCount = states.filter(
			(state) => state?.kind === "failure",
		).length;
		if (failureCount === states.length && states.length > 0) {
			return "failed";
		}

		return failureCount > 0 ? "degraded" : "ready";
	}

	function tick(): ScheduledWindowTickResult {
		const mediaTimeSeconds = getCurrentTime();
		const effectivePlaybackEndSeconds = playbackEndSeconds ?? durationSeconds;
		currentTimeSeconds = mediaTimeSeconds;
		for (const track of tracks.values()) {
			for (const retained of track.retainedChunks) {
				if (retained.chunk.endSeconds <= mediaTimeSeconds) {
					retained.cacheRetained = false;
				}
			}

			let gapStartSeconds: number | null = null;
			if (
				playing &&
				track.lastState?.kind !== "failure" &&
				mediaTimeSeconds < effectivePlaybackEndSeconds &&
				track.coverageEndSeconds + TIME_EPSILON_SECONDS < mediaTimeSeconds
			) {
				gapStartSeconds = track.coverageEndSeconds;
			}
			if (
				playing &&
				mediaTimeSeconds < effectivePlaybackEndSeconds &&
				gapStartSeconds === null
			) {
				const expectedChunk = track.retainedChunks.find(
					(retained) =>
						retained.chunk.startSeconds <=
							mediaTimeSeconds + TIME_EPSILON_SECONDS &&
						retained.chunk.endSeconds > mediaTimeSeconds + TIME_EPSILON_SECONDS,
				);
				if (
					expectedChunk &&
					(!expectedChunk.scheduledSource ||
						expectedChunk.scheduledSource.released)
				) {
					gapStartSeconds =
						expectedChunk.gapStartSeconds ?? expectedChunk.chunk.startSeconds;
				}
			}

			if (gapStartSeconds !== null) {
				if (!activeUnderrunTrackIds.has(track.trackId)) {
					activeUnderrunTrackIds.add(track.trackId);
					activeUnderrunDurations.set(track.trackId, 0);
					metrics.underruns += 1;
				}
				const duration = Math.max(0, mediaTimeSeconds - gapStartSeconds);
				const previouslyCounted =
					activeUnderrunDurations.get(track.trackId) ?? 0;
				metrics.totalUnderrunSeconds += Math.max(
					0,
					duration - previouslyCounted,
				);
				metrics.maxUnderrunSeconds = Math.max(
					metrics.maxUnderrunSeconds,
					duration,
				);
				activeUnderrunDurations.set(track.trackId, duration);
			} else {
				activeUnderrunTrackIds.delete(track.trackId);
				activeUnderrunDurations.delete(track.trackId);
			}
		}
		compactReleasedChunks();

		const activeTracks = Array.from(tracks.values()).filter(
			(track) => track.lastState?.kind !== "failure",
		);
		const minimumCoverageSeconds = Math.min(
			...activeTracks.map((track) => track.coverageEndSeconds),
			durationSeconds,
		);
		const needsLookahead =
			activeTracks.length > 0 &&
			playing &&
			minimumCoverageSeconds < effectivePlaybackEndSeconds &&
			minimumCoverageSeconds - mediaTimeSeconds <= lowWaterSeconds;

		return {
			needsLookahead,
			throughSeconds: Math.min(
				effectivePlaybackEndSeconds,
				mediaTimeSeconds + horizonSeconds,
			),
		};
	}

	return {
		applyTrackStates,
		beginGeneration,
		async destroy() {
			if (destroyed) {
				return;
			}

			destroyed = true;
			playing = false;
			clearRetainedChunks();
			for (const track of tracks.values()) {
				track.gainNode.disconnect?.();
			}
			await audioContext.close?.();
			metrics.cleanupCount += 1;
		},
		getCurrentTime,
		getGenerationId: () => generationId,
		getMetrics() {
			updateRetainedPcmMetrics();
			return { ...metrics };
		},
		getStatus,
		isPlaying: () => playing,
		pause() {
			playIntent += 1;
			if (destroyed || !playing) {
				return;
			}

			syncCurrentTime();
			tick();
			playing = false;
			stopScheduledSources();
		},
		async play() {
			if (destroyed || playing) {
				return;
			}

			const status = getStatus();
			if (status === "preparing") {
				throw new Error("The playhead audio window is still preparing.");
			}
			if (status === "failed") {
				throw new Error("Every required playhead audio track failed.");
			}

			const intent = ++playIntent;
			await audioContext.resume?.();
			if (destroyed || playing || intent !== playIntent) {
				return;
			}

			playing = true;
			playbackStartContextTimeSeconds = audioContext.currentTime;
			playbackStartMediaTimeSeconds = currentTimeSeconds;
			scheduleRetainedChunks();
		},
		rebuildTrackRouting(trackId: string) {
			const track = tracks.get(trackId);
			if (!track || destroyed) {
				return;
			}

			if (playing) {
				syncCurrentTime();
			}
			stopScheduledSources();
			track.gainNode.disconnect?.();
			track.gainNode = audioContext.createGain();
			track.gainNode.gain.value = track.gain;
			track.gainNode.connect(audioContext.destination);
			if (playing) {
				playbackStartContextTimeSeconds = audioContext.currentTime;
				playbackStartMediaTimeSeconds = currentTimeSeconds;
				scheduleRetainedChunks();
			}
		},
		setPlaybackEnd(endSeconds: number | null) {
			if (destroyed || endSeconds === playbackEndSeconds) {
				return;
			}
			if (
				endSeconds !== null &&
				(!Number.isFinite(endSeconds) || endSeconds <= 0)
			) {
				throw new Error("Expected a positive playback end.");
			}
			if (playing) {
				syncCurrentTime();
				stopScheduledSources();
			}
			playbackEndSeconds =
				endSeconds === null ? null : Math.min(endSeconds, durationSeconds);
			if (playing) {
				playbackStartContextTimeSeconds = audioContext.currentTime;
				playbackStartMediaTimeSeconds = currentTimeSeconds;
				scheduleRetainedChunks();
			}
		},
		setPlaybackRate(nextPlaybackRate: number) {
			if (destroyed) {
				return;
			}

			if (playing) {
				syncCurrentTime();
				stopScheduledSources();
			}
			playbackRate = clamp(
				nextPlaybackRate,
				MIN_PLAYBACK_RATE,
				MAX_PLAYBACK_RATE,
			);
			if (playing) {
				playbackStartContextTimeSeconds = audioContext.currentTime;
				playbackStartMediaTimeSeconds = currentTimeSeconds;
				scheduleRetainedChunks();
			}
		},
		setTrackGain(trackId: string, gain: number) {
			const track = tracks.get(trackId);
			if (!track) {
				return;
			}

			track.gain = clamp(gain, 0, 1);
			track.gainNode.gain.value = track.gain;
		},
		tick,
	};
}

function createDefaultAudioContext(): ScheduledWindowAudioContextLike {
	return new AudioContext() as unknown as ScheduledWindowAudioContextLike;
}

function pcmBytes(audioBuffer: AudioBuffer) {
	return (
		audioBuffer.length *
		audioBuffer.numberOfChannels *
		Float32Array.BYTES_PER_ELEMENT
	);
}

function validateConfiguration({
	durationSeconds,
	horizonSeconds,
	lowWaterSeconds,
}: {
	durationSeconds: number;
	horizonSeconds: number;
	lowWaterSeconds: number;
}) {
	if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
		throw new Error(
			`Expected a positive Media duration, got ${durationSeconds}.`,
		);
	}
	if (!Number.isFinite(horizonSeconds) || horizonSeconds <= 0) {
		throw new Error(
			`Expected a positive lookahead horizon, got ${horizonSeconds}.`,
		);
	}
	if (
		!Number.isFinite(lowWaterSeconds) ||
		lowWaterSeconds < 0 ||
		lowWaterSeconds >= horizonSeconds
	) {
		throw new Error(
			`Expected low-water lookahead within the horizon, got ${lowWaterSeconds}/${horizonSeconds}.`,
		);
	}
}

function clamp(value: number, minimum: number, maximum: number) {
	if (!Number.isFinite(value)) {
		return minimum;
	}

	return Math.min(Math.max(value, minimum), maximum);
}
