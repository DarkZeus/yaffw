import type { MediaPlayerInstance } from "@vidstack/react";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import type { MediaTimeUs } from "@/editor-core/model";
import {
	type PreviewAudioEngine,
	canUsePreviewAudioEngine,
} from "../../audio/engine/preview-audio-engine";
import { usePreviewAudioMonitoringLifecycle } from "../../audio/engine/use-preview-audio-monitoring-lifecycle";
import { usePreviewAudioResources } from "../../audio/engine/use-preview-audio-resources";
import type { PreviewAudioMonitoringStatus } from "../../audio/types/use-preview-audio-monitoring-lifecycle.types";
import { usePreviewKeyboardShortcuts } from "../keyboard/preview-keyboard-shortcuts";
import { usePreviewApertureLayout } from "../layout/preview-aperture-layout";
import { PreviewSelectionWaveformRegion } from "../regions/preview-selection-waveform-region";
import { PreviewTransportRegion } from "../regions/preview-transport-region";
import { PreviewViewerRegion } from "../regions/preview-viewer-region";
import { resolvePreviewClockMode } from "../transport/preview-clock-mode";
import { useNativePreviewTransport } from "../transport/use-native-preview-transport";
import type { NativePreviewPlayerProps } from "../types/native-preview-player.types";

const EMPTY_AUDIO_PREVIEW_PREPARING_TRACK_IDS = new Set<string>();

