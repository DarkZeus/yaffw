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
	MediaAssetDraft,
	ReadyMediaAsset,
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

type ReadyMediaPreview = {
	asset: ReadyMediaAsset;
	cleanupScope: ActiveMediaAssetCleanupScope;
	source: File;
};

type EditingSessionView = {
	preview: ReadyMediaPreview | null;
	session: EditorSessionState;
};

type PendingMediaAnalysis = {
	controller: AbortController;
	draft: MediaAssetDraft;
};

export type SingleAssetEditingSession = EditingSessionView & {
	commands: SingleAssetEditingSessionCommands;
	localFileInputKey: number;
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
	const [view, setView] = useState<EditingSessionView>(() => ({
		preview: null,
		session: createInitialEditorSession(runtime),
	}));
	const viewRef = useRef(view);
	const [previewScopes] = useState(
		createActiveMediaAssetCleanupScopeController,
	);
	const activeImportRef = useRef<PendingMediaAnalysis | null>(null);
	const activeExportAbortControllerRef = useRef<AbortController | null>(null);
	const generatedMediaArtifactRef = useRef<GeneratedMediaArtifact | null>(null);
	const [localFileInputKey, setLocalFileInputKey] = useState(0);
	const protectBeforeUnload = shouldProtectEditorBeforeUnload(view.session);

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
			const analysis = activeImportRef.current;
			const exportController = activeExportAbortControllerRef.current;
			activeImportRef.current = null;
			activeExportAbortControllerRef.current = null;
			viewRef.current = { ...viewRef.current, preview: null };
			generatedMediaArtifactRef.current = null;
			analysis?.controller.abort();
			exportController?.abort();
			previewScopes.disposeCurrentScope();
		};
	}, [previewScopes]);

	function dispatch(
		action: EditorSessionAction,
		resources: {
			artifact?: GeneratedMediaArtifact;
			preview?: ReadyMediaPreview;
		} = {},
	) {
		const current = viewRef.current;
		const next = editorSessionReducer(current.session, action);
		if (next === current.session) {
			resources.preview?.cleanupScope.dispose();
			return;
		}

		// Publish browser resources with the exact asset and result the reducer accepted.
		const candidate = resources.preview ?? current.preview;
		const preview =
			next.status === "ready" && candidate?.asset === next.asset
				? candidate
				: null;
		const artifact = resources.artifact ?? generatedMediaArtifactRef.current;
		generatedMediaArtifactRef.current =
			next.status === "ready" &&
			next.export.status === "succeeded" &&
			artifact?.generatedMedia === next.export.generatedMedia
				? artifact
				: null;
		const nextView = { preview, session: next };
		viewRef.current = nextView;
		setView(nextView);
		if (current.preview !== preview) current.preview?.cleanupScope.dispose();
	}

	async function importLocalFile(file: File): Promise<void> {
		const { session } = viewRef.current;
		if (!session.importEnabled && session.status !== "loading") return;

		const draft = createLocalMediaAssetDraft(
			file,
			createDraftId ? { createDraftId } : undefined,
		);
		const request = { controller: new AbortController(), draft };
		const previous = activeImportRef.current;
		activeImportRef.current = request;
		dispatch({ draft, type: "import.started" });
		previous?.controller.abort();

		try {
			const result = await analyzeLocalMediaAssetDraft(request.draft, {
				createAssetId,
				inspect: inspectLocalAsset,
				signal: request.controller.signal,
			});

			if (activeImportRef.current !== request) return;

			if (result.status === "ready") {
				dispatch(
					{
						asset: result.asset,
						draftId: draft.id,
						selection: result.selection,
						type: "asset.ready",
					},
					{
						preview: {
							asset: result.asset,
							cleanupScope: previewScopes.replaceCurrentScope(result.asset.id),
							source: file,
						},
					},
				);
				return;
			}

			dispatch({ ...result.failure, draftId: draft.id, type: "import.failed" });
		} finally {
			if (activeImportRef.current === request) activeImportRef.current = null;
		}
	}

	async function startDefaultExport(): Promise<void> {
		const { session: current, preview } = viewRef.current;
		if (
			!preview ||
			current.status !== "ready" ||
			current.export.status === "running"
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
				source: preview.source,
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
				{ artifact: { blob: result.blob, generatedMedia } },
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
		const current = viewRef.current.session;
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
		const current = viewRef.current;
		if (
			!canCloseEditorSession(current.session) ||
			!confirmCloseFile(closeFileConfirmationMessage)
		)
			return;

		const latest = viewRef.current;
		if (
			latest.preview !== current.preview ||
			!canCloseEditorSession(latest.session)
		)
			return;
		setLocalFileInputKey((currentKey) => currentKey + 1);
		dispatch({ type: "session.closed" });
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
		const current = viewRef.current.session;
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
		...view,
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
	};
}

function defaultConfirmCloseFile(message: string): boolean {
	return window.confirm(message);
}
