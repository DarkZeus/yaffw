import { useEffect, useRef, useState } from "react";
import { planDefaultExportCapability } from "@/editor-core/export-capability";
import { createEditorId } from "@/editor-core/identity";
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
import { resolveOutputPlan } from "@/editor-core/output-settings";
import type { RuntimeSupport } from "@/editor-core/runtime-capabilities";
import {
	type EditorSessionAction,
	type EditorSessionState,
	canChangeEditingDecisions,
	canCloseEditorSession,
	createInitialEditorSession,
	editorSessionReducer,
	shouldProtectEditorBeforeUnload,
} from "@/editor-core/session";
import { errorMessage } from "@/lib/error-message";
import { MEDIABUNNY_OUTPUT_SUPPORT } from "../../export/adapters/mediabunny-output-support";
import {
	type GeneratedMediaArtifact,
	deliverBrowserGeneratedMedia,
} from "../../export/generated-media/generated-media-delivery";
import { createGeneratedMediaMetadata } from "../../export/generated-media/generated-media-metadata";
import {
	browserDefaultExportRunner,
	isDefaultExportCancelledError,
} from "../../export/runners/default-export-runner";
import type { DefaultExportRunner } from "../../export/types/default-export-runner.types";
import { inspectBrowserLocalMediaAssetDraft } from "../../media-asset/adapters/browser-local-asset-analyzer";
import {
	type ActiveMediaAssetCleanupScope,
	type ActiveMediaAssetCleanupScopeController,
	createActiveMediaAssetCleanupScopeController,
} from "../../media-work/scopes/active-media-asset-cleanup-scope";
const closeFileConfirmationMessage =
	"Close this media asset? This clears the current selection, preview state, waveform state, and generated media result.";

export type SingleAssetEditingSessionCommands = {
	applyOutputSettings: (outputSettings: OutputSettings) => boolean;
	cancelDefaultExport: () => void;
	downloadGeneratedMedia: (generatedMedia: GeneratedMedia) => boolean;
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
	deliverGeneratedMedia?: (artifact: GeneratedMediaArtifact) => boolean;
	inspectLocalAsset?: LocalMediaAssetInspector;
	now?: () => number;
	runtime: RuntimeSupport;
};

