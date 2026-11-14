import {
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import type { MediaTimeUs, Selection } from "@/editor-core/model";
import {
	browserNowMs,
	cancelBrowserFrame,
	requestBrowserFrame,
} from "@/lib/browser-animation-frame";
import { clamp } from "@/lib/clamp";
import type {
	PreviewAudioEngine,
	PreviewAudioPlaybackState,
} from "../../audio/types/preview-audio-engine.types";
import type { ScrubPreviewTransport } from "../scrub/use-scrub-preview";
import type { PreviewClockMode } from "./preview-clock-mode";
import { createSelectionLoop } from "./selection-loop";

const PREVIEW_AV_HARD_RESYNC_MIN_THRESHOLD_SECONDS = 0.25;
const PREVIEW_AV_HARD_RESYNC_FRAME_TOLERANCE = 2;
const PREVIEW_PLAYHEAD_UI_COMMIT_INTERVAL_MS = 50;
const PREVIEW_PLAYHEAD_UI_COMMIT_JUMP_US = 50_000;

export type PreviewMediaTransportHandle = {
	currentTime: number;
	readonly ended: boolean;
	readonly paused: boolean;
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
	msePreview?: boolean;
	scrubPreview?: ScrubPreviewTransport;
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

type PlaybackRequest = { origin: "command" | "native" };

type PreviewPlayback =
	| { phase: "paused"; request: null }
	| {
			phase: "starting" | "playing" | "resuming";
			request: PlaybackRequest;
	  };

const PAUSED_PLAYBACK: PreviewPlayback = { phase: "paused", request: null };

export function useNativePreviewTransport({
	durationUs,
	frameDurationUs,
	previewAudioEngineRef,
	previewClockMode,
	msePreview = false,
	scrubPreview,
	selection,
	source,
	videoRef,
}: UseNativePreviewTransportOptions) {
	const capturePlaybackHandoff = scrubPreview?.capturePlaybackHandoff;
	const hasScrubTarget = scrubPreview?.hasTarget;
	const onNativeSeekRequested = scrubPreview?.onNativeSeekRequested;
	const playheadRef = useRef<MediaTimeUs>(0);
	const playbackRateRef = useRef(1);
	const playbackRef = useRef<PreviewPlayback>(PAUSED_PLAYBACK);
	const [playbackPhase, setPlaybackPhase] =
		useState<PreviewPlayback["phase"]>("paused");
	const playbackRequested = playbackPhase !== "paused";
	const isPlaying = playbackPhase === "playing";
	const setPlayback = useCallback((next: PreviewPlayback) => {
		playbackRef.current = next;
		setPlaybackPhase(next.phase);
	}, []);
	const [audioPlaybackState, setAudioPlaybackState] =
		useState<PreviewAudioPlaybackState>("paused");
	const previewScrubActiveRef = useRef(false);
	const playheadAnimationFrameRef = useRef<number | null>(null);
	const playheadStateCommitTimestampRef = useRef<number | null>(null);
	const playheadStateRef = useRef<MediaTimeUs>(0);
	const pendingVideoFollowerSeekSecondsRef = useRef<number | null>(null);
	const pausedAudioEngineRef = useRef<PreviewAudioEngine | null>(null);
	const [selectionLoop] = useState(() => createSelectionLoop(selection));
	const [muted, setMuted] = useState(false);
	const [playbackRate, setPlaybackRate] = useState(1);
	const [playheadUs, setPlayheadUsState] = useState<MediaTimeUs>(0);
	const [selectionLoopEnabled, setSelectionLoopEnabled] = useState(false);
	const [volume, setVolume] = useState(1);

	const getPlaybackRate = useCallback(() => playbackRateRef.current, []);
	const getPlayheadUs = useCallback(() => playheadRef.current, []);
	const audioMasterClockActive = previewClockMode === "audio-master";
	const nativeVideoClockActive = previewClockMode === "native-video";

	useEffect(() => {
		if (!source) {
			return;
		}

		playheadRef.current = 0;
		playheadStateRef.current = 0;
		playheadStateCommitTimestampRef.current = null;
		pendingVideoFollowerSeekSecondsRef.current = null;
		pausedAudioEngineRef.current = null;
		setPlayback(PAUSED_PLAYBACK);
		previewScrubActiveRef.current = false;
		selectionLoop.setEnabled(false, 0);
		setPlayheadUsState(0);
		setSelectionLoopEnabled(false);
		const video = videoRef.current;
		return () => {
			playbackRef.current = PAUSED_PLAYBACK;
			pauseVideo(video);
		};
	}, [source, selectionLoop, setPlayback, videoRef]);

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

	const syncAudioLoopEnd = useCallback(() => {
		if (!audioMasterClockActive) return;
		const endUs = selectionLoop.getPlaybackEndUs();
		previewAudioEngineRef.current?.setPlaybackEnd(
			endUs === null ? null : endUs / 1_000_000,
		);
	}, [audioMasterClockActive, previewAudioEngineRef, selectionLoop]);

	const setPreviewTransportTime = useCallback(
		(nextPlayheadUs: MediaTimeUs) => {
			selectionLoop.reposition(nextPlayheadUs);
			const nextTimeSeconds = nextPlayheadUs / 1_000_000;
			const video = videoRef.current;

			if (video) {
				onNativeSeekRequested?.(nextPlayheadUs);
				pendingVideoFollowerSeekSecondsRef.current = setVideoFollowerTime(
					video,
					nextPlayheadUs,
				)
					? nextTimeSeconds
					: null;
			}

			if (audioMasterClockActive) {
				syncAudioLoopEnd();
				void previewAudioEngineRef.current?.setTime(nextTimeSeconds);
			}
		},
		[
			audioMasterClockActive,
			onNativeSeekRequested,
			previewAudioEngineRef,
			selectionLoop,
			syncAudioLoopEnd,
			videoRef,
		],
	);

	const wrapSelectionLoopAt = useCallback(
		(playbackTimeUs: MediaTimeUs) => {
			const startUs = selectionLoop.advancePlayback(playbackTimeUs);
			if (startUs === null) return false;
			setPreviewTransportTime(startUs);
			setPlayheadUs(startUs);
			return true;
		},
		[selectionLoop, setPlayheadUs, setPreviewTransportTime],
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
			setPlayheadUs(clampedPlayheadUs);
		},
		[durationUs, setPlayheadUs, setPreviewTransportTime],
	);

	const pausePlayback = useCallback(() => {
		setPlayback(PAUSED_PLAYBACK);
		pauseVideo(videoRef.current);
		previewAudioEngineRef.current?.pause();
	}, [previewAudioEngineRef, setPlayback, videoRef]);

	const previewScrubToUs = useCallback(
		(nextPlayheadUs: MediaTimeUs) => {
			const clampedPlayheadUs = clamp(
				Math.round(nextPlayheadUs),
				0,
				durationUs,
			);

			if (!previewScrubActiveRef.current) {
				previewScrubActiveRef.current = true;
				pausedAudioEngineRef.current = null;
				pausePlayback();
			}
			pendingVideoFollowerSeekSecondsRef.current =
				clampedPlayheadUs / 1_000_000;

			selectionLoop.reposition(clampedPlayheadUs);
			setPlayheadUs(clampedPlayheadUs);
		},
		[durationUs, pausePlayback, selectionLoop, setPlayheadUs],
	);

	const seekWithScrubPreview = useCallback(
		(nextPlayheadUs: MediaTimeUs) => {
			if (audioMasterClockActive && playbackRef.current.phase === "resuming") {
				seekToUs(nextPlayheadUs);
			} else {
				previewScrubToUs(nextPlayheadUs);
			}
		},
		[audioMasterClockActive, previewScrubToUs, seekToUs],
	);

	const seekByUs = useCallback(
		(deltaUs: MediaTimeUs) => {
			seekToUs(playheadRef.current + deltaUs);
		},
		[seekToUs],
	);

	const stepFrame = useCallback(
		(direction: -1 | 1) => {
			pausePlayback();
			seekByUs(direction * frameDurationUs);
		},
		[frameDurationUs, pausePlayback, seekByUs],
	);

	const startPlayback = useCallback(
		async (recover = false) => {
			const video = videoRef.current;
			if (!video || previewClockMode === "audio-master-pending") return;
			const engine = previewAudioEngineRef.current;
			if (audioMasterClockActive && !engine) return;
			const audioState = audioMasterClockActive
				? engine?.getPlaybackState()
				: undefined;
			if (audioState === "closed") return;
			if (
				recover &&
				(!playbackRef.current.request ||
					(audioState !== "interrupted" &&
						audioState !== "resuming" &&
						audioState !== "recovery-required"))
			)
				return;
			const pausedAudioEngine = pausedAudioEngineRef.current;
			pausedAudioEngineRef.current = null;
			const request: PlaybackRequest = { origin: "command" };
			setPlayback({
				phase:
					recover && playbackRef.current.phase === "resuming"
						? "resuming"
						: "starting",
				request,
			});
			try {
				if (audioMasterClockActive && engine) {
					video.muted = true;
					if (!recover) {
						const pendingSeekSeconds =
							pendingVideoFollowerSeekSecondsRef.current;
						const resumingPausedWindow =
							pausedAudioEngine === engine && pendingSeekSeconds === null;
						const start = resolveAudioMasterPlaybackStartSeconds({
							durationUs,
							pendingSeekSeconds,
							playheadUs: playheadRef.current,
							currentTime: resumingPausedWindow
								? engine.getCurrentTime()
								: video.currentTime,
						});
						selectionLoop.reposition(secondsToMicroseconds(start));
						syncAudioLoopEnd();
						if (!resumingPausedWindow) void engine.setTime(start);
					}
					previewScrubActiveRef.current = false;
					// Call in the user gesture; the engine owns resume and bounded preparation.
					await engine.play();
					return;
				}
				if (previewScrubActiveRef.current || hasScrubTarget?.()) {
					const targetUs = playheadRef.current;
					onNativeSeekRequested?.(targetUs);
					setVideoFollowerTime(video, targetUs);
				}
				previewScrubActiveRef.current = false;
				selectionLoop.reposition(secondsToMicroseconds(video.currentTime));
				const completeHandoff = capturePlaybackHandoff?.();
				await video.play();
				if (videoRef.current !== video) return;
				if (playbackRef.current.request !== request) {
					if (!playbackRef.current.request) pauseVideo(video);
					return;
				}
				if (video.ended) return;
				if (video.paused) {
					pausePlayback();
					return;
				}
				completeHandoff?.();
				setPlayback({ phase: "playing", request });
			} catch {
				if (
					playbackRef.current.request === request &&
					videoRef.current === video
				)
					pausePlayback();
			}
		},
		[
			audioMasterClockActive,
			capturePlaybackHandoff,
			durationUs,
			hasScrubTarget,
			onNativeSeekRequested,
			previewAudioEngineRef,
			previewClockMode,
			selectionLoop,
			pausePlayback,
			setPlayback,
			syncAudioLoopEnd,
			videoRef,
		],
	);

	const togglePlayback = useCallback(async () => {
		if (playbackRef.current.request) {
			pausedAudioEngineRef.current = audioMasterClockActive
				? previewAudioEngineRef.current
				: null;
			pausePlayback();
			return;
		}
		await startPlayback();
	}, [
		audioMasterClockActive,
		pausePlayback,
		previewAudioEngineRef,
		startPlayback,
	]);

	const recoverAudio = useCallback(() => startPlayback(true), [startPlayback]);

	const setPreviewPlaybackRate = useCallback(
		(nextPlaybackRate: number) => {
			const video = videoRef.current;

			if (video) {
				video.playbackRate = nextPlaybackRate;
			}

			void previewAudioEngineRef.current?.setPlaybackRate(nextPlaybackRate);
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
		let followerStart: { request: PlaybackRequest } | null = null;
		function syncAudioPlayback() {
			if (disposed || !engine || !video) return;
			const state = engine.getPlaybackState();
			setAudioPlaybackState(state);
			const { phase, request } = playbackRef.current;

			if (!request) {
				followerStart = null;
				pauseVideo(video);
				if (state === "playing") engine.pause();
				return;
			}

			if (state !== "playing") {
				const audioHadStarted = followerStart?.request === request;
				followerStart = null;
				pauseVideo(video);
				if (state === "closed") setPlayback(PAUSED_PLAYBACK);
				else if (phase === "playing" || audioHadStarted)
					setPlayback({ phase: "resuming", request });
				if (
					state !== "paused" &&
					!previewScrubActiveRef.current &&
					!hasScrubTarget?.()
				) {
					const time = secondsToMicroseconds(engine.getCurrentTime());
					setVideoFollowerTime(video, time);
					setPlayheadUs(time);
				}
				return;
			}

			if (followerStart?.request === request) return;
			const start = { request };
			followerStart = start;
			video.muted = true;
			const followerTimeUs = secondsToMicroseconds(
				engine.getPresentationTime(),
			);
			onNativeSeekRequested?.(followerTimeUs);
			setVideoFollowerTime(video, followerTimeUs);
			const completeHandoff = capturePlaybackHandoff?.();
			const ownsStart = () =>
				!disposed &&
				videoRef.current === video &&
				playbackRef.current.request === request &&
				engine.getPlaybackState() === "playing" &&
				followerStart === start;
			void video
				.play()
				.then(() => {
					if (!ownsStart()) {
						if (!disposed && videoRef.current === video && !followerStart)
							pauseVideo(video);
						return;
					}
					if (video.paused) {
						pausePlayback();
						return;
					}
					completeHandoff?.();
					setPlayback({ phase: "playing", request });
				})
				.catch(() => {
					if (ownsStart()) pausePlayback();
				});
		}
		const unsubscribe = engine.subscribe(syncAudioPlayback);
		syncAudioPlayback();
		return () => {
			disposed = true;
			followerStart = null;
			unsubscribe();
			engine.pause();
			pauseVideo(video);
		};
	}, [
		audioMasterClockActive,
		capturePlaybackHandoff,
		hasScrubTarget,
		onNativeSeekRequested,
		pausePlayback,
		previewAudioEngineRef,
		setPlayback,
		setPlayheadUs,
		source,
		videoRef,
	]);

	const readLoopPositionUs = useCallback(() => {
		const playheadUs = playheadRef.current;
		if (
			!playbackRef.current.request ||
			previewScrubActiveRef.current ||
			hasScrubTarget?.()
		) {
			return playheadUs;
		}

		const engine = audioMasterClockActive
			? previewAudioEngineRef.current
			: null;
		if (engine) return secondsToMicroseconds(engine.getCurrentTime());
		const video = videoRef.current;
		return video ? finiteVideoPlayheadUs(video, playheadUs) : playheadUs;
	}, [audioMasterClockActive, hasScrubTarget, previewAudioEngineRef, videoRef]);

	const toggleSelectionLoop = useCallback(() => {
		const enabled = !selectionLoop.enabled;
		selectionLoop.setEnabled(enabled, readLoopPositionUs());
		setSelectionLoopEnabled(enabled);
		syncAudioLoopEnd();
	}, [readLoopPositionUs, selectionLoop, syncAudioLoopEnd]);

	const syncPlayheadWithNativeVideo = useCallback(
		(options?: PreviewSyncOptions) => {
			const video = videoRef.current;
			if (
				!video ||
				previewScrubActiveRef.current ||
				(nativeVideoClockActive && video.ended)
			)
				return;

			const engine = audioMasterClockActive
				? previewAudioEngineRef.current
				: null;
			const renderingPlaybackActive =
				playbackRef.current.request &&
				(engine ? engine.getPlaybackState() === "playing" : isPlaying);
			const scrubOwnsPlayhead = hasScrubTarget?.();
			if (scrubOwnsPlayhead && !(engine && renderingPlaybackActive)) return;

			const previousPlayheadUs = playheadRef.current;

			if (
				audioMasterClockActive &&
				!isPlaying &&
				!playbackRef.current.request &&
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

				selectionLoop.reposition(nextPlayheadUs);
				setPlayheadUs(nextPlayheadUs);
				return;
			}

			// Presentation drives both visual consumers. Rendering still owns source
			// clipping, loop entry/wrap and media end, so output delay cannot stop PCM early.
			const transportTimeSeconds =
				engine?.getPresentationTime() ?? video.currentTime;
			const renderingPlayheadUs = secondsToMicroseconds(
				engine?.getCurrentTime() ?? video.currentTime,
			);
			if (renderingPlaybackActive && wrapSelectionLoopAt(renderingPlayheadUs))
				return;

			if (
				renderingPlaybackActive &&
				audioMasterClockActive &&
				renderingPlayheadUs >= durationUs
			) {
				// Media end supersedes any still-pending follower seek from a loop.
				pendingVideoFollowerSeekSecondsRef.current = durationUs / 1_000_000;
				pausePlayback();
				setVideoFollowerTime(video, durationUs);
				setPlayheadUs(durationUs);
				return;
			}
			if (scrubOwnsPlayhead) return;

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
				(!msePreview || !video.seeking) &&
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
				if (!playbackRef.current.request)
					selectionLoop.reposition(nativePlayheadUs);
				setPlayheadUs(nativePlayheadUs);
				return;
			}

			setPlayheadUs(nativePlayheadUs, {
				kind: "throttled",
				timestampMs: options?.timestampMs ?? browserNowMs(),
			});
		},
		[
			audioPlaybackState,
			audioMasterClockActive,
			durationUs,
			frameDurationUs,
			hasScrubTarget,
			isPlaying,
			msePreview,
			nativeVideoClockActive,
			pausePlayback,
			previewAudioEngineRef,
			selectionLoop,
			setPlayheadUs,
			videoRef,
			wrapSelectionLoopAt,
		],
	);

	const { startUs: selectionStartUs, endUs: selectionEndUs } = selection;
	useEffect(() => {
		selectionLoop.setSelection(
			{ startUs: selectionStartUs, endUs: selectionEndUs },
			readLoopPositionUs(),
		);
		syncAudioLoopEnd();
	}, [
		readLoopPositionUs,
		selectionEndUs,
		selectionLoop,
		selectionStartUs,
		source,
		syncAudioLoopEnd,
	]);

	// Audio can reach the loop boundary before its muted follower starts.
	const playbackSamplingActive =
		isPlaying || (audioMasterClockActive && audioPlaybackState === "playing");

	useEffect(() => {
		if (!playbackSamplingActive) {
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
	}, [playbackSamplingActive, syncPlayheadWithNativeVideo]);

	const handleEnded = useCallback(() => {
		if (
			!nativeVideoClockActive ||
			!videoRef.current?.ended ||
			previewScrubActiveRef.current ||
			hasScrubTarget?.()
		) {
			return;
		}

		// Native video can emit ended between playback samples. The terminal
		// position can cross both Selection boundaries in one observation.
		if (playbackRef.current.request && wrapSelectionLoopAt(durationUs)) {
			void startPlayback();
			return;
		}

		pausePlayback();
		setPlayheadUs(durationUs);
	}, [
		durationUs,
		hasScrubTarget,
		nativeVideoClockActive,
		pausePlayback,
		setPlayheadUs,
		startPlayback,
		videoRef,
		wrapSelectionLoopAt,
	]);

	const handleNativePause = useCallback(() => {
		const video = videoRef.current;
		// A natural end fires pause before ended, which owns the wrap decision.
		if (!nativeVideoClockActive || !video?.paused || video.ended) return;
		const { phase, request } = playbackRef.current;
		// The owned play promise reports cancellation during a pending start.
		if (!request || (phase === "starting" && request.origin === "command"))
			return;
		pausePlayback();
	}, [nativeVideoClockActive, pausePlayback, videoRef]);

	const handleNativePlay = useCallback(() => {
		const video = videoRef.current;
		if (!video || video.paused || video.ended) return;
		if (!nativeVideoClockActive) {
			if (
				!playbackRef.current.request ||
				previewAudioEngineRef.current?.getPlaybackState() !== "playing"
			)
				pauseVideo(video);
			return;
		}
		if (previewScrubActiveRef.current) {
			pauseVideo(video);
			return;
		}
		if (!playbackRef.current.request)
			setPlayback({ phase: "starting", request: { origin: "native" } });
	}, [nativeVideoClockActive, previewAudioEngineRef, setPlayback, videoRef]);

	const handleNativePlaying = useCallback(() => {
		const video = videoRef.current;
		const { phase, request } = playbackRef.current;
		if (
			nativeVideoClockActive &&
			video &&
			!video.paused &&
			!video.ended &&
			phase === "starting" &&
			request?.origin === "native"
		) {
			setPlayback({ phase: "playing", request });
		}
	}, [nativeVideoClockActive, setPlayback, videoRef]);

	return {
		getPlaybackRate,
		getPlayheadUs,
		handleEnded,
		handleNativePause,
		handleNativePlay,
		handleNativePlaying,
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
		seekWithScrubPreview,
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

function pauseVideo(video: PreviewMediaTransportHandle | null) {
	if (video && !video.paused) void video.pause();
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
	currentTime,
	durationUs,
	pendingSeekSeconds,
	playheadUs,
}: {
	currentTime: number;
	durationUs: MediaTimeUs;
	pendingSeekSeconds: number | null;
	playheadUs: MediaTimeUs;
}) {
	if (pendingSeekSeconds !== null && Number.isFinite(pendingSeekSeconds)) {
		return (
			clamp(secondsToMicroseconds(pendingSeekSeconds), 0, durationUs) /
			1_000_000
		);
	}

	if (Number.isFinite(currentTime)) {
		return clamp(secondsToMicroseconds(currentTime), 0, durationUs) / 1_000_000;
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
