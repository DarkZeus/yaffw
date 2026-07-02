import {
	type ChangeEvent,
	type DragEvent,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";

import type { MediaTimeUs } from "@/editor-core/model";
import { detectRuntimeSupport } from "@/editor-core/runtime-capabilities";
import { canCloseEditorSession } from "@/editor-core/session";
import type { EditorNextRouteProps } from "./EditorNextRoute.types";
import { AudioPanel } from "./audio-panel";
import { inspectBrowserLocalMediaAssetDraft } from "./browser-local-asset-analyzer";
import { browserDefaultExportRunner } from "./default-export-runner";
import {
	EditorSessionShell,
	EditorWorkbenchFrame,
	UnsupportedRuntimeState,
} from "./editor-workbench";
import {
	EDITOR_WORKBENCH_VISUAL_FIXTURE_PREVIEW_POSTER_SRC,
	createEditorWorkbenchVisualFixture,
	shouldUseEditorWorkbenchVisualFixtureFromUrl,
} from "./editor-workbench-visual-fixture";
import { ExportInspectorPanel } from "./export-inspector";
import { deliverBrowserGeneratedMedia } from "./generated-media-delivery";
import { MediaAssetContextPanel } from "./media-asset-context";
import { NativePreviewPlayer } from "./native-preview-player";
import { useSingleAssetEditingSession } from "./use-single-asset-editing-session";

export function EditorNextRoute({
	confirmCloseFile,
	createAssetId = () => createBrowserId("asset"),
	createDraftId = () => createBrowserId("draft"),
	createExportJobId = () => createBrowserId("export"),
	createGeneratedMediaId = () => createBrowserId("generated"),
	defaultExportRunner = browserDefaultExportRunner,
	deliverGeneratedMedia = deliverBrowserGeneratedMedia,
	initialRuntime,
	inspectLocalAsset = inspectBrowserLocalMediaAssetDraft,
	mockUploadedMediaState,
	now = () => Date.now(),
}: EditorNextRouteProps) {
	const runtime = useMemo(
		() => initialRuntime ?? detectRuntimeSupport(),
		[initialRuntime],
	);
	const {
		activeMediaAssetCleanupScope,
		commands,
		localFileInputKey,
		previewSource,
		session,
	} = useSingleAssetEditingSession({
		confirmCloseFile,
		createAssetId,
		createDraftId,
		createExportJobId,
		createGeneratedMediaId,
		defaultExportRunner,
		deliverGeneratedMedia,
		inspectLocalAsset,
		now,
		runtime,
	});
	const visualFixture = useMemo(
		() => createEditorWorkbenchVisualFixture(runtime),
		[runtime],
	);
	const visualFixtureActive =
		session.status === "empty" &&
		runtime.supported &&
		(mockUploadedMediaState ?? shouldUseEditorWorkbenchVisualFixtureFromUrl());
	const displayedSession = visualFixtureActive
		? visualFixture.session
		: session;
	const displayedPreviewSource = visualFixtureActive
		? visualFixture.source
		: previewSource;
	const displayedPreviewPosterSrc = visualFixtureActive
		? EDITOR_WORKBENCH_VISUAL_FIXTURE_PREVIEW_POSTER_SRC
		: undefined;
	const activeAssetId =
		displayedSession.status === "ready" ? displayedSession.asset.id : null;
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
		void commands.importLocalFile(file);
	}

	function handleLocalFileDropped(event: DragEvent<HTMLElement>) {
		event.preventDefault();

		const file = event.dataTransfer.files[0];

		if (!file) {
			return;
		}

		void commands.importLocalFile(file);
	}

	const readyMediaAssetContext =
		displayedSession.status === "ready" ? (
			<MediaAssetContextPanel
				asset={displayedSession.asset}
				closeFileDisabled={!canCloseEditorSession(displayedSession)}
				onCloseFileRequested={commands.requestCloseFile}
				selection={displayedSession.selection}
			/>
		) : null;
	const readyAudioPanel =
		displayedSession.status === "ready" ? (
			<AudioPanel asset={displayedSession.asset} />
		) : null;
	const selectionEditingDisabled =
		displayedSession.status === "ready" &&
		displayedSession.export.status === "running";
	const readyPreviewPlayer =
		displayedSession.status === "ready" && displayedPreviewSource ? (
			<NativePreviewPlayer
				activeMediaAssetCleanupScope={
					visualFixtureActive
						? undefined
						: (activeMediaAssetCleanupScope ?? undefined)
				}
				asset={displayedSession.asset}
				audioMix={displayedSession.audioMix}
				onAudioTrackChannelModeChange={commands.setAudioTrackChannelMode}
				onAudioTrackIncludedChange={commands.setAudioTrackIncluded}
				onAudioTrackVolumePercentChange={commands.setAudioTrackVolumePercent}
				onSelectionEndRequested={commands.setSelectionEndFromPlayhead}
				onSelectionRangeMoveRequested={commands.moveSelectionRange}
				onSelectionReplaceRequested={commands.setSelectionRange}
				onSelectionResetRequested={commands.resetSelection}
				onSelectionStartRequested={commands.setSelectionStartFromPlayhead}
				onPreviewPlayheadChange={handlePreviewPlayheadChange}
				previewPosterSrc={displayedPreviewPosterSrc}
				selection={displayedSession.selection}
				selectionEditingDisabled={selectionEditingDisabled}
				shortcutsDisabled={selectionEditingDisabled}
				source={displayedPreviewSource}
			/>
		) : null;
	const readyExportInspector =
		displayedSession.status === "ready" ? (
			<ExportInspectorPanel
				asset={displayedSession.asset}
				exportState={displayedSession.export}
				onCancelExport={commands.cancelDefaultExport}
				onDownloadGeneratedMedia={commands.downloadGeneratedMedia}
				onStartExport={() => {
					void commands.startDefaultExport();
				}}
				runtime={displayedSession.runtime}
				selection={displayedSession.selection}
			/>
		) : null;

	return (
		<EditorWorkbenchFrame
			activeAsset={
				displayedSession.status === "ready" ? displayedSession.asset : null
			}
			previewStatus={
				displayedSession.status === "ready"
					? {
							playheadUs: previewPlayheadUs,
							selectionDurationUs:
								displayedSession.selection.endUs -
								displayedSession.selection.startUs,
						}
					: null
			}
			runtime={runtime}
			status={displayedSession.status}
		>
			{displayedSession.status === "unsupported-runtime" ? (
				<UnsupportedRuntimeState session={displayedSession} />
			) : (
				<EditorSessionShell
					audioPanel={readyAudioPanel}
					exportInspector={readyExportInspector}
					localFileInputKey={localFileInputKey}
					mediaAssetContext={readyMediaAssetContext}
					onLocalFileDropped={handleLocalFileDropped}
					onLocalFileSelected={handleLocalFileSelected}
					previewPlayer={readyPreviewPlayer}
					session={displayedSession}
				/>
			)}
		</EditorWorkbenchFrame>
	);
}

function createBrowserId(prefix: string): string {
	if (
		"crypto" in globalThis &&
		typeof globalThis.crypto.randomUUID === "function"
	) {
		return `${prefix}-${globalThis.crypto.randomUUID()}`;
	}

	return `${prefix}-${Date.now().toString(36)}-${Math.random()
		.toString(36)
		.slice(2)}`;
}
