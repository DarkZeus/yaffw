import {
	type ChangeEvent,
	type DragEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import type { MediaTimeUs } from "@/editor-core/model";
import type { RuntimeSupport } from "@/editor-core/runtime-capabilities";
import { canCloseEditorSession } from "@/editor-core/session";
import { PreviewAudioMonitoringProvider } from "../../audio/engine/preview-audio-monitoring-provider";
import { PreviewMeteringProvider } from "../../audio/meters/preview-metering-provider";
import { AudioPanel } from "../../audio/panel/audio-panel";
import { ExportInspectorPanel } from "../../export/inspector/export-inspector";
import { MediaAssetContextPanel } from "../../media-asset/panel/media-asset-context";
import { NativePreviewPlayer } from "../../preview/player/native-preview-player";
import {
	EditorSessionShell,
	EditorWorkbenchFrame,
	UnsupportedRuntimeState,
} from "../../workbench/frame/editor-workbench";
import type {
	SingleAssetEditingSession,
	SingleAssetEditingSessionCommands,
} from "../session/use-single-asset-editing-session";

export function EditorNextRouteComposition({
	editingSession: {
		activeMediaAssetCleanupScope,
		commands,
		localFileInputKey,
		previewSource,
		session,
	},
	runtime,
}: {
	editingSession: SingleAssetEditingSession;
	runtime: RuntimeSupport;
}) {
	const stableCommands = useStableEditorCommands(commands);
	const activeAssetId = session.status === "ready" ? session.asset.id : null;
	const [previewPlayheadUs, setPreviewPlayheadUs] = useState<MediaTimeUs>(0);
	const handlePreviewPlayheadChange = useCallback((playheadUs: MediaTimeUs) => {
		setPreviewPlayheadUs((currentPlayheadUs) =>
			currentPlayheadUs === playheadUs ? currentPlayheadUs : playheadUs,
		);
	}, []);
	useEffect(() => {
		setPreviewPlayheadUs((currentPlayheadUs) =>
			activeAssetId === null || currentPlayheadUs !== 0 ? 0 : currentPlayheadUs,
		);
	}, [activeAssetId]);

	function handleLocalFileSelected(event: ChangeEvent<HTMLInputElement>) {
		const file = event.currentTarget.files?.[0];

		if (!file) {
			return;
		}

		event.currentTarget.blur();
		void stableCommands.importLocalFile(file);
	}

	function handleLocalFileDropped(event: DragEvent<HTMLElement>) {
		event.preventDefault();

		const file = event.dataTransfer.files[0];

		if (!file) {
			return;
		}

		void stableCommands.importLocalFile(file);
	}

	const readyMediaAssetContext =
		session.status === "ready" ? (
			<MediaAssetContextPanel
				asset={session.asset}
				closeFileDisabled={!canCloseEditorSession(session)}
				onCloseFileRequested={stableCommands.requestCloseFile}
				selection={session.selection}
			/>
		) : null;
	const selectionEditingDisabled =
		session.status === "ready" && session.export.status === "running";
	const readyAudioPanel =
		session.status === "ready" ? (
			<AudioPanel
				asset={session.asset}
				audioEditingDisabled={selectionEditingDisabled}
				audioMix={session.audioMix}
				onAudioTrackChannelModeChange={stableCommands.setAudioTrackChannelMode}
				onAudioTrackIncludedChange={stableCommands.setAudioTrackIncluded}
				onAudioTrackVolumePercentChange={
					stableCommands.setAudioTrackVolumePercent
				}
			/>
		) : null;
	const readyPreviewPlayer =
		session.status === "ready" && previewSource ? (
			<NativePreviewPlayer
				activeMediaAssetCleanupScope={activeMediaAssetCleanupScope ?? undefined}
				asset={session.asset}
				audioMix={session.audioMix}
				onAudioTrackIncludedChange={stableCommands.setAudioTrackIncluded}
				onSelectionEndRequested={stableCommands.setSelectionEndFromPlayhead}
				onSelectionRangeMoveRequested={stableCommands.moveSelectionRange}
				onSelectionReplaceRequested={stableCommands.setSelectionRange}
				onSelectionResetRequested={stableCommands.resetSelection}
				onSelectionStartRequested={stableCommands.setSelectionStartFromPlayhead}
				onPreviewPlayheadChange={handlePreviewPlayheadChange}
				selection={session.selection}
				selectionEditingDisabled={selectionEditingDisabled}
				shortcutsDisabled={selectionEditingDisabled}
				source={previewSource}
			/>
		) : null;
	const readyExportInspector =
		session.status === "ready" ? (
			<ExportInspectorPanel
				asset={session.asset}
				audioMix={session.audioMix}
				exportState={session.export}
				onCancelExport={stableCommands.cancelDefaultExport}
				onDownloadGeneratedMedia={stableCommands.downloadGeneratedMedia}
				onApplyOutputSettings={stableCommands.applyOutputSettings}
				onStartExport={() => {
					void stableCommands.startDefaultExport();
				}}
				outputSettings={session.outputSettings}
				runtime={session.runtime}
				selection={session.selection}
			/>
		) : null;

	const editorWorkbench = (
		<EditorWorkbenchFrame
			activeAsset={session.status === "ready" ? session.asset : null}
			previewStatus={
				session.status === "ready"
					? {
							playheadUs: previewPlayheadUs,
							selectionDurationUs:
								session.selection.endUs - session.selection.startUs,
						}
					: null
			}
			runtime={runtime}
			status={session.status}
		>
			{session.status === "unsupported-runtime" ? (
				<UnsupportedRuntimeState session={session} />
			) : (
				<EditorSessionShell
					audioPanel={readyAudioPanel}
					exportInspector={readyExportInspector}
					localFileInputKey={localFileInputKey}
					mediaAssetContext={readyMediaAssetContext}
					onLocalFileDropped={handleLocalFileDropped}
					onLocalFileSelected={handleLocalFileSelected}
					previewPlayer={readyPreviewPlayer}
					session={session}
				/>
			)}
		</EditorWorkbenchFrame>
	);

	return session.status === "ready" ? (
		<PreviewAudioMonitoringProvider assetId={session.asset.id}>
			<PreviewMeteringProvider
				asset={session.asset}
				audioMix={session.audioMix}
			>
				{editorWorkbench}
			</PreviewMeteringProvider>
		</PreviewAudioMonitoringProvider>
	) : (
		editorWorkbench
	);
}

function useStableEditorCommands(
	commands: SingleAssetEditingSessionCommands,
): SingleAssetEditingSessionCommands {
	const commandsRef = useRef(commands);
	commandsRef.current = commands;

	return useMemo(
		() => ({
			applyOutputSettings: (outputSettings) =>
				commandsRef.current.applyOutputSettings(outputSettings),
			cancelDefaultExport: () => commandsRef.current.cancelDefaultExport(),
			downloadGeneratedMedia: (generatedMedia) =>
				commandsRef.current.downloadGeneratedMedia(generatedMedia),
			importLocalFile: (file) => commandsRef.current.importLocalFile(file),
			moveSelectionRange: (deltaUs) =>
				commandsRef.current.moveSelectionRange(deltaUs),
			requestCloseFile: () => commandsRef.current.requestCloseFile(),
			resetSelection: () => commandsRef.current.resetSelection(),
			setAudioTrackChannelMode: (trackId, channelMode) =>
				commandsRef.current.setAudioTrackChannelMode(trackId, channelMode),
			setAudioTrackIncluded: (trackId, include) =>
				commandsRef.current.setAudioTrackIncluded(trackId, include),
			setAudioTrackVolumePercent: (trackId, volumePercent) =>
				commandsRef.current.setAudioTrackVolumePercent(trackId, volumePercent),
			setSelectionEndFromPlayhead: (playheadUs) =>
				commandsRef.current.setSelectionEndFromPlayhead(playheadUs),
			setSelectionRange: (selection) =>
				commandsRef.current.setSelectionRange(selection),
			setSelectionStartFromPlayhead: (playheadUs) =>
				commandsRef.current.setSelectionStartFromPlayhead(playheadUs),
			startDefaultExport: () => commandsRef.current.startDefaultExport(),
		}),
		[],
	);
}
