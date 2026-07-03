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
import type { LivePreviewMeteringClock } from "./preview-metering-live";
import type { SingleAssetEditingSessionCommands } from "./single-asset-editing-session.types";
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
	const stableCommands = useStableEditorCommands(commands);
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
	const [previewMeteringClock, setPreviewMeteringClock] =
		useState<LivePreviewMeteringClock | null>(null);
	const [previewMeteringRetry, setPreviewMeteringRetry] = useState<
		((trackId: string) => void) | null
	>(null);
	const [soloedAudioTrackId, setSoloedAudioTrackId] = useState<string | null>(
		null,
	);
	const previewMetering = useMemo(
		() => ({
			clock: previewMeteringClock,
			onTrackRetry: previewMeteringRetry ?? undefined,
		}),
		[previewMeteringClock, previewMeteringRetry],
	);
	const handlePreviewPlayheadChange = useCallback((playheadUs: MediaTimeUs) => {
		setPreviewPlayheadUs((currentPlayheadUs) =>
			currentPlayheadUs === playheadUs ? currentPlayheadUs : playheadUs,
		);
	}, []);
	const handleSoloedAudioTrackChange = useCallback((trackId: string | null) => {
		setSoloedAudioTrackId((currentTrackId) =>
			currentTrackId === trackId ? currentTrackId : trackId,
		);
	}, []);
	const handlePreviewMeteringClockChange = useCallback(
		(clock: LivePreviewMeteringClock | null) => {
			setPreviewMeteringClock((currentClock) =>
				currentClock === clock ? currentClock : clock,
			);
		},
		[],
	);
	const handlePreviewMeteringRetryChange = useCallback(
		(retryTrack: ((trackId: string) => void) | null) => {
			setPreviewMeteringRetry(() => retryTrack);
		},
		[],
	);

	useEffect(() => {
		setPreviewPlayheadUs((currentPlayheadUs) =>
			activeAssetId === null || currentPlayheadUs !== 0 ? 0 : currentPlayheadUs,
		);
		setSoloedAudioTrackId((currentTrackId) =>
			activeAssetId === null || currentTrackId !== null ? null : currentTrackId,
		);
		setPreviewMeteringClock((currentClock) =>
			activeAssetId === null ? null : currentClock,
		);
		if (activeAssetId === null) {
			setPreviewMeteringRetry(null);
		}
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
		displayedSession.status === "ready" ? (
			<MediaAssetContextPanel
				asset={displayedSession.asset}
				closeFileDisabled={!canCloseEditorSession(displayedSession)}
				onCloseFileRequested={stableCommands.requestCloseFile}
				selection={displayedSession.selection}
			/>
		) : null;
	const selectionEditingDisabled =
		displayedSession.status === "ready" &&
		displayedSession.export.status === "running";
	const readyAudioPanel =
		displayedSession.status === "ready" ? (
			<AudioPanel
				asset={displayedSession.asset}
				audioEditingDisabled={selectionEditingDisabled}
				audioMix={displayedSession.audioMix}
				onAudioTrackChannelModeChange={stableCommands.setAudioTrackChannelMode}
				onAudioTrackIncludedChange={stableCommands.setAudioTrackIncluded}
				onAudioTrackVolumePercentChange={
					stableCommands.setAudioTrackVolumePercent
				}
				previewMetering={previewMetering}
				onSoloedAudioTrackChange={handleSoloedAudioTrackChange}
				soloedAudioTrackId={soloedAudioTrackId}
			/>
		) : null;
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
				onAudioTrackIncludedChange={stableCommands.setAudioTrackIncluded}
				onSoloedAudioTrackChange={handleSoloedAudioTrackChange}
				onSelectionEndRequested={stableCommands.setSelectionEndFromPlayhead}
				onSelectionRangeMoveRequested={stableCommands.moveSelectionRange}
				onSelectionReplaceRequested={stableCommands.setSelectionRange}
				onSelectionResetRequested={stableCommands.resetSelection}
				onSelectionStartRequested={stableCommands.setSelectionStartFromPlayhead}
				onPreviewMeteringClockChange={handlePreviewMeteringClockChange}
				onPreviewMeteringRetryChange={handlePreviewMeteringRetryChange}
				onPreviewPlayheadChange={handlePreviewPlayheadChange}
				previewPosterSrc={displayedPreviewPosterSrc}
				selection={displayedSession.selection}
				selectionEditingDisabled={selectionEditingDisabled}
				shortcutsDisabled={selectionEditingDisabled}
				soloedAudioTrackId={soloedAudioTrackId}
				source={displayedPreviewSource}
			/>
		) : null;
	const readyExportInspector =
		displayedSession.status === "ready" ? (
			<ExportInspectorPanel
				asset={displayedSession.asset}
				exportState={displayedSession.export}
				onCancelExport={stableCommands.cancelDefaultExport}
				onDownloadGeneratedMedia={stableCommands.downloadGeneratedMedia}
				onStartExport={() => {
					void stableCommands.startDefaultExport();
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

function useStableEditorCommands(
	commands: SingleAssetEditingSessionCommands,
): SingleAssetEditingSessionCommands {
	const commandsRef = useRef(commands);
	commandsRef.current = commands;

	return useMemo(
		() => ({
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
