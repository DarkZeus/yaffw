import { useEffect, useReducer, useRef, useState } from "react";

import { planDefaultExportCapability } from "@/editor-core/export-capability";
import {
	type LocalMediaAssetInspector,
	analyzeLocalMediaAssetDraft,
} from "@/editor-core/local-file-analysis";
import { createLocalMediaAssetDraft } from "@/editor-core/local-file-import";
import type {
	AudioTrackChannelMode,
	GeneratedMedia,
	OutputSettings,
	Selection,
} from "@/editor-core/model";
import { areOutputSettingsEqual } from "@/editor-core/model";
import type { RuntimeSupport } from "@/editor-core/runtime-capabilities";
import {
	type EditorSessionState,
	canCloseEditorSession,
	createInitialEditorSession,
	editorSessionReducer,
	shouldProtectEditorBeforeUnload,
} from "@/editor-core/session";
import { MEDIABUNNY_OUTPUT_SUPPORT } from "../../export/adapters/mediabunny-output-support";
import {
	type GeneratedMediaArtifactStore,
	createGeneratedMediaArtifactStore,
} from "../../export/generated-media/generated-media-artifact-store";
import { deliverBrowserGeneratedMedia } from "../../export/generated-media/generated-media-delivery";
import { createGeneratedMediaMetadata } from "../../export/generated-media/generated-media-metadata";
import {
	browserDefaultExportRunner,
	isDefaultExportCancelledError,
} from "../../export/runners/default-export-runner";
import type { DefaultExportRunner } from "../../export/types/default-export-runner.types";
import type { GeneratedMediaDeliveryRequest } from "../../export/types/generated-media-delivery.types";
import { inspectBrowserLocalMediaAssetDraft } from "../../media-asset/adapters/browser-local-asset-analyzer";
import {
	type ActiveMediaAssetCleanupScope,
	type ActiveMediaAssetCleanupScopeController,
	createActiveMediaAssetCleanupScopeController,
} from "../../media-work/scopes/active-media-asset-cleanup-scope";
import {
	type CancellableMediaTaskController,
	createCancellableMediaTaskController,
} from "../../media-work/tasks/cancellable-media-task-controller";
const closeFileConfirmationMessage =
	"Close this media asset? This clears the current selection, preview state, waveform state, and generated media result.";

export type SingleAssetEditingSessionCommands = {
	applyOutputSettings: (outputSettings: OutputSettings) => void;
	cancelDefaultExport: () => void;
	downloadGeneratedMedia: (generatedMedia: GeneratedMedia) => void;
	importLocalFile: (file: File) => Promise<void>;
	moveSelectionRange: (deltaUs: number) => void;
	requestCloseFile: () => void;
	resetSelection: () => void;
	setAudioTrackChannelMode: (
		trackId: string,
		channelMode: AudioTrackChannelMode,
	) => void;
	setAudioTrackIncluded: (trackId: string, include: boolean) => void;
	setAudioTrackVolumePercent: (trackId: string, volumePercent: number) => void;
	setSelectionEndFromPlayhead: (playheadUs: number) => void;
	setSelectionRange: (selection: Selection) => void;
	setSelectionStartFromPlayhead: (playheadUs: number) => void;
	startDefaultExport: () => Promise<void>;
};

export type SingleAssetEditingSession = {
	activeMediaAssetCleanupScope: ActiveMediaAssetCleanupScope | null;
	commands: SingleAssetEditingSessionCommands;
	localFileInputKey: number;
	previewSource: Blob | null;
	session: EditorSessionState;
};

export type UseSingleAssetEditingSessionOptions = {
	confirmCloseFile?: (message: string) => boolean;
	createAssetId?: () => string;
	createDraftId?: () => string;
	createExportJobId?: () => string;
	createGeneratedMediaId?: () => string;
	defaultExportRunner?: DefaultExportRunner;
	deliverGeneratedMedia?: (request: GeneratedMediaDeliveryRequest) => void;
	inspectLocalAsset?: LocalMediaAssetInspector;
	now?: () => number;
	runtime: RuntimeSupport;
};