export const NativePreviewPlayer = memo(function NativePreviewPlayer({
	activeMediaAssetCleanupScope,
	asset,
	audioMix = createDefaultAudioMix(asset),
	onAudioTrackIncludedChange,
	onPreviewMeteringClockChange,
	onPreviewMeteringRetryChange,
	onPreviewPlayheadChange,
	onSelectionEndRequested,
	onSelectionRangeMoveRequested,
	onSelectionReplaceRequested,
	onSelectionResetRequested,
	onSelectionStartRequested,
	selection,
	selectionEditingDisabled = false,
	shortcutsDisabled = false,
	onSoloedAudioTrackChange,
	soloedAudioTrackId: controlledSoloedAudioTrackId,
	source,
}: NativePreviewPlayerProps) {
	const videoRef = useRef<MediaPlayerInstance | null>(null);
	const previewAudioEngineRef = useRef<PreviewAudioEngine | null>(null);
	const audioMixRef = useRef(audioMix);
	const audioMonitoringStatusRef = useRef<PreviewAudioMonitoringStatus>("idle");
	const getPlaybackRateRef = useRef<() => number>(() => 1);
	const getPlayheadUsRef = useRef<() => MediaTimeUs>(() => 0);
	const getPreviewMeteringIsPlayingRef = useRef<() => boolean>(() => false);
	const previewMeteringClockRef = useRef({
		getIsPlaying: () => getPreviewMeteringIsPlayingRef.current(),
		getMeteringStatus: () => audioMonitoringStatusRef.current,
		readMeterSnapshot: () =>
			previewAudioEngineRef.current?.readMeterSnapshot({
				outputChannels: audioMixRef.current.outputChannels,
			}) ?? null,
	});
	const [audioMonitoringStatus, setAudioMonitoringStatus] =
		useState<PreviewAudioMonitoringStatus>("idle");
	const [previewUrl, setPreviewUrl] = useState("");
	const [localSoloedAudioTrackId, setLocalSoloedAudioTrackId] = useState<
		string | null
	>(null);
	const { previewApertureStyle, previewSurfaceRef } =
		usePreviewApertureLayout(asset);
	const soloedAudioTrackId =
		controlledSoloedAudioTrackId === undefined
			? localSoloedAudioTrackId
			: controlledSoloedAudioTrackId;
	audioMixRef.current = audioMix;
	audioMonitoringStatusRef.current = audioMonitoringStatus;
	const handleSoloedAudioTrackChange = useCallback(
		(trackId: string | null) => {
			setLocalSoloedAudioTrackId((currentTrackId) =>
				currentTrackId === trackId ? currentTrackId : trackId,
			);
			onSoloedAudioTrackChange?.(trackId);
		},
		[onSoloedAudioTrackChange],
	);

	useEffect(() => {
		const objectUrl = URL.createObjectURL(source);
		const cleanupRegistration = activeMediaAssetCleanupScope?.registerCleanup(
			() => {
				URL.revokeObjectURL(objectUrl);
			},
		);
		setPreviewUrl(objectUrl);
		setLocalSoloedAudioTrackId(null);
		onSoloedAudioTrackChange?.(null);

		return () => {
			if (cleanupRegistration) {
				cleanupRegistration.dispose();
				return;
			}

			URL.revokeObjectURL(objectUrl);
		};
	}, [activeMediaAssetCleanupScope, onSoloedAudioTrackChange, source]);

	const audioPreviewTransportSupported = canUsePreviewAudioEngine(asset);
	const previewAudioResources = usePreviewAudioResources({
		activeMediaAssetCleanupScope,
		asset,
		enabled: audioPreviewTransportSupported,
		source,
	});
	const previewAudioResourcesRef = useRef(previewAudioResources);
	previewAudioResourcesRef.current = previewAudioResources;
	const handlePreviewMeteringRetry = useCallback((trackId: string) => {
		const previewAudioResources = previewAudioResourcesRef.current;
		const sourceFailures =
			previewAudioResources.status === "ready" ||
			previewAudioResources.status === "failed"
				? previewAudioResources.failures
				: [];

		if (sourceFailures.some((failure) => failure.trackId === trackId)) {
			previewAudioResources.retryTrack(trackId);
			return;
		}

		const retry = previewAudioEngineRef.current?.retryTrackResource(trackId);

		if (!retry) {
			return;
		}

		void retry.then((nextStatus) => {
			setAudioMonitoringStatus(nextStatus);
		});
	}, []);
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
	} = useNativePreviewTransport({
		durationUs: asset.durationUs,
		frameDurationUs: asset.frameTiming.frameDurationUs,
		previewAudioEngineRef,
		previewClockMode,
		selection,
		source,
		videoRef,
	});
	getPlaybackRateRef.current = getPlaybackRate;
	getPlayheadUsRef.current = getPlayheadUs;
	getPreviewMeteringIsPlayingRef.current = () => isPlaying;

	useEffect(() => {
		const clock = previewMeteringClockRef.current;
		onPreviewMeteringClockChange?.(clock);

		return () => {
			onPreviewMeteringClockChange?.(null);
		};
	}, [onPreviewMeteringClockChange]);

	useEffect(() => {
		onPreviewMeteringRetryChange?.(handlePreviewMeteringRetry);

		return () => {
			onPreviewMeteringRetryChange?.(null);
		};
	}, [handlePreviewMeteringRetry, onPreviewMeteringRetryChange]);

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
		onFrameStep: stepFrame,
		onSeekBy: seekByUs,
		onSelectionEndRequested,
		onSelectionStartRequested,
		onTogglePlayback: () => {
			void togglePlayback();
		},
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
		<ResizablePanelGroup
			aria-label="Preview and selection layout"
			autoSaveId="editor-next-preview-layout"
			className="min-h-[46rem] min-w-0 xl:h-full xl:min-h-0 xl:overflow-hidden"
			direction="vertical"
		>
			<ResizablePanel
				className="min-h-0 min-w-0"
				defaultSize={62}
				id="editor-next-viewer-pane"
				minSize={35}
				order={1}
			>
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
					onRequestFullscreen={requestFullscreen}
					onSyncPlayhead={syncPlayheadWithNativeVideo}
					playbackRate={playbackRate}
					playheadUs={playheadUs}
					previewApertureStyle={previewApertureStyle}
					previewSourceMimeType={source.type}
					previewSurfaceRef={previewSurfaceRef}
					previewUrl={previewUrl}
					videoRef={videoRef}
				/>
			</ResizablePanel>

			<ResizableHandle
				aria-label="Resize selection region"
				className="bg-workbench-border-strong"
			/>

			<ResizablePanel
				className="grid min-h-0 min-w-0 grid-rows-[2.75rem_minmax(0,1fr)] overflow-hidden"
				defaultSize={38}
				id="editor-next-selection-pane"
				minSize={24}
				order={2}
			>
				<PreviewTransportRegion
					isPlaying={isPlaying}
					muted={muted}
					onPlaybackRateChange={setPreviewPlaybackRate}
					onSeekByUs={seekByUs}
					onStepFrame={stepFrame}
					onToggleMuted={toggleMuted}
					onTogglePlayback={togglePlayback}
					onToggleSelectionLoop={toggleSelectionLoop}
					onVolumeChange={setPreviewVolume}
					playbackRate={playbackRate}
					selectionLoopEnabled={selectionLoopEnabled}
					volume={volume}
				/>

				<PreviewSelectionWaveformRegion
					audioMix={audioMix}
					audioPreviewPreparingTrackIds={audioPreviewPreparingTrackIds}
					asset={asset}
					onAudioTrackIncludedChange={onAudioTrackIncludedChange}
					onPlayheadSeekRequested={seekToUs}
					onSoloedAudioTrackChange={handleSoloedAudioTrackChange}
					onSelectionEndCommitRequested={onSelectionEndRequested}
					onSelectionRangeMoveRequested={onSelectionRangeMoveRequested}
					onSelectionResetRequested={onSelectionResetRequested}
					onSelectionStartCommitRequested={onSelectionStartRequested}
					playheadUs={playheadUs}
					playheadUpdatesAreLive={isPlaying}
					readLivePlayheadUs={getPlayheadUs}
					selection={selection}
					selectionEditingDisabled={selectionEditingDisabled}
					soloedAudioTrackId={soloedAudioTrackId}
					source={source}
				/>
			</ResizablePanel>
		</ResizablePanelGroup>
	);
});
