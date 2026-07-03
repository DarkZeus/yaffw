import { useCallback, useEffect, useRef, useState } from "react";

import type { MediaTimeUs, Selection } from "@/editor-core/model";

import { setMultitrackPreviewPlaybackRate } from "./native-preview-audio-transport";
import type { UseNativePreviewTransportOptions } from "./use-native-preview-transport.types";

const PREVIEW_AV_HARD_RESYNC_MIN_THRESHOLD_SECONDS = 0.05;
const PREVIEW_AV_HARD_RESYNC_FRAME_TOLERANCE = 2;
const PREVIEW_PLAYHEAD_UI_COMMIT_INTERVAL_MS = 50;
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
	multitrackRef,
	previewClockMode,
	selection,
	source,
	videoRef,
}: UseNativePreviewTransportOptions) {
	const playheadRef = useRef<MediaTimeUs>(0);
	const playbackRateRef = useRef(1);
	const playbackStartRequestIdRef = useRef(0);
	const playbackStartPendingRef = useRef(false);
	const multitrackPlaybackStartedRef = useRef(false);
	const playheadAnimationFrameRef = useRef<number | null>(null);
	const playheadStateCommitTimestampRef = useRef<number | null>(null);
	const playheadStateRef = useRef<MediaTimeUs>(0);
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
		playbackStartRequestIdRef.current += 1;
		playbackStartPendingRef.current = false;
		multitrackPlaybackStartedRef.current = false;
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
				video.currentTime = nextTimeSeconds;
			}

			if (audioMasterClockActive) {
				multitrackRef.current?.setTime(nextTimeSeconds);
			}
		},
		[audioMasterClockActive, multitrackRef, videoRef],
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
			multitrackRef.current?.pause();
			videoRef.current?.pause();
			multitrackPlaybackStartedRef.current = false;
			setIsPlaying(false);
			seekByUs(direction * frameDurationUs);
		},
		[frameDurationUs, multitrackRef, seekByUs, videoRef],
	);

	const togglePlayback = useCallback(async () => {
		const video = videoRef.current;

		if (!video) {
			return;
		}

		if (isPlaying) {
			playbackStartRequestIdRef.current += 1;
			playbackStartPendingRef.current = false;
			multitrackRef.current?.pause();
			video.pause();
			multitrackPlaybackStartedRef.current = false;
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
				video.muted = true;
				multitrackRef.current?.setTime(playheadRef.current / 1_000_000);
				multitrackRef.current?.play();
				multitrackPlaybackStartedRef.current = true;
				setIsPlaying(true);
				await video.play();
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

			multitrackRef.current?.pause();
			multitrackPlaybackStartedRef.current = false;
			setIsPlaying(false);
		} finally {
			if (playbackStartIsCurrent()) {
				playbackStartPendingRef.current = false;
			}
		}
	}, [
		audioMasterClockActive,
		isPlaying,
		multitrackRef,
		previewClockMode,
		videoRef,
	]);

	const setPreviewPlaybackRate = useCallback(
		(nextPlaybackRate: number) => {
			const video = videoRef.current;

			if (video) {
				video.playbackRate = nextPlaybackRate;
			}

			setMultitrackPreviewPlaybackRate(multitrackRef.current, nextPlaybackRate);
			playbackRateRef.current = nextPlaybackRate;
			setPlaybackRate(nextPlaybackRate);
		},
		[multitrackRef, videoRef],
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
			multitrackPlaybackStartedRef.current = false;
			return;
		}

		if (multitrackPlaybackStartedRef.current) {
			return;
		}

		const video = videoRef.current;
		if (video) {
			video.muted = true;
		}
		multitrackRef.current?.setTime(playheadRef.current / 1_000_000);
		multitrackRef.current?.play();
		multitrackPlaybackStartedRef.current = true;
	}, [audioMasterClockActive, isPlaying, multitrackRef, videoRef]);

	useEffect(() => {
		if (previewClockMode !== "audio-master-pending" || !isPlaying) {
			return;
		}

		multitrackRef.current?.pause();
		videoRef.current?.pause();
		multitrackPlaybackStartedRef.current = false;
		setIsPlaying(false);
	}, [isPlaying, multitrackRef, previewClockMode, videoRef]);

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
				setVideoFollowerTime(video, previousPlayheadUs);
				updateSelectionLoopEntryFromPlayhead(previousPlayheadUs);
				setPlayheadUs(previousPlayheadUs);
				return;
			}

			const transportTimeSeconds =
				audioMasterClockActive && multitrackRef.current
					? multitrackRef.current.getCurrentTime()
					: video.currentTime;
			const nativePlayheadUs = secondsToMicroseconds(transportTimeSeconds);

			if (
				audioMasterClockActive &&
				Number.isFinite(transportTimeSeconds) &&
				Math.abs(video.currentTime - transportTimeSeconds) >
					previewAvHardResyncThresholdSeconds(frameDurationUs)
			) {
				video.currentTime = transportTimeSeconds;
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
				multitrackRef.current?.pause();
				video.pause();
				multitrackPlaybackStartedRef.current = false;
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
			multitrackRef,
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
				multitrackPlaybackStartedRef.current = false;
				setIsPlaying(false);
			});
			return;
		}

		multitrackRef.current?.pause();
		multitrackPlaybackStartedRef.current = false;
		setIsPlaying(false);
		setPlayheadUs(durationUs);
	}, [
		durationUs,
		multitrackRef,
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

		multitrackRef.current?.pause();
		multitrackPlaybackStartedRef.current = false;
		setIsPlaying(false);
	}, [multitrackRef, nativeVideoClockActive]);

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

function setVideoFollowerTime(
	video: { currentTime: number },
	playheadUs: MediaTimeUs,
) {
	if (secondsToMicroseconds(video.currentTime) === playheadUs) {
		return;
	}

	video.currentTime = playheadUs / 1_000_000;
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
