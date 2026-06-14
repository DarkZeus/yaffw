import { useCallback, useEffect, useRef, useState } from "react";
import type MultiTrack from "wavesurfer-multitrack";

import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import type { MediaTimeUs } from "@/editor-core/model";
import { canUseBrowserAudioPreviewTransport } from "./native-preview-audio-transport";
import type { NativePreviewPlayerProps } from "./native-preview-player.types";
import { usePreviewApertureLayout } from "./preview-aperture-layout";
import { usePreviewKeyboardShortcuts } from "./preview-keyboard-shortcuts";
import { PreviewSelectionWaveformRegion } from "./preview-selection-waveform-region";
import { PreviewTransportRegion } from "./preview-transport-region";
import { PreviewViewerRegion } from "./preview-viewer-region";
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
	onSelectionEndRequested,
	onSelectionRangeMoveRequested,
	onSelectionResetRequested,
	onSelectionStartRequested,
	previewPosterSrc,
	selection,
	selectionEditingDisabled = false,
	shortcutsDisabled = false,
	source,
}: NativePreviewPlayerProps) {
	const videoRef = useRef<HTMLVideoElement | null>(null);
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

	const audioPreviewSources = useBrowserAudioPreviewSources({
		audioMix,
		asset,
		enabled: canUseBrowserAudioPreviewTransport(asset),
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
	const audioTransportReady =
		audioPreviewSources.status === "ready" && audioMonitoringReady;

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
		audioTransportReady,
		durationUs: asset.durationUs,
		frameDurationUs: asset.frameTiming.frameDurationUs,
		multitrackRef,
		selection,
		source,
		videoRef,
	});
	getPlaybackRateRef.current = getPlaybackRate;
	getPlayheadUsRef.current = getPlayheadUs;

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
		void videoRef.current?.requestFullscreen?.();
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
		typeof videoRef.current?.requestFullscreen === "function" ||
		typeof HTMLVideoElement.prototype.requestFullscreen === "function";

	return (
		<>
			<PreviewViewerRegion
				asset={asset}
				canFullscreen={canFullscreen}
				isPlaying={isPlaying}
				multitrackContainerRef={audioMonitoring.multitrackContainerRef}
				onEnded={handleEnded}
				onNativePause={handleNativePause}
				onNativePlay={handleNativePlay}
				onRequestFullscreen={requestFullscreen}
				onSyncPlayhead={syncPlayheadWithNativeVideo}
				playbackRate={playbackRate}
				playheadUs={playheadUs}
				previewApertureStyle={previewApertureStyle}
				previewPosterSrc={previewPosterSrc}
				previewSurfaceRef={previewSurfaceRef}
				previewUrl={previewUrl}
				videoRef={videoRef}
			/>

			<PreviewTransportRegion
				durationUs={asset.durationUs}
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
				playheadUs={playheadUs}
				selectionDurationUs={selection.endUs - selection.startUs}
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
		</>
	);
}
