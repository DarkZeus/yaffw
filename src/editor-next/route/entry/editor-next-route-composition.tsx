import { type ChangeEvent, useMemo, useRef } from "react";
import {
	WorkbenchInspectorTabs,
	useWorkbenchInspector,
} from "../../workbench/frame/workbench-inspector";

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
	const inspector = useWorkbenchInspector();

	function handleLocalFileSelected(event: ChangeEvent<HTMLInputElement>) {
		const file = event.currentTarget.files?.[0];

		if (!file) {
			return;
		}

		event.currentTarget.blur();
		void stableCommands.importLocalFile(file);
	}

	function handleLocalFileDropped(file: File) {
		void stableCommands.importLocalFile(file);
	}

	const selectionEditingDisabled =
		session.status === "ready" && session.export.status === "running";
	const readyInspector = useMemo(() => {
		const readyMediaAssetContext =
			session.status === "ready" ? (
				<MediaAssetContextPanel
					asset={session.asset}
					closeFileDisabled={!canCloseEditorSession(session)}
					onCloseFileRequested={stableCommands.requestCloseFile}
					selection={session.selection}
				/>
			) : null;
		const readyAudioPanel =
			session.status === "ready" ? (
				<AudioPanel
					asset={session.asset}
					audioEditingDisabled={selectionEditingDisabled}
					audioMix={session.audioMix}
					onAudioTrackChannelModeChange={
						stableCommands.setAudioTrackChannelMode
					}
					onAudioTrackIncludedChange={stableCommands.setAudioTrackIncluded}
					onAudioTrackVolumePercentChange={
						stableCommands.setAudioTrackVolumePercent
					}
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

		return session.status === "ready" ? (
			<WorkbenchInspectorTabs
				activeTab={inspector.activeTab}
				onTabChange={inspector.selectTab}
				audioPanel={readyAudioPanel}
				exportInspector={readyExportInspector}
				mediaAssetContext={readyMediaAssetContext}
			/>
		) : null;
	}, [
		session,
		stableCommands,
		selectionEditingDisabled,
		inspector.activeTab,
		inspector.selectTab,
	]);
	const readyPreviewPlayer =
		session.status === "ready" && previewSource ? (
			<NativePreviewPlayer
				inspector={readyInspector}
				activeMediaAssetCleanupScope={activeMediaAssetCleanupScope ?? undefined}
				asset={session.asset}
				audioMix={session.audioMix}
				onAudioTrackIncludedChange={stableCommands.setAudioTrackIncluded}
				onSelectionEndRequested={stableCommands.setSelectionEndFromPlayhead}
				onSelectionRangeMoveRequested={stableCommands.moveSelectionRange}
				onSelectionReplaceRequested={stableCommands.setSelectionRange}
				onSelectionResetRequested={stableCommands.resetSelection}
				onSelectionStartRequested={stableCommands.setSelectionStartFromPlayhead}
				selection={session.selection}
				selectionEditingDisabled={selectionEditingDisabled}
				shortcutsDisabled={selectionEditingDisabled}
				source={previewSource}
			/>
		) : null;

	const editorWorkbench = (
		<EditorWorkbenchFrame
			activeAsset={session.status === "ready" ? session.asset : null}
			runtime={runtime}
		>
			{session.status === "unsupported-runtime" ? (
				<UnsupportedRuntimeState session={session} />
			) : (
				<EditorSessionShell
					localFileInputKey={localFileInputKey}
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