export function useSingleAssetEditingSession({
	confirmCloseFile = defaultConfirmCloseFile,
	createAssetId,
	createDraftId,
	createExportJobId = () => createEditorId("export"),
	createGeneratedMediaId,
	defaultExportRunner = browserDefaultExportRunner,
	deliverGeneratedMedia = deliverBrowserGeneratedMedia,
	inspectLocalAsset = inspectBrowserLocalMediaAssetDraft,
	now,
	runtime,
}: UseSingleAssetEditingSessionOptions): SingleAssetEditingSession {
	const [session, setSession] = useState(() =>
		createInitialEditorSession(runtime),
	);
	const sessionRef = useRef(session);
	const activeMediaAssetCleanupControllerRef =
		useRef<ActiveMediaAssetCleanupScopeController | null>(null);
	const activeImportAnalysisAbortControllerRef = useRef<AbortController | null>(
		null,
	);
	const activeExportAbortControllerRef = useRef<AbortController | null>(null);
	const generatedMediaArtifactRef = useRef<GeneratedMediaArtifact | null>(null);
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
			abortActiveImportAnalysis();
			activeExportAbortControllerRef.current?.abort();
			activeExportAbortControllerRef.current = null;
			activeMediaAssetCleanupControllerRef.current?.disposeCurrentScope();
			generatedMediaArtifactRef.current = null;
		};
	}, []);

	function dispatch(
		action: EditorSessionAction,
		artifact = generatedMediaArtifactRef.current,
	) {
		const current = sessionRef.current;
		const next = editorSessionReducer(current, action);
		if (next === current) return;

		// Publish and retire the Blob with the exact result the reducer accepted.
		generatedMediaArtifactRef.current =
			next.status === "ready" &&
			next.export.status === "succeeded" &&
			artifact?.generatedMedia === next.export.generatedMedia
				? artifact
				: null;
		sessionRef.current = next;
		setSession(next);
	}

	function clearSessionLocalResources() {
		abortActiveImportAnalysis();
		activeExportAbortControllerRef.current?.abort();
		activeExportAbortControllerRef.current = null;
		getActiveMediaAssetCleanupController().disposeCurrentScope();
		setActiveMediaAssetCleanupScope(null);
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

		const abortController = new AbortController();
		activeImportAnalysisAbortControllerRef.current = abortController;

		try {
			const result = await analyzeLocalMediaAssetDraft(draft, {
				createAssetId,
				inspect: inspectLocalAsset,
				signal: abortController.signal,
			});

			if (
				activeImportAnalysisAbortControllerRef.current !== abortController ||
				abortController.signal.aborted
			) {
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
			if (activeImportAnalysisAbortControllerRef.current === abortController) {
				activeImportAnalysisAbortControllerRef.current = null;
			}
		}
	}

	async function startDefaultExport(): Promise<void> {
		const current = sessionRef.current;
		if (
			current.status !== "ready" ||
			current.export.status === "running" ||
			session.status !== "ready" ||
			current.asset !== session.asset ||
			!previewSource
		)
			return;

		const review = planDefaultExportCapability({
			asset: current.asset,
			output: resolveOutputPlan({
				asset: current.asset,
				audioMix: current.audioMix,
				outputSettings: current.outputSettings,
				support: MEDIABUNNY_OUTPUT_SUPPORT,
			}),
			outputSettings: current.outputSettings,
			runtime: current.runtime,
			selection: current.selection,
		});

		if (!review.supported) {
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
				audioMix: current.audioMix,
				onProgress: (progress) => {
					if (
						activeExportAbortControllerRef.current !== abortController ||
						abortController.signal.aborted
					)
						return;
					dispatch({
						jobId,
						progress,
						type: "export.progressed",
					});
				},
				resolvedOutput: review.resolvedOutput,
				selection: current.selection,
				signal: abortController.signal,
				source: previewSource,
			});

			if (activeExportAbortControllerRef.current !== abortController) return;
			if (abortController.signal.aborted) {
				dispatch({
					jobId,
					type: "export.cancelled",
				});
				return;
			}

			const generatedMedia = createGeneratedMediaMetadata({
				asset: current.asset,
				blob: result.blob,
				fileName: result.fileName,
				generatedMediaId: createGeneratedMediaId?.(),
				now,
				outputSettings: current.outputSettings,
				resolvedOutput: review.resolvedOutput,
				selection: current.selection,
			});

			dispatch(
				{ generatedMedia, jobId, type: "export.succeeded" },
				{ blob: result.blob, generatedMedia },
			);
		} catch (error) {
			if (activeExportAbortControllerRef.current !== abortController) return;
			if (
				abortController.signal.aborted ||
				(defaultExportRunner.cancelSupported &&
					isDefaultExportCancelledError(error))
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
				technicalDetails: errorMessage(error),
				type: "export.failed",
			});
		} finally {
			if (activeExportAbortControllerRef.current === abortController) {
				activeExportAbortControllerRef.current = null;
			}
		}
	}

	function cancelDefaultExport() {
		const current = sessionRef.current;
		const controller = activeExportAbortControllerRef.current;
		if (
			!controller ||
			current.status !== "ready" ||
			current.export.status !== "running" ||
			current.export.job.cancellation !== "available"
		)
			return;

		dispatch({
			jobId: current.export.job.id,
			type: "export.cancellation-requested",
		});
		controller.abort();
	}

	function downloadGeneratedMedia(generatedMedia: GeneratedMedia) {
		const artifact = generatedMediaArtifactRef.current;
		if (artifact?.generatedMedia !== generatedMedia) return false;

		try {
			if (!deliverGeneratedMedia(artifact)) return false;
		} catch {
			return false;
		}

		if (generatedMediaArtifactRef.current === artifact) {
			dispatch({
				generatedMediaId: generatedMedia.id,
				type: "generated-media.delivered",
			});
		}
		return true;
	}

	function requestCloseFile() {
		if (!canCloseEditorSession(sessionRef.current)) {
			return;
		}

		const confirmed = confirmCloseFile(closeFileConfirmationMessage);

		if (!confirmed) {
			return;
		}

		if (!canCloseEditorSession(sessionRef.current)) return;
		dispatch({ type: "session.closed" });
		clearSessionLocalResources();
		setLocalFileInputKey((currentKey) => currentKey + 1);
	}

	function getActiveMediaAssetCleanupController() {
		if (!activeMediaAssetCleanupControllerRef.current) {
			activeMediaAssetCleanupControllerRef.current =
				createActiveMediaAssetCleanupScopeController();
		}

		return activeMediaAssetCleanupControllerRef.current;
	}

	function abortActiveImportAnalysis() {
		activeImportAnalysisAbortControllerRef.current?.abort();
		activeImportAnalysisAbortControllerRef.current = null;
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

	function setSelectionRange(selection: Selection) {
		dispatch({
			selection,
			type: "selection.replaced",
		});
	}

	function resetSelection() {
		dispatch({
			type: "selection.reset",
		});
	}

	function setAudioTrackIncluded(trackId: string, include: boolean) {
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
		dispatch({
			channelMode,
			trackId,
			type: "audio.track.channelMode.set",
		});
	}

	function setAudioTrackVolumePercent(trackId: string, volumePercent: number) {
		dispatch({
			trackId,
			type: "audio.track.volume.set",
			volumePercent,
		});
	}

	function applyOutputSettings(outputSettings: OutputSettings) {
		const current = sessionRef.current;
		if (!canChangeEditingDecisions(current)) return false;

		const plan = resolveOutputPlan({
			asset: current.asset,
			audioMix: current.audioMix,
			outputSettings,
			support: MEDIABUNNY_OUTPUT_SUPPORT,
		});
		if (plan.kind === "invalid") return false;

		if (!areOutputSettingsEqual(current.outputSettings, outputSettings)) {
			dispatch({ outputSettings, type: "output-settings.applied" });
		}
		return true;
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

function defaultConfirmCloseFile(message: string): boolean {
	return window.confirm(message);
}
