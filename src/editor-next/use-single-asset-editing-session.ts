import { useEffect, useReducer, useRef, useState } from "react";

import { planDefaultExportCapability } from "@/editor-core/export-capability";
import { analyzeLocalMediaAssetDraft } from "@/editor-core/local-file-analysis";
import { createLocalMediaAssetDraft } from "@/editor-core/local-file-import";
import type {
	AudioTrackChannelMode,
	GeneratedMedia,
	ReadyMediaAsset,
	Selection,
} from "@/editor-core/model";
import {
	canCloseEditorSession,
	createInitialEditorSession,
	editorSessionReducer,
	shouldProtectEditorBeforeUnload,
} from "@/editor-core/session";
import {
	createActiveMediaAssetCleanupScopeController,
	type ActiveMediaAssetCleanupScope,
	type ActiveMediaAssetCleanupScopeController,
} from "./active-media-asset-cleanup-scope";
import {
	createCancellableMediaTaskController,
	type CancellableMediaTaskController,
} from "./cancellable-media-task-controller";
import { isDefaultExportCancelledError } from "./default-export-runner";
import {
	createGeneratedMediaArtifactStore,
	type GeneratedMediaArtifactStore,
} from "./generated-media-artifact-store";
import type {
	SingleAssetEditingSession,
	UseSingleAssetEditingSessionOptions,
} from "./single-asset-editing-session.types";

const closeFileConfirmationMessage =
	"Close this media asset? This clears the current selection, preview state, waveform state, and generated media result.";

export function useSingleAssetEditingSession({
	confirmCloseFile = defaultConfirmCloseFile,
	createAssetId,
	createDraftId,
	createExportJobId,
	createGeneratedMediaId,
	defaultExportRunner,
	deliverGeneratedMedia,
	inspectLocalAsset,
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

		const draft = createLocalMediaAssetDraft(file, {
			createDraftId,
		});

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
			runtime: session.runtime,
			selection: session.selection,
		});

		if (!review.supported || session.export.status === "running") {
			return;
		}

		const jobId = createExportJobId();
		const abortController = new AbortController();
		activeExportAbortControllerRef.current = abortController;

		dispatch({
			cancelSupported: defaultExportRunner.cancelSupported,
			jobId,
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

			const generatedMedia = createGeneratedMedia({
				asset: session.asset,
				blob: result.blob,
				fileName: result.fileName,
				generatedMediaId: createGeneratedMediaId(),
				mimeType: result.mimeType,
				now,
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

		getGeneratedMediaArtifactStore().invalidate(session.export.generatedMedia.id);
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
			setSelectionStartFromPlayhead,
			startDefaultExport,
		},
		localFileInputKey,
		previewSource,
		session,
	};
}

function createGeneratedMedia({
	asset,
	blob,
	fileName,
	generatedMediaId,
	mimeType,
	now,
	selection,
}: {
	asset: ReadyMediaAsset;
	blob: Blob;
	fileName?: string;
	generatedMediaId: string;
	mimeType?: string;
	now: () => number;
	selection: Selection;
}): GeneratedMedia {
	return {
		assetId: asset.id,
		createdAtMs: now(),
		fileName:
			fileName ?? createGeneratedMediaFileName(asset.provenance.fileName),
		id: generatedMediaId,
		mimeType: mimeType ?? (blob.type || "video/mp4"),
		profile: asset.exportCapability.profile,
		selection: { ...selection },
		sizeBytes: blob.size,
	};
}

function createGeneratedMediaFileName(fileName: string): string {
	const extensionStart = fileName.lastIndexOf(".");

	if (extensionStart <= 0) {
		return `${fileName}-export.mp4`;
	}

	return `${fileName.slice(0, extensionStart)}-export.mp4`;
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
