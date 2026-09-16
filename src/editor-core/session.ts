import { createDefaultAudioMix } from "./audio-mix";
import {
	type ExportCapabilityReview,
	planDefaultExportCapability,
} from "./export-capability";
import {
	type AudioMix,
	type AudioTrackChannelMode,
	type ExportProgress,
	type GeneratedMedia,
	type MediaAssetDraft,
	type MediaTimeUs,
	type OutputSettings,
	type ReadyMediaAsset,
	type ResolvedOutputPlan,
	type Selection,
	areOutputSettingsEqual,
	createDefaultOutputSettings,
} from "./model";
import type { RuntimeSupport } from "./runtime-capabilities";
import {
	moveSelectionRangeByDelta,
	replaceSelection,
	resetSelection,
	setSelectionEndFromPlayhead,
	setSelectionStartFromPlayhead,
} from "./selection";

type BaseSessionState = {
	runtime: RuntimeSupport;
};

export type UnsupportedRuntimeSession = {
	importEnabled: false;
	message: string;
	status: "unsupported-runtime";
} & BaseSessionState;

export type EmptySession = {
	importEnabled: true;
	status: "empty";
} & BaseSessionState;

export type LoadingSession = {
	draft: MediaAssetDraft;
	importEnabled: false;
	status: "loading";
} & BaseSessionState;

export type ExportJobSnapshot = {
	asset: ReadyMediaAsset;
	audioMix: AudioMix;
	outputSettings: OutputSettings;
	review: Extract<ExportCapabilityReview, { supported: true }>;
	resolvedOutput?: ResolvedOutputPlan;
	selection: Selection;
};

export type ExportJob = {
	cancelSupported: boolean;
	id: string;
	progress: ExportProgress;
	snapshot: ExportJobSnapshot;
};

export type ExportSessionState =
	| {
			status: "reviewing";
	  }
	| {
			job: ExportJob;
			status: "running";
	  }
	| {
			delivered: boolean;
			generatedMedia: GeneratedMedia;
			job: ExportJob;
			status: "succeeded";
	  }
	| {
			job: ExportJob;
			message: string;
			status: "failed";
			technicalDetails?: string;
	  }
	| {
			job: ExportJob;
			status: "cancelled";
	  };

export type ReadySession = {
	audioMix: AudioMix;
	asset: ReadyMediaAsset;
	export: ExportSessionState;
	importEnabled: false;
	outputSettings: OutputSettings;
	selection: Selection;
	status: "ready";
} & BaseSessionState;

export type FailureSession = {
	importEnabled: true;
	message: string;
	status: "failure";
	technicalDetails?: string;
} & BaseSessionState;

export type ClosedSession = {
	importEnabled: false;
	status: "closed";
} & BaseSessionState;

export type EditorSessionState =
	| ClosedSession
	| EmptySession
	| FailureSession
	| LoadingSession
	| ReadySession
	| UnsupportedRuntimeSession;

export type EditorSessionAction =
	| {
			runtime: RuntimeSupport;
			type: "runtime.checked";
	  }
	| {
			draft: MediaAssetDraft;
			type: "import.started";
	  }
	| {
			asset: ReadyMediaAsset;
			selection: Selection;
			type: "asset.ready";
	  }
	| {
			message: string;
			technicalDetails?: string;
			type: "session.failed";
	  }
	| {
			playheadUs: MediaTimeUs;
			type: "selection.start.setFromPlayhead";
	  }
	| {
			playheadUs: MediaTimeUs;
			type: "selection.end.setFromPlayhead";
	  }
	| {
			deltaUs: MediaTimeUs;
			type: "selection.range.moved";
	  }
	| {
			selection: Selection;
			type: "selection.replaced";
	  }
	| {
			type: "selection.reset";
	  }
	| {
			include: boolean;
			trackId: string;
			type: "audio.track.include.set";
	  }
	| {
			channelMode: AudioTrackChannelMode;
			trackId: string;
			type: "audio.track.channelMode.set";
	  }
	| {
			trackId: string;
			type: "audio.track.volume.set";
			volumePercent: number;
	  }
	| {
			outputSettings: OutputSettings;
			type: "output-settings.applied";
	  }
	| {
			cancelSupported: boolean;
			jobId: string;
			review?: Extract<ExportCapabilityReview, { supported: true }>;
			type: "export.started";
	  }
	| {
			jobId: string;
			progress: ExportProgress;
			type: "export.progressed";
	  }
	| {
			generatedMedia: GeneratedMedia;
			jobId: string;
			type: "export.succeeded";
	  }
	| {
			jobId: string;
			message: string;
			technicalDetails?: string;
			type: "export.failed";
	  }
	| {
			jobId: string;
			type: "export.cancelled";
	  }
	| {
			generatedMediaId: string;
			type: "generated-media.delivered";
	  }
	| {
			type: "session.closed";
	  };

