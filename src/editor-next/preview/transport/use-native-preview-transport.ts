import {
	browserNowMs,
	cancelBrowserFrame,
	requestBrowserFrame,
} from "@/lib/browser-animation-frame";
import { clamp } from "@/lib/clamp";
import {
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

import type { MediaTimeUs, Selection } from "@/editor-core/model";

import type {
	PreviewAudioEngine,
	PreviewAudioPlaybackState,
} from "../../audio/types/preview-audio-engine.types";
import type { PreviewClockMode } from "./preview-clock-mode";

const PREVIEW_AV_HARD_RESYNC_MIN_THRESHOLD_SECONDS = 0.25;
const PREVIEW_AV_HARD_RESYNC_FRAME_TOLERANCE = 2;
const PREVIEW_PLAYHEAD_UI_COMMIT_INTERVAL_MS = 50;
const PREVIEW_PLAYHEAD_UI_COMMIT_JUMP_US = 50_000;

export type PreviewMediaTransportHandle = {
	currentTime: number;
	readonly seeking?: boolean;
	muted: boolean;
	pause: () => Promise<void> | void;
	play: () => Promise<void>;
	playbackRate: number;
	volume: number;
};

export type UseNativePreviewTransportOptions = {
	durationUs: MediaTimeUs;
	frameDurationUs: MediaTimeUs;
	previewAudioEngineRef: RefObject<PreviewAudioEngine | null>;
	previewClockMode: PreviewClockMode;
	selection: Selection;
	source: Blob;
	videoRef: RefObject<PreviewMediaTransportHandle | null>;
};

type PlayheadCommitOptions =
	| {
			kind: "force";
	  }
	| {
			kind: "throttled";
			timestampMs: number;
	  };

type PreviewSyncOptions = {
	timestampMs?: number;
};

export function useNativePreviewTransport({
	durationUs,
	frameDurationUs,
	previewAudioEngineRef,
	previewClockMode,
	selection,
	source,
	videoRef,
}: UseNativePreviewTransportOptions) {
	const playheadRef = useRef<MediaTimeUs>(0);
	const renderingPlayheadRef = useRef<MediaTimeUs>(0);
	const playbackRateRef = useRef(1);
	const playbackStartRequestIdRef = useRef(0);
	const playbackStartPendingRef = useRef(false);
	const playbackRequestedRef = useRef(false);
	const [playbackRequested, setPlaybackRequestedState] = useState(false);
	const [audioPlaybackState, setAudioPlaybackState] =
		useState<PreviewAudioPlaybackState>("paused");
	const setPlaybackRequested = useCallback((requested: boolean) => {
		playbackRequestedRef.current = requested;
		setPlaybackRequestedState(requested);
	}, []);
	const previewScrubActiveRef = useRef(false);
	const playheadAnimationFrameRef = useRef<number | null>(null);
	const playheadStateCommitTimestampRef = useRef<number | null>(null);
	const playheadStateRef = useRef<MediaTimeUs>(0);
	const pendingVideoFollowerSeekSecondsRef = useRef<number | null>(null);
	const selectionLoopEnteredRef = useRef(false);
	const [isPlaying, setIsPlaying] = useState(false);
	const [muted, setMuted] = useState(false);
	const [playbackRate, setPlaybackRate] = useState(1);
	const [playheadUs, setPlayheadUsState] = useState<MediaTimeUs>(0);
	const [selectionLoopEnabled, setSelectionLoopEnabled] = useState(false);
	const [volume, setVolume] = useState(1);
	const selectionLoopConfigRef = useRef({
		selection,
		enabled: selectionLoopEnabled,
	});
	selectionLoopConfigRef.current = { selection, enabled: selectionLoopEnabled };

	const getPlaybackRate = useCallback(() => playbackRateRef.current, []);
	const getPlayheadUs = useCallback(() => playheadRef.current, []);
	const audioMasterClockActive = previewClockMode === "audio-master";
	const nativeVideoClockActive = previewClockMode === "native-video";

	useEffect(() => {
		if (!source) {
			return;
		}

		playheadRef.current = 0;
		renderingPlayheadRef.current = 0;
		playheadStateRef.current = 0;
		playheadStateCommitTimestampRef.current = null;
		pendingVideoFollowerSeekSecondsRef.current = null;
		playbackStartRequestIdRef.current += 1;
		playbackStartPendingRef.current = false;
		setPlaybackRequested(false);
		previewScrubActiveRef.current = false;
		selectionLoopEnteredRef.current = false;
		setPlayheadUsState(0);
		setIsPlaying(false);
		setSelectionLoopEnabled(false);
		return () => {
			playbackStartRequestIdRef.current += 1;
			playbackRequestedRef.current = false;
		};
	}, [source, setPlaybackRequested]);

	const commitPlayheadState = useCallback(
		(nextPlayheadUs: MediaTimeUs, options: PlayheadCommitOptions) => {
			const previousCommittedPlayheadUs = playheadStateRef.current;
			const previousCommitTimestampMs = playheadStateCommitTimestampRef.current;
			const shouldCommit =
				options.kind === "force" ||
				previousCommitTimestampMs === null ||
				Math.abs(nextPlayheadUs - previousCommittedPlayheadUs) >=
					PREVIEW_PLAYHEAD_UI_COMMIT_JUMP_US ||
				options.timestampMs - previousCommitTimestampMs >=
					PREVIEW_PLAYHEAD_UI_COMMIT_INTERVAL_MS;

			if (!shouldCommit) {
				return;
			}

			playheadStateRef.current = nextPlayheadUs;
			playheadStateCommitTimestampRef.current =
				options.kind === "throttled" ? options.timestampMs : browserNowMs();
			setPlayheadUsState((currentPlayheadUs) =>
				currentPlayheadUs === nextPlayheadUs
					? currentPlayheadUs
					: nextPlayheadUs,
			);
		},
		[],
	);

	const setPlayheadUs = useCallback(
		(
			nextPlayheadUs: MediaTimeUs,
			options: PlayheadCommitOptions = { kind: "force" },
		) => {
			const clampedPlayheadUs = clamp(
				Math.round(nextPlayheadUs),
				0,
				durationUs,
			);

			playheadRef.current = clampedPlayheadUs;
			commitPlayheadState(clampedPlayheadUs, options);
		},
		[commitPlayheadState, durationUs],
	);

	const setPreviewTransportTime = useCallback(
		(nextPlayheadUs: MediaTimeUs) => {
			renderingPlayheadRef.current = nextPlayheadUs;
			const nextTimeSeconds = nextPlayheadUs / 1_000_000;
			const video = videoRef.current;

			if (video) {
				pendingVideoFollowerSeekSecondsRef.current = setVideoFollowerTime(
					video,
					nextPlayheadUs,
				)
					? nextTimeSeconds
					: null;
			}

			if (audioMasterClockActive) {
				previewAudioEngineRef.current?.setPlaybackEnd(
					selectionLoopEnabled && nextPlayheadUs < selection.endUs
						? selection.endUs / 1_000_000
						: null,
				);
				previewAudioEngineRef.current?.setTime(nextTimeSeconds);
			}
		},
		[
			audioMasterClockActive,
			previewAudioEngineRef,
			selection.endUs,
			selectionLoopEnabled,
			videoRef,
		],
	);

	const updateSelectionLoopEntryFromPlayhead = useCallback(
		(nextPlayheadUs: MediaTimeUs) => {
			selectionLoopEnteredRef.current =
				selectionLoopEnabled &&
				isMediaTimeInsideSelection(nextPlayheadUs, selection);
		},
		[selection, selectionLoopEnabled],
	);

	const seekToUs = useCallback(
		(nextPlayheadUs: MediaTimeUs) => {
			const clampedPlayheadUs = clamp(
				Math.round(nextPlayheadUs),
				0,
				durationUs,
			);

			previewScrubActiveRef.current = false;
			setPreviewTransportTime(clampedPlayheadUs);
			updateSelectionLoopEntryFromPlayhead(clampedPlayheadUs);
			setPlayheadUs(clampedPlayheadUs);
		},
		[
			durationUs,
			setPlayheadUs,
			setPreviewTransportTime,
			updateSelectionLoopEntryFromPlayhead,
		],
	);

	const previewScrubToUs = useCallback(
		(nextPlayheadUs: MediaTimeUs) => {
			const clampedPlayheadUs = clamp(
				Math.round(nextPlayheadUs),
				0,
				durationUs,
			);

			if (!previewScrubActiveRef.current) {
				const nativePlaybackShouldPause =
					isPlaying || playbackStartPendingRef.current;
				playbackStartRequestIdRef.current += 1;
				playbackStartPendingRef.current = false;
				previewAudioEngineRef.current?.pause();
				if (nativePlaybackShouldPause && !audioMasterClockActive) {
					videoRef.current?.pause();
				}
				setPlaybackRequested(false);
				previewScrubActiveRef.current = true;
				setIsPlaying(false);
			}
			pendingVideoFollowerSeekSecondsRef.current =
				clampedPlayheadUs / 1_000_000;

			updateSelectionLoopEntryFromPlayhead(clampedPlayheadUs);
			setPlayheadUs(clampedPlayheadUs);
		},
		[
			audioMasterClockActive,
			setPlaybackRequested,
			durationUs,
			isPlaying,
			previewAudioEngineRef,
			setPlayheadUs,
			updateSelectionLoopEntryFromPlayhead,
			videoRef,
		],
	);

	const seekByUs = useCallback(
		(deltaUs: MediaTimeUs) => {
			seekToUs(playheadRef.current + deltaUs);
		},
		[seekToUs],
	);

	const stepFrame = useCallback(
		(direction: -1 | 1) => {
			playbackStartRequestIdRef.current += 1;
			playbackStartPendingRef.current = false;
			previewAudioEngineRef.current?.pause();
			if (!audioMasterClockActive) videoRef.current?.pause();
			setPlaybackRequested(false);
			setIsPlaying(false);
			seekByUs(direction * frameDurationUs);
		},
		[
			audioMasterClockActive,
			frameDurationUs,
			previewAudioEngineRef,
			seekByUs,
			setPlaybackRequested,
			videoRef,
		],
	);

	const startPlayback = useCallback(
		async (recover = false) => {
			const video = videoRef.current;
			if (!video || previewClockMode === "audio-master-pending") return;
			const engine = previewAudioEngineRef.current;
			if (audioMasterClockActive && engine?.getPlaybackState() === "closed")
				return;
			const requestId = ++playbackStartRequestIdRef.current;
			playbackStartPendingRef.current = true;
			setPlaybackRequested(true);
			try {
				if (audioMasterClockActive && engine) {
					video.muted = true;
					if (!recover) {
						const start = resolveAudioMasterPlaybackStartSeconds({
							durationUs,
							pendingSeekSeconds: pendingVideoFollowerSeekSecondsRef.current,
							playheadUs: playheadRef.current,
							video,
						});
						renderingPlayheadRef.current = secondsToMicroseconds(start);
						engine.setPlaybackEnd(
							selectionLoopEnabled && start < selection.endUs / 1_000_000
								? selection.endUs / 1_000_000
								: null,
						);
						void engine.setTime(start);
					}
					previewScrubActiveRef.current = false;
					// Call in the user gesture; the engine owns resume and bounded preparation.
					await engine.play();
					return;
				}
				if (previewScrubActiveRef.current)
					setVideoFollowerTime(video, playheadRef.current);
				previewScrubActiveRef.current = false;
				renderingPlayheadRef.current = secondsToMicroseconds(video.currentTime);
				await video.play();
				if (requestId === playbackStartRequestIdRef.current) setIsPlaying(true);
			} catch {
				if (requestId !== playbackStartRequestIdRef.current) return;
				engine?.pause();
				video.pause();
				setPlaybackRequested(false);
				setIsPlaying(false);
			} finally {
				if (requestId === playbackStartRequestIdRef.current)
					playbackStartPendingRef.current = false;
			}
		},
		[
			audioMasterClockActive,
			durationUs,
			previewAudioEngineRef,
			previewClockMode,
			selection.endUs,
			selectionLoopEnabled,
			setPlaybackRequested,
			videoRef,
		],
	);

	const togglePlayback = useCallback(async () => {
		if (playbackRequestedRef.current || isPlaying) {
			playbackStartRequestIdRef.current += 1;
			playbackStartPendingRef.current = false;
			setPlaybackRequested(false);
			previewAudioEngineRef.current?.pause();
			if (!audioMasterClockActive) videoRef.current?.pause();
			setIsPlaying(false);
			return;
		}
		await startPlayback();
	}, [
		audioMasterClockActive,
		isPlaying,
		previewAudioEngineRef,
		setPlaybackRequested,
		startPlayback,
		videoRef,
	]);
	const recoverAudio = useCallback(() => startPlayback(true), [startPlayback]);

	const setPreviewPlaybackRate = useCallback(
		(nextPlaybackRate: number) => {
			const video = videoRef.current;

			if (video) {
				video.playbackRate = nextPlaybackRate;
			}

			previewAudioEngineRef.current?.setPlaybackRate(nextPlaybackRate);
			playbackRateRef.current = nextPlaybackRate;
			setPlaybackRate(nextPlaybackRate);
		},
		[previewAudioEngineRef, videoRef],
	);

	const setPreviewVolume = useCallback(
		(nextVolume: number) => {
			const video = videoRef.current;

			if (video) {
				video.volume = nextVolume;
			}

			setVolume(nextVolume);
		},
		[videoRef],
	);

	const toggleMuted = useCallback(() => {
		const nextMuted = !muted;
		const video = videoRef.current;

		if (video) {
			video.muted = !nativeVideoClockActive || nextMuted;
		}

		setMuted(nextMuted);
	}, [muted, nativeVideoClockActive, videoRef]);

	useEffect(() => {
		const video = videoRef.current;

		if (!video) {
			return;
		}

		video.muted = !nativeVideoClockActive || muted;
	}, [muted, nativeVideoClockActive, videoRef]);

	useEffect(() => {
		const engine = previewAudioEngineRef.current;
		const video = videoRef.current;
		if (!source || !audioMasterClockActive || !engine || !video) {
			setAudioPlaybackState("paused");
			return;
		}
		let disposed = false;
		let followerRequest = 0;
		let following = false;
		function syncAudioPlayback() {
			if (disposed || !engine || !video) return;
			const state = engine.getPlaybackState();
			setAudioPlaybackState(state);
			if (state !== "playing") {
				followerRequest++;
				if (following || state !== "paused") video.pause();
				following = false;
				setIsPlaying(false);
				if (state === "closed") setPlaybackRequested(false);
				if (state !== "paused" && !previewScrubActiveRef.current) {
					const time = secondsToMicroseconds(engine.getCurrentTime());
					const loop = selectionLoopConfigRef.current;
					if (
						loop.enabled &&
						hasPlaybackEnteredSelection({
							previousPlayheadUs: renderingPlayheadRef.current,
							currentPlayheadUs: time,
							selection: loop.selection,
						})
					)
						selectionLoopEnteredRef.current = true;
					renderingPlayheadRef.current = time;
					setVideoFollowerTime(video, time);
					setPlayheadUs(time);
				}
				return;
			}
			if (!playbackRequestedRef.current || following) return;
			following = true;
			const request = ++followerRequest;
			video.muted = true;
			setVideoFollowerTime(
				video,
				secondsToMicroseconds(engine.getPresentationTime()),
			);
			void video
				.play()
				.then(() => {
					if (disposed) return;
					if (request !== followerRequest) {
						if (!following) video.pause();
						return;
					}
					setIsPlaying(true);
				})
				.catch(() => {
					if (disposed || request !== followerRequest) return;
					engine.pause();
					setPlaybackRequested(false);
					setIsPlaying(false);
				});
		}
		const unsubscribe = engine.subscribe(syncAudioPlayback);
		syncAudioPlayback();
		return () => {
			disposed = true;
			following = false;
			followerRequest++;
			unsubscribe();
			engine.pause();
			video.pause();
		};
	}, [
		audioMasterClockActive,
		previewAudioEngineRef,
		setPlaybackRequested,
		setPlayheadUs,
		source,
		videoRef,
	]);

	const toggleSelectionLoop = useCallback(() => {
		setSelectionLoopEnabled((currentSelectionLoopEnabled) => {
			const nextSelectionLoopEnabled = !currentSelectionLoopEnabled;
			selectionLoopEnteredRef.current =
				nextSelectionLoopEnabled &&
				isMediaTimeInsideSelection(playheadRef.current, selection);

			return nextSelectionLoopEnabled;
		});
	}, [selection]);

	const syncPlayheadWithNativeVideo = useCallback(
		(options?: PreviewSyncOptions) => {
			if (previewScrubActiveRef.current) {
				return;
			}

			const video = videoRef.current;

			if (!video) {
				return;
			}

			const previousPlayheadUs = playheadRef.current;

			if (
				audioMasterClockActive &&
				!isPlaying &&
				!playbackRequestedRef.current &&
				audioPlaybackState !== "closed"
			) {
				const pendingVideoFollowerSeekSeconds =
					pendingVideoFollowerSeekSecondsRef.current;
				const nextPlayheadUs =
					pendingVideoFollowerSeekSeconds === null
						? finiteVideoPlayheadUs(video, previousPlayheadUs)
						: secondsToMicroseconds(pendingVideoFollowerSeekSeconds);

				if (
					pendingVideoFollowerSeekSeconds !== null &&
					videoFollowerSeekHasSettled({
						frameDurationUs,
						pendingSeekSeconds: pendingVideoFollowerSeekSeconds,
						videoTimeSeconds: video.currentTime,
					})
				) {
					pendingVideoFollowerSeekSecondsRef.current = null;
				} else if (pendingVideoFollowerSeekSeconds !== null) {
					setVideoFollowerTime(video, nextPlayheadUs);
				}

				renderingPlayheadRef.current = nextPlayheadUs;
				updateSelectionLoopEntryFromPlayhead(nextPlayheadUs);
				setPlayheadUs(nextPlayheadUs);
				return;
			}

			const engine = audioMasterClockActive
				? previewAudioEngineRef.current
				: null;
			// Presentation drives both visual consumers. Rendering still owns source
			// clipping, loop entry/wrap and media end, so output delay cannot stop PCM early.
			const transportTimeSeconds =
				engine?.getPresentationTime() ?? video.currentTime;
			const renderingPlayheadUs = secondsToMicroseconds(
				engine?.getCurrentTime() ?? video.currentTime,
			);
			const previousRenderingPlayheadUs = renderingPlayheadRef.current;
			renderingPlayheadRef.current = renderingPlayheadUs;
			const nativePlayheadUs = secondsToMicroseconds(transportTimeSeconds);
			const hardResyncThresholdSeconds =
				previewAvHardResyncThresholdSeconds(frameDurationUs);
			const pendingVideoFollowerSeekSeconds =
				pendingVideoFollowerSeekSecondsRef.current;

			if (
				pendingVideoFollowerSeekSeconds !== null &&
				videoFollowerSeekHasSettled({
					frameDurationUs,
					pendingSeekSeconds: pendingVideoFollowerSeekSeconds,
					videoTimeSeconds: video.currentTime,
				})
			) {
				pendingVideoFollowerSeekSecondsRef.current = null;
			}

			if (
				audioMasterClockActive &&
				Number.isFinite(transportTimeSeconds) &&
				Math.abs(video.currentTime - transportTimeSeconds) >
					hardResyncThresholdSeconds &&
				!shouldDeferVideoFollowerResyncForPendingSeek({
					hardResyncThresholdSeconds,
					pendingSeekSeconds: pendingVideoFollowerSeekSecondsRef.current,
					transportTimeSeconds,
					videoSeeking: videoFollowerIsSeeking(video),
				})
			) {
				video.currentTime = transportTimeSeconds;
				pendingVideoFollowerSeekSecondsRef.current = transportTimeSeconds;
			}

			if (!isPlaying) {
				updateSelectionLoopEntryFromPlayhead(nativePlayheadUs);
				setPlayheadUs(nativePlayheadUs);
				return;
			}

			if (
				selectionLoopEnabled &&
				shouldLoopSelectionPlayback({
					currentPlayheadUs: renderingPlayheadUs,
					previousPlayheadUs: previousRenderingPlayheadUs,
					selection,
					selectionEntered: selectionLoopEnteredRef.current,
				})
			) {
				selectionLoopEnteredRef.current = true;
				setPreviewTransportTime(selection.startUs);
				setPlayheadUs(selection.startUs);
				return;
			}

			if (
				selectionLoopEnabled &&
				hasPlaybackEnteredSelection({
					currentPlayheadUs: renderingPlayheadUs,
					previousPlayheadUs: previousRenderingPlayheadUs,
					selection,
				})
			) {
				selectionLoopEnteredRef.current = true;
			}

			if (audioMasterClockActive && renderingPlayheadUs >= durationUs) {
				// Media end supersedes any still-pending follower seek from a loop.
				pendingVideoFollowerSeekSecondsRef.current = durationUs / 1_000_000;
				previewAudioEngineRef.current?.pause();
				setPlaybackRequested(false);
				setVideoFollowerTime(video, durationUs);
				setPlayheadUs(durationUs);
				setIsPlaying(false);
				return;
			}

			setPlayheadUs(nativePlayheadUs, {
				kind: "throttled",
				timestampMs: options?.timestampMs ?? browserNowMs(),
			});
		},
		[
			audioPlaybackState,
			setPlaybackRequested,
			audioMasterClockActive,
			durationUs,
			frameDurationUs,
			isPlaying,
			previewAudioEngineRef,
			selection,
			selectionLoopEnabled,
			setPlayheadUs,
			setPreviewTransportTime,
			updateSelectionLoopEntryFromPlayhead,
			videoRef,
		],
	);

	useEffect(() => {
		const engine = audioMasterClockActive
			? previewAudioEngineRef.current
			: null;
		const loopTimeUs =
			engine?.getPlaybackState() === "playing"
				? secondsToMicroseconds(engine.getCurrentTime())
				: playheadRef.current;
		selectionLoopEnteredRef.current =
			selectionLoopEnabled && isMediaTimeInsideSelection(loopTimeUs, selection);
		if (audioMasterClockActive) {
			previewAudioEngineRef.current?.setPlaybackEnd(
				selectionLoopEnabled && loopTimeUs < selection.endUs
					? selection.endUs / 1_000_000
					: null,
			);
		}
	}, [
		audioMasterClockActive,
		previewAudioEngineRef,
		selection,
		selectionLoopEnabled,
	]);

	useEffect(() => {
		if (!isPlaying) {
			if (playheadAnimationFrameRef.current !== null) {
				cancelBrowserFrame(playheadAnimationFrameRef.current);
				playheadAnimationFrameRef.current = null;
			}
			return;
		}

		let cancelled = false;

		function syncOnAnimationFrame(timestampMs: number) {
			if (cancelled) {
				return;
			}

			syncPlayheadWithNativeVideo({ timestampMs });
			playheadAnimationFrameRef.current =
				requestBrowserFrame(syncOnAnimationFrame);
		}

		playheadAnimationFrameRef.current =
			requestBrowserFrame(syncOnAnimationFrame);

		return () => {
			cancelled = true;

			if (playheadAnimationFrameRef.current !== null) {
				cancelBrowserFrame(playheadAnimationFrameRef.current);
				playheadAnimationFrameRef.current = null;
			}
		};
	}, [isPlaying, syncPlayheadWithNativeVideo]);

	const handleEnded = useCallback(() => {
		if (!nativeVideoClockActive) {
			return;
		}

		const video = videoRef.current;

		if (
			video &&
			selectionLoopEnabled &&
			selectionLoopEnteredRef.current &&
			selection.endUs >= durationUs
		) {
			setPreviewTransportTime(selection.startUs);
			setPlayheadUs(selection.startUs);
			setIsPlaying(true);
			void video.play().catch(() => {
				setPlaybackRequested(false);
				setIsPlaying(false);
			});
			return;
		}

		previewAudioEngineRef.current?.pause();
		setPlaybackRequested(false);
		setIsPlaying(false);
		setPlayheadUs(durationUs);
	}, [
		setPlaybackRequested,
		durationUs,
		previewAudioEngineRef,
		nativeVideoClockActive,
		selection.endUs,
		selection.startUs,
		selectionLoopEnabled,
		setPlayheadUs,
		setPreviewTransportTime,
		videoRef,
	]);

	const handleNativePause = useCallback(() => {
		if (!nativeVideoClockActive) {
			return;
		}

		previewAudioEngineRef.current?.pause();
		setPlaybackRequested(false);
		setIsPlaying(false);
	}, [previewAudioEngineRef, nativeVideoClockActive, setPlaybackRequested]);

	const handleNativePlay = useCallback(() => {
		if (!nativeVideoClockActive) {
			if (previewAudioEngineRef.current?.getPlaybackState() !== "playing")
				videoRef.current?.pause();
			return;
		}

		setPlaybackRequested(true);
		setIsPlaying(true);
	}, [
		nativeVideoClockActive,
		previewAudioEngineRef,
		setPlaybackRequested,
		videoRef,
	]);

	return {
		getPlaybackRate,
		getPlayheadUs,
		handleEnded,
		handleNativePause,
		handleNativePlay,
		isPlaying,
		playbackRequested,
		audioPlaybackState,
		recoverAudio,
		muted,
		playbackRate,
		previewClockMode,
		playheadUs,
		previewScrubToUs,
		seekByUs,
		seekToUs,
		selectionLoopEnabled,
		setPreviewPlaybackRate,
		setPreviewVolume,
		stepFrame,
		syncPlayheadWithNativeVideo,
		toggleMuted,
		togglePlayback,
		toggleSelectionLoop,
		volume,
	};
}

function shouldLoopSelectionPlayback({
	currentPlayheadUs,
	previousPlayheadUs,
	selection,
	selectionEntered,
}: {
	currentPlayheadUs: MediaTimeUs;
	previousPlayheadUs: MediaTimeUs;
	selection: Selection;
	selectionEntered: boolean;
}): boolean {
	const enteredSelection =
		selectionEntered ||
		hasPlaybackEnteredSelection({
			currentPlayheadUs,
			previousPlayheadUs,
			selection,
		});

	return enteredSelection && currentPlayheadUs >= selection.endUs;
}

function hasPlaybackEnteredSelection({
	currentPlayheadUs,
	previousPlayheadUs,
	selection,
}: {
	currentPlayheadUs: MediaTimeUs;
	previousPlayheadUs: MediaTimeUs;
	selection: Selection;
}): boolean {
	return (
		isMediaTimeInsideSelection(currentPlayheadUs, selection) ||
		(previousPlayheadUs < selection.startUs &&
			currentPlayheadUs >= selection.startUs)
	);
}

function isMediaTimeInsideSelection(
	playheadUs: MediaTimeUs,
	selection: Selection,
): boolean {
	return playheadUs >= selection.startUs && playheadUs < selection.endUs;
}

function secondsToMicroseconds(seconds: number): MediaTimeUs {
	return Math.round(seconds * 1_000_000);
}

function previewAvHardResyncThresholdSeconds(frameDurationUs: MediaTimeUs) {
	const frameDurationSeconds = Math.max(0, frameDurationUs) / 1_000_000;

	return Math.max(
		PREVIEW_AV_HARD_RESYNC_MIN_THRESHOLD_SECONDS,
		frameDurationSeconds * PREVIEW_AV_HARD_RESYNC_FRAME_TOLERANCE,
	);
}

function previewFollowerSeekSettledThresholdSeconds(
	frameDurationUs: MediaTimeUs,
) {
	return Math.max(0.02, Math.max(0, frameDurationUs) / 1_000_000);
}

function videoFollowerSeekHasSettled({
	frameDurationUs,
	pendingSeekSeconds,
	videoTimeSeconds,
}: {
	frameDurationUs: MediaTimeUs;
	pendingSeekSeconds: number;
	videoTimeSeconds: number;
}) {
	return (
		Math.abs(videoTimeSeconds - pendingSeekSeconds) <=
		previewFollowerSeekSettledThresholdSeconds(frameDurationUs)
	);
}

function shouldDeferVideoFollowerResyncForPendingSeek({
	hardResyncThresholdSeconds,
	pendingSeekSeconds,
	transportTimeSeconds,
	videoSeeking,
}: {
	hardResyncThresholdSeconds: number;
	pendingSeekSeconds: number | null;
	transportTimeSeconds: number;
	videoSeeking: boolean;
}) {
	if (pendingSeekSeconds !== null && videoSeeking) {
		return true;
	}

	return (
		pendingSeekSeconds !== null &&
		Math.abs(transportTimeSeconds - pendingSeekSeconds) <=
			hardResyncThresholdSeconds
	);
}

function videoFollowerIsSeeking(video: unknown) {
	return (
		typeof video === "object" &&
		video !== null &&
		"seeking" in video &&
		(video as { seeking?: unknown }).seeking === true
	);
}

function resolveAudioMasterPlaybackStartSeconds({
	durationUs,
	pendingSeekSeconds,
	playheadUs,
	video,
}: {
	durationUs: MediaTimeUs;
	pendingSeekSeconds: number | null;
	playheadUs: MediaTimeUs;
	video: { currentTime: number };
}) {
	if (pendingSeekSeconds !== null && Number.isFinite(pendingSeekSeconds)) {
		return (
			clamp(secondsToMicroseconds(pendingSeekSeconds), 0, durationUs) /
			1_000_000
		);
	}

	if (Number.isFinite(video.currentTime)) {
		return (
			clamp(secondsToMicroseconds(video.currentTime), 0, durationUs) / 1_000_000
		);
	}

	return clamp(playheadUs, 0, durationUs) / 1_000_000;
}

function finiteVideoPlayheadUs(
	video: { currentTime: number },
	fallbackPlayheadUs: MediaTimeUs,
) {
	return Number.isFinite(video.currentTime)
		? secondsToMicroseconds(video.currentTime)
		: fallbackPlayheadUs;
}

function setVideoFollowerTime(
	video: { currentTime: number },
	playheadUs: MediaTimeUs,
): boolean {
	if (secondsToMicroseconds(video.currentTime) === playheadUs) {
		return false;
	}

	video.currentTime = playheadUs / 1_000_000;
	return true;
}
