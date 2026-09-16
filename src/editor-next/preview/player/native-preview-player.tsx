import type { MediaPlayerInstance } from "@vidstack/react";
import {
	type ReactNode,
	memo,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import type {
	AudioMix,
	MediaTimeUs,
	ReadyMediaAsset,
	Selection,
} from "@/editor-core/model";
import {
	type PreviewAudioEngine,
	canUsePreviewAudioEngine,
} from "../../audio/engine/preview-audio-engine";
import { usePreviewAudioMonitoring } from "../../audio/engine/preview-audio-monitoring-provider";
import {
	type PreviewAudioMonitoringStatus,
	usePreviewAudioMonitoringLifecycle,
} from "../../audio/engine/use-preview-audio-monitoring-lifecycle";
import { usePreviewAudioResources } from "../../audio/engine/use-preview-audio-resources";
import { usePreviewMeteringSource } from "../../audio/meters/preview-metering-provider";
import type { ActiveMediaAssetCleanupScope } from "../../media-work/scopes/active-media-asset-cleanup-scope";
import { EditorWorkbenchLayout } from "../../workbench/frame/editor-workbench-layout";
import { usePreviewKeyboardShortcuts } from "../keyboard/preview-keyboard-shortcuts";
import { usePreviewApertureLayout } from "../layout/preview-aperture-layout";
import { PreviewSelectionWaveformRegion } from "../regions/preview-selection-waveform-region";
import { PreviewTransportRegion } from "../regions/preview-transport-region";
import { PreviewViewerRegion } from "../regions/preview-viewer-region";
import { useScrubPreview } from "../scrub/use-scrub-preview";
import { resolvePreviewClockMode } from "../transport/preview-clock-mode";
import { useNativePreviewTransport } from "../transport/use-native-preview-transport";

const EMPTY_AUDIO_PREVIEW_PREPARING_TRACK_IDS = new Set<string>();

export type NativePreviewPlayerProps = {
	activeMediaAssetCleanupScope?: ActiveMediaAssetCleanupScope;
	asset: ReadyMediaAsset;
	inspector?: ReactNode;
	audioMix?: AudioMix;
	onAudioTrackIncludedChange?: (trackId: string, include: boolean) => void;
	onPreviewPlayheadChange?: (playheadUs: MediaTimeUs) => void;
	onSelectionEndRequested: (playheadUs: MediaTimeUs) => void;
	onSelectionRangeMoveRequested: (deltaUs: MediaTimeUs) => void;
	onSelectionResetRequested: () => void;
	onSelectionReplaceRequested?: (selection: Selection) => void;
	onSelectionStartRequested: (playheadUs: MediaTimeUs) => void;
	selection: Selection;
	selectionEditingDisabled?: boolean;
	shortcutsDisabled?: boolean;
	source: Blob;
};

export const NativePreviewPlayer = memo(function NativePreviewPlayer({
	activeMediaAssetCleanupScope,
	asset,
	inspector,
	audioMix = createDefaultAudioMix(asset),
	onAudioTrackIncludedChange,
	onPreviewPlayheadChange,
	onSelectionEndRequested,
	onSelectionRangeMoveRequested,
	onSelectionReplaceRequested,
	onSelectionResetRequested,
	onSelectionStartRequested,
	selection,
	selectionEditingDisabled = false,
	shortcutsDisabled = false,
	source,
}: NativePreviewPlayerProps) {
	const { soloedAudioTrackId } = usePreviewAudioMonitoring();
	const videoRef = useRef<MediaPlayerInstance | null>(null);
	const previewAudioEngineRef = useRef<PreviewAudioEngine | null>(null);
	const audioMixRef = useRef(audioMix);
	const audioMonitoringStatusRef = useRef<PreviewAudioMonitoringStatus>("idle");
	const getPlaybackRateRef = useRef<() => number>(() => 1);
	const getPlayheadUsRef = useRef<() => MediaTimeUs>(() => 0);
	const getPreviewMeteringIsPlayingRef = useRef<() => boolean>(() => false);
	const previewMeteringPlaybackStateListenersRef = useRef(
		new Set<() => void>(),
	);
	const retryPreviewMeteringTrackRef = useRef<(trackId: string) => void>(
		() => undefined,
	);
	const previewMeteringSourceRef = useRef({
		getIsPlaying: () => getPreviewMeteringIsPlayingRef.current(),
		getMeteringStatus: () => audioMonitoringStatusRef.current,
		readMeterSnapshot: () =>
			previewAudioEngineRef.current?.readMeterSnapshot() ?? null,
		retryTrack: (trackId: string) =>
			retryPreviewMeteringTrackRef.current(trackId),
		subscribeToPlaybackStateChange: (listener: () => void) => {
			previewMeteringPlaybackStateListenersRef.current.add(listener);

			return () => {
				previewMeteringPlaybackStateListenersRef.current.delete(listener);
			};
		},
	});
	const [audioMonitoringStatus, setAudioMonitoringStatus] =
		useState<PreviewAudioMonitoringStatus>("idle");
	const [previewUrl, setPreviewUrl] = useState("");
	const { previewApertureStyle, previewDisplayAspectRatio, previewSurfaceRef } =
		usePreviewApertureLayout(asset);
	audioMixRef.current = audioMix;
	audioMonitoringStatusRef.current = audioMonitoringStatus;

	useEffect(() => {
		const objectUrl = URL.createObjectURL(source);
		const cleanupRegistration = activeMediaAssetCleanupScope?.registerCleanup(
			() => {
				URL.revokeObjectURL(objectUrl);
			},
		);
		setPreviewUrl(objectUrl);

		return () => {
			if (cleanupRegistration) {
				cleanupRegistration.dispose();
				return;
			}

			URL.revokeObjectURL(objectUrl);
		};
	}, [activeMediaAssetCleanupScope, source]);

	const audioPreviewTransportSupported = canUsePreviewAudioEngine(asset);
	const previewAudioResources = usePreviewAudioResources({
		activeMediaAssetCleanupScope,
		asset,
		enabled: audioPreviewTransportSupported,
		source,
	});
	const handlePreviewMeteringRetry = useCallback((trackId: string) => {
		void previewAudioEngineRef.current?.retryTrack(trackId);
	}, []);
	retryPreviewMeteringTrackRef.current = handlePreviewMeteringRetry;
	const audioPreviewPreparingTrackIds =
		previewAudioResources.status === "loading"
			? previewAudioResources.preparingTrackIds
			: EMPTY_AUDIO_PREVIEW_PREPARING_TRACK_IDS;
	const readPreviewAudioMonitoringPlaybackRate = useCallback(
		() => getPlaybackRateRef.current(),
		[],
	);
	const readPreviewAudioMonitoringPlayheadUs = useCallback(
		() => getPlayheadUsRef.current(),
		[],
	);
	const previewClockMode = resolvePreviewClockMode({
		asset,
		audioMonitoringFailed: audioMonitoringStatus === "failed",
		audioMonitoringReady:
			audioMonitoringStatus === "ready" || audioMonitoringStatus === "degraded",
		audioMonitoringEstablished:
			audioMonitoringStatus === "preparing" &&
			previewAudioEngineRef.current !== null,
		previewAudioResources,
		audioPreviewTransportSupported,
	});

	const {
		getPlaybackRate,
		getPlayheadUs,
		handleEnded,
		handleNativePause,
		handleNativePlay,
		isPlaying,
		muted,
		playbackRate,
		playheadUs,
		previewScrubToUs,
		selectionLoopEnabled,
		setPreviewPlaybackRate,
		setPreviewVolume,
		syncPlayheadWithNativeVideo,
		toggleMuted,
		togglePlayback,
		toggleSelectionLoop,
		volume,
	} = useNativePreviewTransport({
		durationUs: asset.durationUs,
		frameDurationUs: asset.frameTiming.frameDurationUs,
		previewAudioEngineRef,
		previewClockMode,
		selection,
		source,
		videoRef,
	});
	const scrubPreview = useScrubPreview({
		activeMediaAssetCleanupScope,
		asset,
		source,
	});
	const seekToUsWithScrubPreview = useCallback(
		(nextPlayheadUs: MediaTimeUs) => {
			const clampedPlayheadUs = Math.min(
				Math.max(Math.round(nextPlayheadUs), 0),
				asset.durationUs,
			);
			scrubPreview.requestFrame(clampedPlayheadUs, { priority: "final" });
			previewScrubToUs(clampedPlayheadUs);
		},
		[asset.durationUs, previewScrubToUs, scrubPreview.requestFrame],
	);
	const seekByUsWithScrubPreview = useCallback(
		(deltaUs: MediaTimeUs) => {
			seekToUsWithScrubPreview(getPlayheadUs() + deltaUs);
		},
		[getPlayheadUs, seekToUsWithScrubPreview],
	);
	const previewPlayheadWithScrub = useCallback(
		(nextPlayheadUs: MediaTimeUs) => {
			const clampedPlayheadUs = Math.min(
				Math.max(Math.round(nextPlayheadUs), 0),
				asset.durationUs,
			);
			scrubPreview.requestFrame(clampedPlayheadUs, {
				priority: "interactive",
			});
			previewScrubToUs(clampedPlayheadUs);
		},
		[asset.durationUs, previewScrubToUs, scrubPreview.requestFrame],
	);
	const stepFrameWithScrubPreview = useCallback(
		(direction: -1 | 1) => {
			const nextPlayheadUs = Math.min(
				Math.max(
					getPlayheadUs() + direction * asset.frameTiming.frameDurationUs,
					0,
				),
				asset.durationUs,
			);
			scrubPreview.requestFrame(nextPlayheadUs, { priority: "final" });
			previewScrubToUs(nextPlayheadUs);
		},
		[
			asset.durationUs,
			asset.frameTiming.frameDurationUs,
			getPlayheadUs,
			previewScrubToUs,
			scrubPreview.requestFrame,
		],
	);
	const handleNativeSeeked = useCallback(() => {
		syncPlayheadWithNativeVideo();
		scrubPreview.handleNativeSeeked(
			videoRef.current?.currentTime ?? Number.NaN,
		);
	}, [scrubPreview.handleNativeSeeked, syncPlayheadWithNativeVideo]);
	const togglePlaybackWithScrubPreview = useCallback(() => {
		void togglePlayback();
	}, [togglePlayback]);
	getPlaybackRateRef.current = getPlaybackRate;
	getPlayheadUsRef.current = getPlayheadUs;
	getPreviewMeteringIsPlayingRef.current = () => isPlaying;
	usePreviewMeteringSource(previewMeteringSourceRef.current);
	const previousPreviewMeteringIsPlayingRef = useRef(isPlaying);
	useEffect(() => {
		if (previousPreviewMeteringIsPlayingRef.current === isPlaying) {
			return;
		}

		previousPreviewMeteringIsPlayingRef.current = isPlaying;
		for (const listener of previewMeteringPlaybackStateListenersRef.current) {
			listener();
		}
	}, [isPlaying]);

	useEffect(() => {
		onPreviewPlayheadChange?.(playheadUs);
	}, [onPreviewPlayheadChange, playheadUs]);

	usePreviewAudioMonitoringLifecycle({
		audioMix,
		previewAudioResources,
		getPlaybackRate: readPreviewAudioMonitoringPlaybackRate,
		getPlayheadUs: readPreviewAudioMonitoringPlayheadUs,
		muted,
		onStatusChange: setAudioMonitoringStatus,
		previewAudioEngineRef,
		soloedAudioTrackId,
		volume,
	});

	const requestFullscreen = useCallback(() => {
		const player = videoRef.current;

		if (player?.enterFullscreen) {
			void player.enterFullscreen();
			return;
		}

		const nativeFullscreenTarget = player as
			| (MediaPlayerInstance & {
					requestFullscreen?: () => Promise<void>;
			  })
			| null;
		void nativeFullscreenTarget?.requestFullscreen?.();
	}, []);

	usePreviewKeyboardShortcuts({
		getPlayheadUs,
		onFrameStep: stepFrameWithScrubPreview,
		onSeekBy: seekByUsWithScrubPreview,
		onSelectionEndRequested,
		onSelectionStartRequested,
		onTogglePlayback: togglePlaybackWithScrubPreview,
		shortcutsDisabled,
	});

	const canFullscreen =
		typeof videoRef.current?.enterFullscreen === "function" ||
		typeof (
			videoRef.current as
				| (MediaPlayerInstance & {
						requestFullscreen?: () => Promise<void>;
				  })
				| null
		)?.requestFullscreen === "function" ||
		(typeof HTMLVideoElement !== "undefined" &&
			typeof HTMLVideoElement.prototype.requestFullscreen === "function") ||
		(typeof document !== "undefined" &&
			typeof document.documentElement.requestFullscreen === "function");

	return (
		<EditorWorkbenchLayout
			inspector={inspector}
			viewer={
				<PreviewViewerRegion
					asset={asset}
					canFullscreen={canFullscreen}
					isPlaying={isPlaying}
					mediaMuted={previewClockMode !== "native-video" || muted}
					onChapterSelectionRequested={
						selectionEditingDisabled ? undefined : onSelectionReplaceRequested
					}
					onEnded={handleEnded}
					onNativePause={handleNativePause}
					onNativePlay={handleNativePlay}
					onNativePlaying={scrubPreview.hide}
					onNativeSeeked={handleNativeSeeked}
					onRequestFullscreen={requestFullscreen}
					onSyncPlayhead={syncPlayheadWithNativeVideo}
					playbackRate={playbackRate}
					playheadUs={playheadUs}
					previewApertureStyle={previewApertureStyle}
					previewDisplayAspectRatio={previewDisplayAspectRatio}
					previewSourceMimeType={source.type}
					previewSurfaceRef={previewSurfaceRef}
					previewUrl={previewUrl}
					scrubCanvasRef={scrubPreview.canvasRef}
					scrubFrameVisible={scrubPreview.visible}
					videoRef={videoRef}
				/>
			}
			transport={
				<PreviewTransportRegion
					isPlaying={isPlaying}
					muted={muted}
					onPlaybackRateChange={setPreviewPlaybackRate}
					onSeekByUs={seekByUsWithScrubPreview}
					onStepFrame={stepFrameWithScrubPreview}
					onToggleMuted={toggleMuted}
					onTogglePlayback={togglePlaybackWithScrubPreview}
					onToggleSelectionLoop={toggleSelectionLoop}
					onVolumeChange={setPreviewVolume}
					playbackRate={playbackRate}
					selectionLoopEnabled={selectionLoopEnabled}
					volume={volume}
				/>
			}
			selection={
				<PreviewSelectionWaveformRegion
					audioMix={audioMix}
					audioPreviewPreparingTrackIds={audioPreviewPreparingTrackIds}
					asset={asset}
					onAudioTrackIncludedChange={onAudioTrackIncludedChange}
					onPlayheadPreviewRequested={previewPlayheadWithScrub}
					onPlayheadSeekRequested={seekToUsWithScrubPreview}
					onSelectionEndCommitRequested={onSelectionEndRequested}
					onSelectionRangeMoveRequested={onSelectionRangeMoveRequested}
					onSelectionResetRequested={onSelectionResetRequested}
					onSelectionStartCommitRequested={onSelectionStartRequested}
					playheadUs={playheadUs}
					playheadUpdatesAreLive={isPlaying}
					readLivePlayheadUs={getPlayheadUs}
					selection={selection}
					selectionEditingDisabled={selectionEditingDisabled}
					source={source}
				/>
			}
		/>
	);
});
