import {
	type ExportCapabilityReview,
	planDefaultExportCapability,
} from "@/editor-core/export-capability";
import type {
	ExportProgress,
	GeneratedMedia,
	ReadyMediaAsset,
	Selection,
} from "@/editor-core/model";
import type { RuntimeSupport } from "@/editor-core/runtime-capabilities";
import type { ExportSessionState } from "@/editor-core/session";

export type ExportInspectorFact = {
	label: string;
	value: string;
};

export type ExportInspectorReviewViewModel =
	| {
			method: ExportInspectorFact;
			plannedOutput: ExportInspectorFact;
			precision: ExportInspectorFact;
			reason: string;
			supported: true;
	  }
	| {
			plannedOutput: ExportInspectorFact;
			reason: string;
			supported: false;
			technicalDetails: string;
	  };

export type ExportInspectorStatusViewModel =
	| {
			kind: "idle";
	  }
	| {
			cancelUnavailableMessage: string | undefined;
			jobId: string;
			kind: "running";
			progressPercent: number;
			title: string;
	  }
	| {
			kind: "failed";
			message: string;
			technicalDetails?: string;
	  }
	| {
			deliveryState: "Delivered" | "Ready to download";
			fileName: string;
			kind: "succeeded";
			title: "Export complete";
	  }
	| {
			kind: "cancelled";
			message: "Export cancelled.";
	  };

export type ExportInspectorActionViewModel =
	| {
			disabled: boolean;
			kind: "start";
			label: "Start export";
	  }
	| {
			disabled: false;
			kind: "cancel";
			label: "Cancel export";
	  }
	| {
			disabled: false;
			generatedMedia: GeneratedMedia;
			kind: "download";
			label: "Download export";
	  }
	| {
			kind: "none";
	  };

export type ExportInspectorCapabilityViewModel = {
	label: "Export capability";
	tone: "blocked" | "ready";
	value: "Blocked" | "Ready";
};

export type ExportInspectorRuntimeCheckViewModel = {
	available: boolean;
	label: string;
	status: "Missing" | "Ready";
};

export type ExportInspectorViewModel = {
	action: ExportInspectorActionViewModel;
	badge: {
		label: "Blocked" | "Ready";
		tone: "blocked" | "ready";
	};
	capability: ExportInspectorCapabilityViewModel;
	review: ExportInspectorReviewViewModel;
	runtimeChecks: ExportInspectorRuntimeCheckViewModel[];
	status: ExportInspectorStatusViewModel;
};

type CreateExportInspectorViewModelOptions = {
	asset: ReadyMediaAsset;
	exportState: ExportSessionState;
	runtime: RuntimeSupport;
	selection: Selection;
};

export function createExportInspectorViewModel({
	asset,
	exportState,
	runtime,
	selection,
}: CreateExportInspectorViewModelOptions): ExportInspectorViewModel {
	const review = planDefaultExportCapability({
		asset,
		runtime,
		selection,
	});

	return {
		action: actionForExportState(exportState, review.supported),
		badge: {
			label: review.supported ? "Ready" : "Blocked",
			tone: review.supported ? "ready" : "blocked",
		},
		capability: capabilityViewModel(review.supported),
		review: reviewViewModel(review),
		runtimeChecks: runtimeCheckViewModels(runtime),
		status: statusForExportState(exportState),
	};
}

function capabilityViewModel(
	reviewSupported: boolean,
): ExportInspectorCapabilityViewModel {
	return {
		label: "Export capability",
		tone: reviewSupported ? "ready" : "blocked",
		value: reviewSupported ? "Ready" : "Blocked",
	};
}

function runtimeCheckViewModels(
	runtime: RuntimeSupport,
): ExportInspectorRuntimeCheckViewModel[] {
	return [
		{
			available: runtime.capabilities.videoDecoder,
			label: "Video decoder",
		},
		{
			available: runtime.capabilities.videoEncoder,
			label: "Video encoder",
		},
		{
			available: runtime.capabilities.mediaSource,
			label: "Media source",
		},
		{
			available: runtime.capabilities.objectUrl && runtime.capabilities.fileApi,
			label: "Local file APIs",
		},
	].map((row) => ({
		...row,
		status: row.available ? "Ready" : "Missing",
	}));
}

function reviewViewModel(
	review: ExportCapabilityReview,
): ExportInspectorReviewViewModel {
	if (!review.supported) {
		return {
			plannedOutput: {
				label: "Format",
				value: review.plannedOutput.label,
			},
			reason: review.reason,
			supported: false,
			technicalDetails: review.technicalDetails,
		};
	}

	return {
		method: {
			label: "Export",
			value: review.method.label,
		},
		plannedOutput: {
			label: "Format",
			value: review.plannedOutput.label,
		},
		precision: {
			label: "Range",
			value: review.precision.label,
		},
		reason: review.reason,
		supported: true,
	};
}

function statusForExportState(
	exportState: ExportSessionState,
): ExportInspectorStatusViewModel {
	switch (exportState.status) {
		case "reviewing":
			return {
				kind: "idle",
			};
		case "running":
			return {
				cancelUnavailableMessage: exportState.job.cancelSupported
					? undefined
					: "Cancellation unavailable",
				jobId: exportState.job.id,
				kind: "running",
				progressPercent: progressPercent(exportState.job.progress),
				title: formatExportProgressPhase(exportState.job.progress.phase),
			};
		case "failed":
			return {
				kind: "failed",
				message: exportState.message,
				technicalDetails: exportState.technicalDetails,
			};
		case "succeeded":
			return {
				deliveryState: exportState.delivered
					? "Delivered"
					: "Ready to download",
				fileName: exportState.generatedMedia.fileName,
				kind: "succeeded",
				title: "Export complete",
			};
		case "cancelled":
			return {
				kind: "cancelled",
				message: "Export cancelled.",
			};
	}
}

function actionForExportState(
	exportState: ExportSessionState,
	reviewSupported: boolean,
): ExportInspectorActionViewModel {
	switch (exportState.status) {
		case "running":
			if (!exportState.job.cancelSupported) {
				return {
					kind: "none",
				};
			}

			return {
				disabled: false,
				kind: "cancel",
				label: "Cancel export",
			};
		case "succeeded":
			return {
				disabled: false,
				generatedMedia: exportState.generatedMedia,
				kind: "download",
				label: "Download export",
			};
		default:
			return {
				disabled: !reviewSupported,
				kind: "start",
				label: "Start export",
			};
	}
}

function progressPercent(progress: ExportProgress): number {
	return Math.round(Math.max(0.05, progress.completedRatio ?? 0.05) * 100);
}

function formatExportProgressPhase(phase: ExportProgress["phase"]): string {
	switch (phase) {
		case "encoding":
			return "Encoding";
		case "finalizing":
			return "Finalizing";
		case "muxing":
			return "Muxing";
		case "preparing":
			return "Preparing";
	}
}
