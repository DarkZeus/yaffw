import {
	type SyntheticEvent,
	memo,
	useCallback,
	useEffect,
	useLayoutEffect,
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
import { canUsePreviewAudioEngine } from "../../audio/engine/preview-audio-engine";
import { usePreviewAudioMonitoring } from "../../audio/engine/preview-audio-monitoring-provider";
import {
	type PreviewAudioMonitoringSnapshot,
	type PreviewAudioMonitoringStatus,
	usePreviewAudioMonitoringLifecycle,
} from "../../audio/engine/use-preview-audio-monitoring-lifecycle";
import { usePreviewAudioResources } from "../../audio/engine/use-preview-audio-resources";
import { usePreviewMeteringSource } from "../../audio/meters/preview-metering-provider";
import type { PreviewAudioEngine } from "../../audio/types/preview-audio-engine.types";
import type { ActiveMediaAssetCleanupScope } from "../../media-work/scopes/active-media-asset-cleanup-scope";
import { EditorWorkbenchLayout } from "../../workbench/frame/editor-workbench-layout";
import type { WorkbenchInspectorPanels } from "../../workbench/frame/workbench-layout-model";
import { usePreviewKeyboardShortcuts } from "../keyboard/preview-keyboard-shortcuts";
import { usePreviewVideoSource } from "../mse/use-preview-video-source";
import { PreviewSelectionWaveformRegion } from "../regions/preview-selection-waveform-region";
import { PreviewTransportRegion } from "../regions/preview-transport-region";
import { PreviewViewerRegion } from "../regions/preview-viewer-region";
import { useScrubPreview } from "../scrub/use-scrub-preview";
import { resolvePreviewClockMode } from "../transport/preview-clock-mode";
import { createPreviewMediaTransport } from "../transport/preview-media-transport";
import {
	type PreviewMediaTransportHandle,
	useNativePreviewTransport,
} from "../transport/use-native-preview-transport";

const EMPTY_AUDIO_PREVIEW_PREPARING_TRACK_IDS = new Set<string>();

export type NativePreviewPlayerProps = {
	activeMediaAssetCleanupScope?: ActiveMediaAssetCleanupScope;
	asset: ReadyMediaAsset;
	closeFileDisabled?: boolean;
	onCloseFileRequested?: () => void;
	inspector?: WorkbenchInspectorPanels;
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
	closeFileDisabled = false,
	onCloseFileRequested,
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
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(
		null,
	);
	const mediaTransportRef = useRef<PreviewMediaTransportHandle | null>(null);
	const setVideoRef = useCallback((video: HTMLVideoElement | null) => {
		videoRef.current = video;
		setVideoElement(video);
		mediaTransportRef.current = video
			? createPreviewMediaTransport(video)
			: null;
	}, []);
	const fullscreenRef = useRef<HTMLDivElement | null>(null);
	const previewAudioEngineRef = useRef<PreviewAudioEngine | null>(null);
	const audioMixRef = useRef(audioMix);
	const audioMonitoringStatusRef = useRef<PreviewAudioMonitoringStatus>("idle");
	const getPlaybackRateRef = useRef<() => number>(() => 1);
	const getPlayheadUsRef = useRef<() => MediaTimeUs>(() => 0);
	const previewMeteringIsPlayingRef = useRef(false);
	const previewMeteringPlaybackStateListenersRef = useRef(
		new Set<() => void>(),
	);
	const retryPreviewMeteringTrackRef = useRef<(trackId: string) => void>(
		() => undefined,
	);
	const previewMeteringSourceRef = useRef({
		getIsPlaying: () => previewMeteringIsPlayingRef.current,
		getMeteringStatus: () => audioMonitoringStatusRef.current,
		readMeterSnapshot: (sampleSignal: boolean) =>
			previewAudioEngineRef.current?.readMeterSnapshot(sampleSignal) ?? null,
		retryTrack: (trackId: string) =>
			retryPreviewMeteringTrackRef.current(trackId),
		subscribeToPlaybackStateChange: (listener: () => void) => {
			previewMeteringPlaybackStateListenersRef.current.add(listener);

			return () => {
				previewMeteringPlaybackStateListenersRef.current.delete(listener);
			};
		},
	});
	const [audioMonitoring, setAudioMonitoring] =
		useState<PreviewAudioMonitoringSnapshot>({
			status: "idle",
			engine: "unavailable",
		});
	const reportAudioMonitoring = useCallback(
		(snapshot: PreviewAudioMonitoringSnapshot) => {
			setAudioMonitoring((previous) =>
				previous.status === snapshot.status &&
				previous.engine === snapshot.engine
					? previous
					: snapshot,
			);
		},
		[],
	);
	const audioMonitoringStatus = audioMonitoring.status;
	const {
		url: previewUrl,
		waitForFragment,
		canResyncTo,
	} = usePreviewVideoSource({
		asset,
		cleanupScope: activeMediaAssetCleanupScope,
		file: source,
		video: videoElement,
	});
	audioMixRef.current = audioMix;
	audioMonitoringStatusRef.current = audioMonitoringStatus;

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
		audioMonitoringFailed:
			audioMonitoringStatus === "failed" && audioMonitoring.engine !== "closed",
		audioMonitoringEstablished: audioMonitoring.engine !== "unavailable",
		previewAudioResources,
		audioPreviewTransportSupported,
	});
	const scrubPreview = useScrubPreview({
		activeMediaAssetCleanupScope,
		asset,
		source,
	});

	const {
		getPlaybackRate,
		getPlayheadUs,
		handleEnded,
		handleNativePause,
		handleNativePlay,
		handleNativePlaying,
		handleNativeWaiting,
		isPlaying,
		playbackRequested,
		audioPlaybackState,
		recoverAudio,
		muted,
		playbackRate,
		playheadUs,
		previewScrubToUs,
		seekWithScrubPreview,
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
		waitForFragment,
		canResyncTo,
		scrubPreview,
		selection,
		source,
		videoRef: mediaTransportRef,
	});
	const {
		requestFrame: requestScrubFrame,
		handleNativeSeeked: handleScrubNativeSeeked,
	} = scrubPreview;
	const seekToUsWithScrubPreview = useCallback(
		(nextPlayheadUs: MediaTimeUs) => {
			const clampedPlayheadUs = Math.min(
				Math.max(Math.round(nextPlayheadUs), 0),
				asset.durationUs,
			);
			requestScrubFrame(clampedPlayheadUs, { priority: "final" });
			seekWithScrubPreview(clampedPlayheadUs);
		},
		[asset.durationUs, requestScrubFrame, seekWithScrubPreview],
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
			requestScrubFrame(clampedPlayheadUs, {
				priority: "interactive",
			});
			previewScrubToUs(clampedPlayheadUs);
		},
		[asset.durationUs, previewScrubToUs, requestScrubFrame],
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
			requestScrubFrame(nextPlayheadUs, { priority: "final" });
			previewScrubToUs(nextPlayheadUs);
		},
		[
			asset.durationUs,
			asset.frameTiming.frameDurationUs,
			getPlayheadUs,
			previewScrubToUs,
			requestScrubFrame,
		],
	);
	const handleNativeSeeked = useCallback(
		(event: SyntheticEvent<HTMLVideoElement>) => {
			const video = event.currentTarget;
			if (video !== videoRef.current) return;
			handleScrubNativeSeeked(video);
			syncPlayheadWithNativeVideo();
		},
		[handleScrubNativeSeeked, syncPlayheadWithNativeVideo],
	);
	const togglePlaybackWithScrubPreview = useCallback(() => {
		if (!playbackRequested && getPlayheadUs() >= asset.durationUs) {
			seekToUsWithScrubPreview(0);
		}
		void togglePlayback();
	}, [
		asset.durationUs,
		getPlayheadUs,
		playbackRequested,
		seekToUsWithScrubPreview,
		togglePlayback,
	]);
	getPlaybackRateRef.current = getPlaybackRate;
	getPlayheadUsRef.current = getPlayheadUs;
	usePreviewMeteringSource(previewMeteringSourceRef.current);
	useLayoutEffect(() => {
		if (previewMeteringIsPlayingRef.current === isPlaying) {
			return;
		}

		previewMeteringIsPlayingRef.current = isPlaying;
		for (const listener of previewMeteringPlaybackStateListenersRef.current) {
			listener();
		}
	}, [isPlaying]);

	useEffect(() => {
		onPreviewPlayheadChange?.(playheadUs);
	}, [onPreviewPlayheadChange, playheadUs]);

	usePreviewAudioMonitoringLifecycle({
		activeMediaAssetCleanupScope,
		audioMix,
		previewAudioResources,
		getPlaybackRate: readPreviewAudioMonitoringPlaybackRate,
		getPlayheadUs: readPreviewAudioMonitoringPlayheadUs,
		muted,
		onStatusChange: reportAudioMonitoring,
		previewAudioEngineRef,
		soloedAudioTrackId,
		volume,
	});

	const requestFullscreen = useCallback(() => {
		void fullscreenRef.current?.requestFullscreen().catch(() => undefined);
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
		typeof document !== "undefined" &&
		typeof document.documentElement.requestFullscreen === "function";

	return (
		<EditorWorkbenchLayout
			inspector={inspector}
			viewer={
				<PreviewViewerRegion
					asset={asset}
					closeFileDisabled={closeFileDisabled}
					onCloseFileRequested={onCloseFileRequested}
					canFullscreen={canFullscreen}
					fullscreenRef={fullscreenRef}
					isPlaying={isPlaying}
					mediaMuted={previewClockMode !== "native-video" || muted}
					onChapterSelectionRequested={
						selectionEditingDisabled ? undefined : onSelectionReplaceRequested
					}
					onEnded={handleEnded}
					onNativePause={handleNativePause}
					onNativePlay={handleNativePlay}
					onNativePlaying={handleNativePlaying}
					onNativeWaiting={handleNativeWaiting}
					onNativeSeeked={handleNativeSeeked}
					onRequestFullscreen={requestFullscreen}
					onTogglePlayback={togglePlaybackWithScrubPreview}
					onPlayheadSeekRequested={seekToUsWithScrubPreview}
					onSyncPlayhead={syncPlayheadWithNativeVideo}
					playbackRate={playbackRate}
					playbackDisabled={audioPlaybackState === "closed"}
					playbackRequested={playbackRequested}
					playheadUs={playheadUs}
					previewUrl={previewUrl}
					scrubCanvasRef={scrubPreview.canvasRef}
					scrubFrameVisible={scrubPreview.visible}
					videoRef={setVideoRef}
				/>
			}
			transport={
				<PreviewTransportRegion
					playbackRequested={playbackRequested}
					audioPlaybackState={audioPlaybackState}
					onRecoverAudio={recoverAudio}
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
					activeMediaAssetCleanupScope={activeMediaAssetCleanupScope}
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
