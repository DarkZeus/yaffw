import type { MediaPlayerInstance } from "@vidstack/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type MultiTrack from "wavesurfer-multitrack";

import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import type { MediaTimeUs } from "@/editor-core/model";
import { canUseBrowserAudioPreviewTransport } from "./native-preview-audio-transport";
import type { NativePreviewPlayerProps } from "./native-preview-player.types";
import { usePreviewApertureLayout } from "./preview-aperture-layout";
import { usePreviewKeyboardShortcuts } from "./preview-keyboard-shortcuts";
import { PreviewSelectionWaveformRegion } from "./preview-selection-waveform-region";
import { PreviewTransportRegion } from "./preview-transport-region";
import { PreviewViewerRegion } from "./preview-viewer-region";
import { resolvePreviewClockMode } from "./preview-clock-mode";
import { useBrowserAudioPreviewSources } from "./use-browser-audio-preview-sources";
import { useNativePreviewTransport } from "./use-native-preview-transport";
import { usePreviewAudioMonitoringLifecycle } from "./use-preview-audio-monitoring-lifecycle";

const EMPTY_AUDIO_PREVIEW_PREPARING_TRACK_IDS = new Set<string>();

export function NativePreviewPlayer({
	activeMediaAssetCleanupScope,
	asset,
	audioMix = createDefaultAudioMix(asset),
	onAudioTrackChannelModeChange,
	onAudioTrackIncludedChange,
	onAudioTrackVolumePercentChange,
	onPreviewPlayheadChange,
	onSelectionEndRequested,
	onSelectionRangeMoveRequested,
	onSelectionReplaceRequested,
	onSelectionResetRequested,
	onSelectionStartRequested,
	previewPosterSrc,
	selection,
	selectionEditingDisabled = false,
	shortcutsDisabled = false,
	source,
}: NativePreviewPlayerProps) {
	const videoRef = useRef<MediaPlayerInstance | null>(null);
	const multitrackContainerRef = useRef<HTMLDivElement | null>(null);
	const multitrackRef = useRef<MultiTrack | null>(null);
	const getPlaybackRateRef = useRef<() => number>(() => 1);
	const getPlayheadUsRef = useRef<() => MediaTimeUs>(() => 0);
	const [audioMonitoringReady, setAudioMonitoringReady] = useState(false);
	const [previewUrl, setPreviewUrl] = useState("");
	const [soloedAudioTrackId, setSoloedAudioTrackId] = useState<string | null>(
		null,
	);
	const { previewApertureStyle, previewSurfaceRef } =
		usePreviewApertureLayout(asset);

	useEffect(() => {
		const objectUrl = URL.createObjectURL(source);
		const cleanupRegistration = activeMediaAssetCleanupScope?.registerCleanup(
			() => {
				URL.revokeObjectURL(objectUrl);
			},
		);
		setPreviewUrl(objectUrl);
		setSoloedAudioTrackId(null);

		return () => {
			if (cleanupRegistration) {
				cleanupRegistration.dispose();
				return;
			}

			URL.revokeObjectURL(objectUrl);
		};
	}, [activeMediaAssetCleanupScope, source]);

	const audioPreviewTransportSupported = canUseBrowserAudioPreviewTransport(asset);
	const audioPreviewSources = useBrowserAudioPreviewSources({
		activeMediaAssetCleanupScope,
		audioMix,
		asset,
		enabled: audioPreviewTransportSupported,
		source,
	});
	const audioPreviewPreparingTrackIds =
		audioPreviewSources.status === "loading"
			? audioPreviewSources.preparingTrackIds
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
		audioMonitoringReady,
		audioPreviewSources,
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
		multitrackRef,
		previewClockMode,
		selection,
		source,
		videoRef,
	});
	getPlaybackRateRef.current = getPlaybackRate;
	getPlayheadUsRef.current = getPlayheadUs;

	useEffect(() => {
		onPreviewPlayheadChange?.(playheadUs);
	}, [onPreviewPlayheadChange, playheadUs]);

	const audioMonitoring = usePreviewAudioMonitoringLifecycle({
		audioMix,
		audioPreviewSources,
		getPlaybackRate: readPreviewAudioMonitoringPlaybackRate,
		getPlayheadUs: readPreviewAudioMonitoringPlayheadUs,
		multitrackContainerRef,
		multitrackRef,
		muted,
		onReadyChange: setAudioMonitoringReady,
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
					multitrackContainerRef={audioMonitoring.multitrackContainerRef}
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
					previewPosterSrc={previewPosterSrc}
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
					onAudioTrackChannelModeChange={onAudioTrackChannelModeChange}
					onAudioTrackIncludedChange={onAudioTrackIncludedChange}
					onAudioTrackVolumePercentChange={onAudioTrackVolumePercentChange}
					onPlayheadSeekRequested={seekToUs}
					onSoloedAudioTrackChange={setSoloedAudioTrackId}
					onSelectionEndCommitRequested={onSelectionEndRequested}
					onSelectionRangeMoveRequested={onSelectionRangeMoveRequested}
					onSelectionResetRequested={onSelectionResetRequested}
					onSelectionStartCommitRequested={onSelectionStartRequested}
					playheadUs={playheadUs}
					playheadUpdatesAreLive={isPlaying}
					selection={selection}
					selectionEditingDisabled={selectionEditingDisabled}
					soloedAudioTrackId={soloedAudioTrackId}
					source={source}
				/>
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}
