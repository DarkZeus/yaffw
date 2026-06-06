import { useEffect, useReducer, useRef, useState } from "react";

import { planDefaultExportCapability } from "@/editor-core/export-capability";
import { analyzeLocalMediaAssetDraft } from "@/editor-core/local-file-analysis";
import { createLocalMediaAssetDraft } from "@/editor-core/local-file-import";
import type {
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
import { isDefaultExportCancelledError } from "./default-export-runner";
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
	const activeExportAbortControllerRef = useRef<AbortController | null>(null);
	const [generatedMediaBlobs, setGeneratedMediaBlobs] = useState<
		Record<string, Blob>
	>({});
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
			activeExportAbortControllerRef.current?.abort();
			activeExportAbortControllerRef.current = null;
		};
	}, []);

	function clearSessionLocalResources() {
		activeExportAbortControllerRef.current?.abort();
		activeExportAbortControllerRef.current = null;
		setGeneratedMediaBlobs({});
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

		const result = await analyzeLocalMediaAssetDraft(draft, {
			createAssetId,
			inspect: inspectLocalAsset,
			runtime,
		});

		if (result.status === "ready") {
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

			setGeneratedMediaBlobs((currentBlobs) => ({
				...currentBlobs,
				[generatedMedia.id]: result.blob,
			}));
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
		const blob = generatedMediaBlobs[generatedMedia.id];

		if (!blob) {
			return;
		}

		deliverGeneratedMedia({
			blob,
			generatedMedia,
		});
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

	function setSelectionStartFromPlayhead(playheadUs: number) {
		dispatch({
			playheadUs,
			type: "selection.start.setFromPlayhead",
		});
	}

	function setSelectionEndFromPlayhead(playheadUs: number) {
		dispatch({
			playheadUs,
			type: "selection.end.setFromPlayhead",
		});
	}

	function moveSelectionRange(deltaUs: number) {
		dispatch({
			deltaUs,
			type: "selection.range.moved",
		});
	}

	function resetSelection() {
		dispatch({
			type: "selection.reset",
		});
	}

	return {
		commands: {
			cancelDefaultExport,
			downloadGeneratedMedia,
			importLocalFile,
			moveSelectionRange,
			requestCloseFile,
			resetSelection,
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
