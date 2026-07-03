import { useCallback, useEffect, useRef, useState } from "react";

import type { MediaTimeUs, Selection } from "@/editor-core/model";

import { setPreviewAudioEnginePlaybackRate } from "./preview-audio-engine";
import type { UseNativePreviewTransportOptions } from "./use-native-preview-transport.types";

const PREVIEW_AV_HARD_RESYNC_MIN_THRESHOLD_SECONDS = 0.25;
const PREVIEW_AV_HARD_RESYNC_FRAME_TOLERANCE = 2;
const PREVIEW_PLAYHEAD_UI_COMMIT_INTERVAL_MS = 250;
const PREVIEW_PLAYHEAD_UI_COMMIT_JUMP_US = 250_000;

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
	const playbackRateRef = useRef(1);
	const playbackStartRequestIdRef = useRef(0);
	const playbackStartPendingRef = useRef(false);
	const previewAudioEnginePlaybackStartedRef = useRef(false);
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
		playbackStartRequestIdRef.current += 1;
		playbackStartPendingRef.current = false;
		previewAudioEnginePlaybackStartedRef.current = false;
		selectionLoopEnteredRef.current = false;
		setPlayheadUsState(0);
		setIsPlaying(false);
		setSelectionLoopEnabled(false);
	}, [source]);

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
				options.kind === "throttled" ? options.timestampMs : previewNowMs();
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
			const clampedPlayheadUs = clampMediaTime(
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
				previewAudioEngineRef.current?.setTime(nextTimeSeconds);
			}
		},
		[audioMasterClockActive, previewAudioEngineRef, videoRef],
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
			const clampedPlayheadUs = clampMediaTime(
				Math.round(nextPlayheadUs),
				0,
				durationUs,
			);

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
			videoRef.current?.pause();
			previewAudioEnginePlaybackStartedRef.current = false;
			setIsPlaying(false);
			seekByUs(direction * frameDurationUs);
		},
		[frameDurationUs, previewAudioEngineRef, seekByUs, videoRef],
	);

	const togglePlayback = useCallback(async () => {
		const video = videoRef.current;

		if (!video) {
			return;
		}

		if (isPlaying) {
			playbackStartRequestIdRef.current += 1;
			playbackStartPendingRef.current = false;
			previewAudioEngineRef.current?.pause();
			video.pause();
			previewAudioEnginePlaybackStartedRef.current = false;
			setIsPlaying(false);
			return;
		}

		if (previewClockMode === "audio-master-pending") {
			return;
		}

		if (playbackStartPendingRef.current) {
			return;
		}

		playbackStartRequestIdRef.current += 1;
		const playbackStartRequestId = playbackStartRequestIdRef.current;
		playbackStartPendingRef.current = true;

		function playbackStartIsCurrent() {
			return playbackStartRequestIdRef.current === playbackStartRequestId;
		}

		try {
			if (audioMasterClockActive) {
				const playheadSeconds = playheadRef.current / 1_000_000;

				video.muted = true;
				pendingVideoFollowerSeekSecondsRef.current = setVideoFollowerTime(
					video,
					playheadRef.current,
				)
					? playheadSeconds
					: null;
				await video.play();

				if (!playbackStartIsCurrent()) {
					return;
				}

				previewAudioEngineRef.current?.setTime(playheadSeconds);
				await previewAudioEngineRef.current?.play();

				if (!playbackStartIsCurrent()) {
					previewAudioEngineRef.current?.pause();
					previewAudioEnginePlaybackStartedRef.current = false;
					return;
				}

				previewAudioEnginePlaybackStartedRef.current = true;
				setIsPlaying(true);
				return;
			}

			await video.play();

			if (!playbackStartIsCurrent()) {
				return;
			}

			setIsPlaying(true);
		} catch {
			if (!playbackStartIsCurrent()) {
				return;
			}

			previewAudioEngineRef.current?.pause();
			previewAudioEnginePlaybackStartedRef.current = false;
			setIsPlaying(false);
		} finally {
			if (playbackStartIsCurrent()) {
				playbackStartPendingRef.current = false;
			}
		}
	}, [
		audioMasterClockActive,
		isPlaying,
		previewAudioEngineRef,
		previewClockMode,
		videoRef,
	]);

	const setPreviewPlaybackRate = useCallback(
		(nextPlaybackRate: number) => {
			const video = videoRef.current;

			if (video) {
				video.playbackRate = nextPlaybackRate;
			}

			setPreviewAudioEnginePlaybackRate(previewAudioEngineRef.current, nextPlaybackRate);
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
		if (!audioMasterClockActive || !isPlaying) {
			previewAudioEnginePlaybackStartedRef.current = false;
			return;
		}

		if (previewAudioEnginePlaybackStartedRef.current) {
			return;
		}

		const video = videoRef.current;
		if (video) {
			video.muted = true;
		}
		previewAudioEngineRef.current?.setTime(playheadRef.current / 1_000_000);
		previewAudioEngineRef.current?.play();
		previewAudioEnginePlaybackStartedRef.current = true;
	}, [audioMasterClockActive, isPlaying, previewAudioEngineRef, videoRef]);

	useEffect(() => {
		if (previewClockMode !== "audio-master-pending" || !isPlaying) {
			return;
		}

		previewAudioEngineRef.current?.pause();
		videoRef.current?.pause();
		previewAudioEnginePlaybackStartedRef.current = false;
		setIsPlaying(false);
	}, [isPlaying, previewAudioEngineRef, previewClockMode, videoRef]);

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
			const video = videoRef.current;

			if (!video) {
				return;
			}

			const previousPlayheadUs = playheadRef.current;

			if (audioMasterClockActive && !isPlaying) {
				pendingVideoFollowerSeekSecondsRef.current = setVideoFollowerTime(
					video,
					previousPlayheadUs,
				)
					? previousPlayheadUs / 1_000_000
					: null;
				updateSelectionLoopEntryFromPlayhead(previousPlayheadUs);
				setPlayheadUs(previousPlayheadUs);
				return;
			}

			const transportTimeSeconds =
				audioMasterClockActive && previewAudioEngineRef.current
					? previewAudioEngineRef.current.getCurrentTime()
					: video.currentTime;
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
					currentPlayheadUs: nativePlayheadUs,
					previousPlayheadUs,
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
					currentPlayheadUs: nativePlayheadUs,
					previousPlayheadUs,
					selection,
				})
			) {
				selectionLoopEnteredRef.current = true;
			}

			if (audioMasterClockActive && nativePlayheadUs >= durationUs) {
				previewAudioEngineRef.current?.pause();
				video.pause();
				previewAudioEnginePlaybackStartedRef.current = false;
				setVideoFollowerTime(video, durationUs);
				setPlayheadUs(durationUs);
				setIsPlaying(false);
				return;
			}

			setPlayheadUs(nativePlayheadUs, {
				kind: "throttled",
				timestampMs: options?.timestampMs ?? previewNowMs(),
			});
		},
		[
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
		selectionLoopEnteredRef.current =
			selectionLoopEnabled &&
			isMediaTimeInsideSelection(playheadRef.current, selection);
	}, [selection, selectionLoopEnabled]);

	useEffect(() => {
		if (!isPlaying) {
			if (playheadAnimationFrameRef.current !== null) {
				cancelPreviewFrame(playheadAnimationFrameRef.current);
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
				requestPreviewFrame(syncOnAnimationFrame);
		}

		playheadAnimationFrameRef.current =
			requestPreviewFrame(syncOnAnimationFrame);

		return () => {
			cancelled = true;

			if (playheadAnimationFrameRef.current !== null) {
				cancelPreviewFrame(playheadAnimationFrameRef.current);
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
				previewAudioEnginePlaybackStartedRef.current = false;
				setIsPlaying(false);
			});
			return;
		}

		previewAudioEngineRef.current?.pause();
		previewAudioEnginePlaybackStartedRef.current = false;
		setIsPlaying(false);
		setPlayheadUs(durationUs);
	}, [
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
		previewAudioEnginePlaybackStartedRef.current = false;
		setIsPlaying(false);
	}, [previewAudioEngineRef, nativeVideoClockActive]);

	const handleNativePlay = useCallback(() => {
		if (!nativeVideoClockActive) {
			return;
		}

		setIsPlaying(true);
	}, [nativeVideoClockActive]);

	return {
		getPlaybackRate,
		getPlayheadUs,
		handleEnded,
		handleNativePause,
		handleNativePlay,
		isPlaying,
		muted,
		playbackRate,
		previewClockMode,
		playheadUs,
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

function clampMediaTime(
	valueUs: MediaTimeUs,
	minUs: MediaTimeUs,
	maxUs: MediaTimeUs,
): MediaTimeUs {
	return Math.min(Math.max(valueUs, minUs), maxUs);
}

function requestPreviewFrame(callback: FrameRequestCallback): number {
	if (typeof window.requestAnimationFrame === "function") {
		return window.requestAnimationFrame(callback);
	}

	return window.setTimeout(() => callback(window.performance.now()), 16);
}

function cancelPreviewFrame(frameId: number) {
	if (typeof window.cancelAnimationFrame === "function") {
		window.cancelAnimationFrame(frameId);
		return;
	}

	window.clearTimeout(frameId);
}

function previewNowMs(): number {
	if (typeof window.performance?.now === "function") {
		return window.performance.now();
	}

	return Date.now();
}