export function createInitialEditorSession(
	runtime: RuntimeSupport,
): EditorSessionState {
	if (!runtime.supported) {
		return {
			importEnabled: false,
			message: runtime.reason,
			runtime,
			status: "unsupported-runtime",
		};
	}

	return {
		importEnabled: true,
		runtime,
		status: "empty",
	};
}

export function editorSessionReducer(
	state: EditorSessionState,
	action: EditorSessionAction,
): EditorSessionState {
	switch (action.type) {
		case "runtime.checked":
			return createInitialEditorSession(action.runtime);
		case "import.started":
			if (state.status !== "empty" && state.status !== "failure") {
				return state;
			}

			return {
				draft: action.draft,
				importEnabled: false,
				runtime: state.runtime,
				status: "loading",
			};
		case "asset.ready":
			if (state.status !== "loading") {
				return state;
			}

			return {
				audioMix: createDefaultAudioMix(action.asset),
				asset: action.asset,
				export: {
					status: "reviewing",
				},
				importEnabled: false,
				outputSettings: createDefaultOutputSettings(),
				selection: action.selection,
				runtime: state.runtime,
				status: "ready",
			};
		case "session.failed":
			if (state.status === "unsupported-runtime" || state.status === "closed") {
				return state;
			}

			return {
				importEnabled: true,
				message: action.message,
				runtime: state.runtime,
				status: "failure",
				technicalDetails: action.technicalDetails,
			};
		case "selection.start.setFromPlayhead":
			if (!canChangeEditingDecisions(state)) {
				return state;
			}

			return {
				...state,
				export: resetExportReviewAfterEditingDecision(state.export),
				selection: setSelectionStartFromPlayhead(
					state.selection,
					action.playheadUs,
					{
						durationUs: state.asset.durationUs,
						frameTiming: state.asset.frameTiming,
					},
				),
			};
		case "selection.end.setFromPlayhead":
			if (!canChangeEditingDecisions(state)) {
				return state;
			}

			return {
				...state,
				export: resetExportReviewAfterEditingDecision(state.export),
				selection: setSelectionEndFromPlayhead(
					state.selection,
					action.playheadUs,
					{
						durationUs: state.asset.durationUs,
						frameTiming: state.asset.frameTiming,
					},
				),
			};
		case "selection.range.moved":
			if (!canChangeEditingDecisions(state)) {
				return state;
			}

			return {
				...state,
				export: resetExportReviewAfterEditingDecision(state.export),
				selection: moveSelectionRangeByDelta(state.selection, action.deltaUs, {
					durationUs: state.asset.durationUs,
					frameTiming: state.asset.frameTiming,
				}),
			};
		case "selection.replaced":
			if (!canChangeEditingDecisions(state)) {
				return state;
			}

			return {
				...state,
				export: resetExportReviewAfterEditingDecision(state.export),
				selection: replaceSelection(action.selection, {
					durationUs: state.asset.durationUs,
					frameTiming: state.asset.frameTiming,
				}),
			};
		case "selection.reset":
			if (!canChangeEditingDecisions(state)) {
				return state;
			}

			return {
				...state,
				export: resetExportReviewAfterEditingDecision(state.export),
				selection: resetSelection({
					durationUs: state.asset.durationUs,
					frameTiming: state.asset.frameTiming,
				}),
			};
		case "audio.track.include.set":
			if (!canChangeEditingDecisions(state)) {
				return state;
			}

			if (!state.audioMix.tracks[action.trackId]) {
				return state;
			}

			return {
				...state,
				audioMix: {
					...state.audioMix,
					tracks: {
						...state.audioMix.tracks,
						[action.trackId]: {
							...state.audioMix.tracks[action.trackId],
							include: action.include,
						},
					},
				},
				export: resetExportReviewAfterEditingDecision(state.export),
			};
		case "audio.track.channelMode.set":
			if (!canChangeEditingDecisions(state)) {
				return state;
			}

			if (!state.audioMix.tracks[action.trackId]) {
				return state;
			}

			return {
				...state,
				audioMix: {
					...state.audioMix,
					tracks: {
						...state.audioMix.tracks,
						[action.trackId]: {
							...state.audioMix.tracks[action.trackId],
							channelMode: action.channelMode,
						},
					},
				},
				export: resetExportReviewAfterEditingDecision(state.export),
			};
		case "audio.track.volume.set":
			if (!canChangeEditingDecisions(state)) {
				return state;
			}

			if (!state.audioMix.tracks[action.trackId]) {
				return state;
			}

			return {
				...state,
				audioMix: {
					...state.audioMix,
					tracks: {
						...state.audioMix.tracks,
						[action.trackId]: {
							...state.audioMix.tracks[action.trackId],
							volumePercent: clampAudioTrackVolumePercent(action.volumePercent),
						},
					},
				},
				export: resetExportReviewAfterEditingDecision(state.export),
			};
		case "output-settings.applied":
			if (!canChangeEditingDecisions(state)) {
				return state;
			}

			if (areOutputSettingsEqual(state.outputSettings, action.outputSettings)) {
				return state;
			}

			return {
				...state,
				export: resetExportReviewAfterEditingDecision(state.export),
				outputSettings: action.outputSettings,
			};
		case "export.started": {
			if (state.status !== "ready" || state.export.status === "running") {
				return state;
			}

			const review =
				action.review ??
				planDefaultExportCapability({
					asset: state.asset,
					runtime: state.runtime,
					selection: state.selection,
				});

			if (!review.supported) {
				return state;
			}

			return {
				...state,
				export: {
					job: {
						cancelSupported: action.cancelSupported,
						id: action.jobId,
						progress: {
							phase: "preparing",
						},
						snapshot: {
							asset: state.asset,
							audioMix: state.audioMix,
							outputSettings: state.outputSettings,
							review,
							resolvedOutput: review.resolvedOutput,
							selection: { ...state.selection },
						},
					},
					status: "running",
				},
			};
		}
		case "export.progressed": {
			if (
				state.status !== "ready" ||
				state.export.status !== "running" ||
				state.export.job.id !== action.jobId
			) {
				return state;
			}

			return {
				...state,
				export: {
					...state.export,
					job: {
						...state.export.job,
						progress: action.progress,
					},
				},
			};
		}
		case "export.succeeded": {
			if (
				state.status !== "ready" ||
				state.export.status !== "running" ||
				state.export.job.id !== action.jobId
			) {
				return state;
			}

			return {
				...state,
				export: {
					delivered: false,
					generatedMedia: action.generatedMedia,
					job: {
						...state.export.job,
						progress: {
							phase: "finalizing",
						},
					},
					status: "succeeded",
				},
			};
		}
		case "export.failed": {
			if (
				state.status !== "ready" ||
				state.export.status !== "running" ||
				state.export.job.id !== action.jobId
			) {
				return state;
			}

			return {
				...state,
				export: {
					job: state.export.job,
					message: action.message,
					status: "failed",
					technicalDetails: action.technicalDetails,
				},
			};
		}
		case "export.cancelled": {
			if (
				state.status !== "ready" ||
				state.export.status !== "running" ||
				state.export.job.id !== action.jobId ||
				!state.export.job.cancelSupported
			) {
				return state;
			}

			return {
				...state,
				export: {
					job: state.export.job,
					status: "cancelled",
				},
			};
		}
		case "generated-media.delivered":
			if (
				state.status !== "ready" ||
				state.export.status !== "succeeded" ||
				state.export.generatedMedia.id !== action.generatedMediaId
			) {
				return state;
			}

			return {
				...state,
				export: {
					...state.export,
					delivered: true,
				},
			};
		case "session.closed":
			if (!canCloseEditorSession(state)) {
				return state;
			}

			return {
				importEnabled: true,
				runtime: state.runtime,
				status: "empty",
			};
	}
}

export function canChangeEditingDecisions(
	state: EditorSessionState,
): state is ReadySession {
	return state.status === "ready" && state.export.status !== "running";
}

export function canCloseEditorSession(state: EditorSessionState): boolean {
	return state.status === "ready" && state.export.status !== "running";
}

export function shouldProtectEditorBeforeUnload(
	state: EditorSessionState,
): boolean {
	return state.status === "ready";
}

function resetExportReviewAfterEditingDecision(
	exportState: ExportSessionState,
): ExportSessionState {
	if (exportState.status === "running" || exportState.status === "reviewing") {
		return exportState;
	}

	return {
		status: "reviewing",
	};
}

function clampAudioTrackVolumePercent(volumePercent: number) {
	if (!Number.isFinite(volumePercent)) {
		return 100;
	}

	return Math.max(0, Math.min(100, Math.round(volumePercent)));
}
