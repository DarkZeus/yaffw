import { type ChangeEvent, type DragEvent, useMemo } from "react";

import type { LocalMediaAssetInspector } from "@/editor-core/local-file-analysis";
import type { ReadyMediaAsset } from "@/editor-core/model";
import {
	type RuntimeSupport,
	detectRuntimeSupport,
} from "@/editor-core/runtime-capabilities";
import {
	type EditorSessionState,
	canCloseEditorSession,
} from "@/editor-core/session";
import { inspectBrowserLocalMediaAssetDraft } from "./browser-local-asset-analyzer";
import {
	type DefaultExportRunner,
	browserDefaultExportRunner,
} from "./default-export-runner";
import {
	EditorSessionShell,
	EditorWorkbenchFrame,
	UnsupportedRuntimeState,
} from "./editor-workbench";
import { ExportInspectorPanel } from "./export-inspector";
import {
	type GeneratedMediaDeliveryRequest,
	deliverBrowserGeneratedMedia,
} from "./generated-media-delivery";
import { MediaAssetContextPanel } from "./media-asset-context";
import { NativePreviewPlayer } from "./native-preview-player";
import { useSingleAssetEditingSession } from "./use-single-asset-editing-session";

type EditorNextRouteProps = {
	confirmCloseFile?: (message: string) => boolean;
	createAssetId?: () => string;
	createDraftId?: () => string;
	createExportJobId?: () => string;
	createGeneratedMediaId?: () => string;
	defaultExportRunner?: DefaultExportRunner;
	deliverGeneratedMedia?: (request: GeneratedMediaDeliveryRequest) => void;
	initialRuntime?: RuntimeSupport;
	inspectLocalAsset?: LocalMediaAssetInspector;
	mockUploadedMediaState?: boolean;
	now?: () => number;
};

const mockUploadedMediaPreviewPosterSrc =
	"/editor-workbench-prototype-frame.jpg";

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
	const { commands, localFileInputKey, previewSource, session } =
		useSingleAssetEditingSession({
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
		() => createMockUploadedMediaFixture(runtime),
		[runtime],
	);
	const visualFixtureActive =
		session.status === "empty" &&
		runtime.supported &&
		(mockUploadedMediaState ?? shouldUseMockUploadedMediaStateFromUrl());
	const displayedSession = visualFixtureActive
		? visualFixture.session
		: session;
	const displayedPreviewSource = visualFixtureActive
		? visualFixture.source
		: previewSource;
	const displayedPreviewPosterSrc = visualFixtureActive
		? mockUploadedMediaPreviewPosterSrc
		: undefined;

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
	const selectionEditingDisabled =
		displayedSession.status === "ready" &&
		displayedSession.export.status === "running";
	const readyPreviewPlayer =
		displayedSession.status === "ready" && displayedPreviewSource ? (
			<NativePreviewPlayer
				asset={displayedSession.asset}
				onSelectionEndRequested={commands.setSelectionEndFromPlayhead}
				onSelectionRangeMoveRequested={commands.moveSelectionRange}
				onSelectionResetRequested={commands.resetSelection}
				onSelectionStartRequested={commands.setSelectionStartFromPlayhead}
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
			runtime={runtime}
			status={displayedSession.status}
		>
			{displayedSession.status === "unsupported-runtime" ? (
				<UnsupportedRuntimeState session={displayedSession} />
			) : (
				<EditorSessionShell
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

function createMockUploadedMediaFixture(runtime: RuntimeSupport): {
	session: Extract<EditorSessionState, { status: "ready" }>;
	source: Blob;
} {
	const asset: ReadyMediaAsset = {
		durationUs: 13_500_000,
		exportCapability: {
			profile: {
				audioCodec: "aac",
				container: "mp4",
				videoCodec: "h264",
			},
			supported: true,
		},
		frameTiming: {
			fps: 60,
			frameDurationUs: 16_667,
			source: "known",
		},
		id: "asset-editor-next-visual-fixture",
		label: "stalker-patch-1.5-teaser.mp4",
		provenance: {
			fileName: "stalker-patch-1.5-teaser.mp4",
			mimeType: "video/mp4",
			sizeBytes: 30_000_000,
		},
		tracks: {
			audio: [
				{
					channels: 2,
					codec: "aac",
					id: "audio-fixture-voice",
					kind: "audio",
					label: "Voice",
					language: "en",
					sampleRate: 48_000,
				},
				{
					channels: 2,
					codec: "aac",
					id: "audio-fixture-desktop",
					kind: "audio",
					label: "Desktop",
					language: "und",
					sampleRate: 48_000,
				},
			],
			video: [
				{
					codec: "h264",
					height: 2160,
					id: "video-fixture-main",
					kind: "video",
					label: "Video 1",
					width: 3840,
				},
			],
		},
	};

	return {
		session: {
			asset,
			export: {
				status: "reviewing",
			},
			importEnabled: false,
			runtime,
			selection: {
				endUs: 9_860_000,
				startUs: 2_440_000,
			},
			status: "ready",
		},
		source: new Blob(["editor-next visual fixture"], {
			type: "video/mp4",
		}),
	};
}

function shouldUseMockUploadedMediaStateFromUrl(): boolean {
	if (typeof window === "undefined") {
		return false;
	}

	return (
		new URLSearchParams(window.location.search).get("mockUploadedMedia") === "1"
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