export function useSingleAssetEditingSession({
	confirmCloseFile = defaultConfirmCloseFile,
	createAssetId,
	createDraftId,
	createExportJobId = createSessionExportJobId,
	createGeneratedMediaId,
	defaultExportRunner = browserDefaultExportRunner,
	deliverGeneratedMedia = deliverBrowserGeneratedMedia,
	inspectLocalAsset = inspectBrowserLocalMediaAssetDraft,
	now,
	runtime,
}: UseSingleAssetEditingSessionOptions): SingleAssetEditingSession {
	const [session, dispatch] = useReducer(
		editorSessionReducer,
		runtime,
		createInitialEditorSession,
	);
	const activeMediaAssetCleanupControllerRef =
		useRef<ActiveMediaAssetCleanupScopeController | null>(null);
	const activeImportAnalysisTaskControllerRef =
		useRef<CancellableMediaTaskController | null>(null);
	const activeExportAbortControllerRef = useRef<AbortController | null>(null);
	const generatedMediaArtifactStoreRef =
		useRef<GeneratedMediaArtifactStore | null>(null);
	const [activeMediaAssetCleanupScope, setActiveMediaAssetCleanupScope] =
		useState<ActiveMediaAssetCleanupScope | null>(null);
	const [previewSource, setPreviewSource] = useState<Blob | null>(null);
	const [localFileInputKey, setLocalFileInputKey] = useState(0);
	const protectBeforeUnload = shouldProtectEditorBeforeUnload(session);

	useEffect(() => {
		if (!protectBeforeUnload) {
			return;
		}

		function handleBeforeUnload(event: BeforeUnloadEvent) {
			event.preventDefault();
			event.returnValue = "";
		}

		window.addEventListener("beforeunload", handleBeforeUnload);

		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
		};
	}, [protectBeforeUnload]);

	useEffect(() => {
		return () => {
			activeImportAnalysisTaskControllerRef.current?.cancelCurrentTask();
			activeExportAbortControllerRef.current?.abort();
			activeExportAbortControllerRef.current = null;
			activeMediaAssetCleanupControllerRef.current?.disposeCurrentScope();
			generatedMediaArtifactStoreRef.current?.clear();
		};
	}, []);

	function clearSessionLocalResources() {
		activeImportAnalysisTaskControllerRef.current?.cancelCurrentTask();
		activeExportAbortControllerRef.current?.abort();
		activeExportAbortControllerRef.current = null;
		getActiveMediaAssetCleanupController().disposeCurrentScope();
		setActiveMediaAssetCleanupScope(null);
		getGeneratedMediaArtifactStore().clear();
		setPreviewSource(null);
	}

	async function importLocalFile(file: File): Promise<void> {
		if (!session.importEnabled) {
			return;
		}

		clearSessionLocalResources();

		const draft = createLocalMediaAssetDraft(
			file,
			createDraftId ? { createDraftId } : undefined,
		);

		dispatch({
			draft,
			type: "import.started",
		});

		const analysisTask = getActiveImportAnalysisTaskController().startTask();

		try {
			const result = await analyzeLocalMediaAssetDraft(draft, {
				createAssetId,
				inspect: inspectLocalAsset,
				runtime,
			});

			if (!analysisTask.isCurrent()) {
				return;
			}

			if (result.status === "ready") {
				const cleanupScope =
					getActiveMediaAssetCleanupController().replaceCurrentScope(
						result.asset.id,
					);
				setActiveMediaAssetCleanupScope(cleanupScope);
				setPreviewSource(file);
				dispatch({
					asset: result.asset,
					selection: result.selection,
					type: "asset.ready",
				});
				return;
			}

			setPreviewSource(null);
			dispatch({
				message: result.failure.message,
				technicalDetails: result.failure.technicalDetails,
				type: "session.failed",
			});
		} finally {
			analysisTask.finish();
		}
	}

	async function startDefaultExport(): Promise<void> {
		if (session.status !== "ready" || !previewSource) {
			return;
		}

		const review = planDefaultExportCapability({
			asset: session.asset,
			audioMix: session.audioMix,
			outputSettings: session.outputSettings,
			runtime: session.runtime,
			selection: session.selection,
			support: MEDIABUNNY_OUTPUT_SUPPORT,
		});

		if (
			!review.supported ||
			!review.resolvedOutput ||
			session.export.status === "running"
		) {
			return;
		}

		const jobId = createExportJobId();
		const abortController = new AbortController();
		activeExportAbortControllerRef.current = abortController;

		dispatch({
			cancelSupported: defaultExportRunner.cancelSupported,
			jobId,
			review,
			type: "export.started",
		});

		try {
			const result = await defaultExportRunner.run({
				asset: session.asset,
				audioMix: session.audioMix,
				onProgress: (progress) => {
					dispatch({
						jobId,
						progress,
						type: "export.progressed",
					});
				},
				outputSettings: session.outputSettings,
				resolvedOutput: review.resolvedOutput,
				selection: session.selection,
				signal: abortController.signal,
				source: previewSource,
			});

			if (abortController.signal.aborted) {
				dispatch({
					jobId,
					type: "export.cancelled",
				});
				return;
			}

			const generatedMedia = createGeneratedMediaMetadata({
				asset: session.asset,
				blob: result.blob,
				fileName: result.fileName,
				generatedMediaId: createGeneratedMediaId?.(),
				now,
				outputSettings: session.outputSettings,
				resolvedOutput: review.resolvedOutput,
				selection: session.selection,
			});

			getGeneratedMediaArtifactStore().retain({
				blob: result.blob,
				generatedMedia,
			});
			dispatch({
				generatedMedia,
				jobId,
				type: "export.succeeded",
			});
		} catch (error) {
			if (
				abortController.signal.aborted ||
				isDefaultExportCancelledError(error)
			) {
				dispatch({
					jobId,
					type: "export.cancelled",
				});
				return;
			}

			dispatch({
				jobId,
				message: "Default export failed.",
				technicalDetails: errorToMessage(error),
				type: "export.failed",
			});
		} finally {
			if (activeExportAbortControllerRef.current === abortController) {
				activeExportAbortControllerRef.current = null;
			}
		}
	}

	function cancelDefaultExport() {
		if (
			session.status !== "ready" ||
			session.export.status !== "running" ||
			!session.export.job.cancelSupported
		) {
			return;
		}

		activeExportAbortControllerRef.current?.abort();
	}

	function downloadGeneratedMedia(generatedMedia: GeneratedMedia) {
		const delivered = getGeneratedMediaArtifactStore().deliver({
			deliver: deliverGeneratedMedia,
			generatedMedia,
		});

		if (!delivered) {
			return;
		}

		dispatch({
			generatedMediaId: generatedMedia.id,
			type: "generated-media.delivered",
		});
	}

	function requestCloseFile() {
		if (!canCloseEditorSession(session)) {
			return;
		}

		const confirmed = confirmCloseFile(closeFileConfirmationMessage);

		if (!confirmed) {
			return;
		}

		clearSessionLocalResources();
		setLocalFileInputKey((currentKey) => currentKey + 1);
		dispatch({
			type: "session.closed",
		});
	}

	function getActiveMediaAssetCleanupController() {
		if (!activeMediaAssetCleanupControllerRef.current) {
			activeMediaAssetCleanupControllerRef.current =
				createActiveMediaAssetCleanupScopeController();
		}

		return activeMediaAssetCleanupControllerRef.current;
	}

	function getActiveImportAnalysisTaskController() {
		if (!activeImportAnalysisTaskControllerRef.current) {
			activeImportAnalysisTaskControllerRef.current =
				createCancellableMediaTaskController();
		}

		return activeImportAnalysisTaskControllerRef.current;
	}

	function setSelectionStartFromPlayhead(playheadUs: number) {
		invalidateCurrentGeneratedMediaArtifact();
		dispatch({
			playheadUs,
			type: "selection.start.setFromPlayhead",
		});
	}

	function setSelectionEndFromPlayhead(playheadUs: number) {
		invalidateCurrentGeneratedMediaArtifact();
		dispatch({
			playheadUs,
			type: "selection.end.setFromPlayhead",
		});
	}

	function moveSelectionRange(deltaUs: number) {
		invalidateCurrentGeneratedMediaArtifact();
		dispatch({
			deltaUs,
			type: "selection.range.moved",
		});
	}

	function setSelectionRange(selection: Selection) {
		invalidateCurrentGeneratedMediaArtifact();
		dispatch({
			selection,
			type: "selection.replaced",
		});
	}

	function resetSelection() {
		invalidateCurrentGeneratedMediaArtifact();
		dispatch({
			type: "selection.reset",
		});
	}

	function setAudioTrackIncluded(trackId: string, include: boolean) {
		invalidateCurrentGeneratedMediaArtifactForAudioTrack(trackId);
		dispatch({
			include,
			trackId,
			type: "audio.track.include.set",
		});
	}

	function setAudioTrackChannelMode(
		trackId: string,
		channelMode: AudioTrackChannelMode,
	) {
		invalidateCurrentGeneratedMediaArtifactForAudioTrack(trackId);
		dispatch({
			channelMode,
			trackId,
			type: "audio.track.channelMode.set",
		});
	}

	function setAudioTrackVolumePercent(trackId: string, volumePercent: number) {
		invalidateCurrentGeneratedMediaArtifactForAudioTrack(trackId);
		dispatch({
			trackId,
			type: "audio.track.volume.set",
			volumePercent,
		});
	}

	function applyOutputSettings(outputSettings: OutputSettings) {
		if (
			session.status !== "ready" ||
			areOutputSettingsEqual(session.outputSettings, outputSettings)
		) {
			return;
		}

		invalidateCurrentGeneratedMediaArtifact();
		dispatch({
			outputSettings,
			type: "output-settings.applied",
		});
	}

	function getGeneratedMediaArtifactStore() {
		if (!generatedMediaArtifactStoreRef.current) {
			generatedMediaArtifactStoreRef.current =
				createGeneratedMediaArtifactStore();
		}

		return generatedMediaArtifactStoreRef.current;
	}

	function invalidateCurrentGeneratedMediaArtifact() {
		if (session.status !== "ready" || session.export.status !== "succeeded") {
			return;
		}

		getGeneratedMediaArtifactStore().invalidate(
			session.export.generatedMedia.id,
		);
	}

	function invalidateCurrentGeneratedMediaArtifactForAudioTrack(
		trackId: string,
	) {
		if (session.status !== "ready" || !session.audioMix.tracks[trackId]) {
			return;
		}

		invalidateCurrentGeneratedMediaArtifact();
	}

	return {
		activeMediaAssetCleanupScope,
		commands: {
			applyOutputSettings,
			cancelDefaultExport,
			downloadGeneratedMedia,
			importLocalFile,
			moveSelectionRange,
			requestCloseFile,
			resetSelection,
			setAudioTrackChannelMode,
			setAudioTrackIncluded,
			setAudioTrackVolumePercent,
			setSelectionEndFromPlayhead,
			setSelectionRange,
			setSelectionStartFromPlayhead,
			startDefaultExport,
		},
		localFileInputKey,
		previewSource,
		session,
	};
}

function errorToMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

function defaultConfirmCloseFile(message: string): boolean {
	return window.confirm(message);
}

function createSessionExportJobId(): string {
	if (
		"crypto" in globalThis &&
		typeof globalThis.crypto.randomUUID === "function"
	) {
		return `export-${globalThis.crypto.randomUUID()}`;
	}

	return `export-${Date.now().toString(36)}-${Math.random()
		.toString(36)
		.slice(2)}`;
}
