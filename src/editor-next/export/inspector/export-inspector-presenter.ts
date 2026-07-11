import {
	type ExportCapabilityReview,
	planDefaultExportCapability,
} from "@/editor-core/export-capability";
import type { ExportProgress } from "@/editor-core/model";
import {
	type ResolvedOutputResolution,
	resolveOutputAudioProfile,
	resolveOutputResolution,
	resolveOutputVideoProfile,
} from "@/editor-core/output-settings";
import type { RuntimeSupport } from "@/editor-core/runtime-capabilities";
import type { ExportSessionState } from "@/editor-core/session";
import { getMediabunnyOutputSupport } from "../adapters/mediabunny-output-support";
import type {
	CreateExportInspectorViewModelOptions,
	ExportInspectorActionViewModel,
	ExportInspectorCapabilityViewModel,
	ExportInspectorReviewViewModel,
	ExportInspectorRuntimeCheckViewModel,
	ExportInspectorStatusViewModel,
	ExportInspectorViewModel,
} from "../types/export-inspector-presenter.types";

const OUTPUT_SUPPORT = getMediabunnyOutputSupport();

export function createExportInspectorViewModel({
	asset,
	audioMix,
	exportState,
	outputSettings,
	runtime,
	selection,
}: CreateExportInspectorViewModelOptions): ExportInspectorViewModel {
	const review = planDefaultExportCapability({
		asset,
		runtime,
		selection,
	});
	const outputProfile = resolveOutputVideoProfile({
		asset,
		outputSettings,
		support: OUTPUT_SUPPORT,
	});
	const outputAudio = resolveOutputAudioProfile({
		asset,
		audioMix,
		outputSettings,
		support: OUTPUT_SUPPORT,
	});
	const outputResolution = resolveOutputResolution({
		asset,
		setting: outputSettings.resolution,
	});
	const supported =
		review.supported &&
		outputProfile.kind === "resolved" &&
		outputAudio.kind === "resolved" &&
		outputResolution.kind === "resolved";

	return {
		action: actionForExportState(exportState, supported),
		badge: {
			label: supported ? "Ready" : "Blocked",
			tone: supported ? "ready" : "blocked",
		},
		capability: capabilityViewModel(supported),
		review: reviewViewModel(
			review,
			outputProfile,
			outputAudio,
			outputResolution,
		),
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
	outputProfile: ReturnType<typeof resolveOutputVideoProfile>,
	outputAudio: ReturnType<typeof resolveOutputAudioProfile>,
	outputResolution: ResolvedOutputResolution,
): ExportInspectorReviewViewModel {
	if (outputProfile.kind === "invalid") {
		return {
			audioMix: audioMixViewModel(outputAudio),
			plannedOutput: {
				label: "Format",
				value: "Invalid Output settings",
			},
			reason: "The current Output settings cannot be applied.",
			resolution: resolutionViewModel(outputResolution),
			supported: false,
			technicalDetails: outputProfile.error,
		};
	}

	if (outputResolution.kind === "invalid") {
		return {
			audioMix: audioMixViewModel(outputAudio),
			plannedOutput: {
				label: "Format",
				value: "Invalid Output settings",
			},
			reason: "The current Output settings cannot be applied.",
			resolution: resolutionViewModel(outputResolution),
			supported: false,
			technicalDetails: outputResolution.error,
		};
	}

	if (outputAudio.kind === "invalid") {
		return {
			audioMix: audioMixViewModel(outputAudio),
			plannedOutput: {
				label: "Format",
				value: "Invalid Output settings",
			},
			reason: "The current Output settings cannot be applied.",
			resolution: resolutionViewModel(outputResolution),
			supported: false,
			technicalDetails: outputAudio.error,
		};
	}

	const plannedOutput = {
		label: "Format" as const,
		value: formatResolvedOutputProfile(outputProfile, outputAudio.audioCodec),
	};

	if (!review.supported) {
		return {
			audioMix: audioMixViewModel(outputAudio),
			plannedOutput,
			reason: review.reason,
			resolution: resolutionViewModel(outputResolution),
			supported: false,
			technicalDetails: review.technicalDetails,
		};
	}

	return {
		audioMix: audioMixViewModel(outputAudio),
		method: {
			label: "Export",
			value: review.method.label,
		},
		plannedOutput,
		precision: {
			label: "Range",
			value: review.precision.label,
		},
		reason: review.reason,
		resolution: resolutionViewModel(outputResolution),
		supported: true,
	};
}

function audioMixViewModel(
	profile: ReturnType<typeof resolveOutputAudioProfile>,
): { label: "Generated audio mix"; value: string } {
	if (profile.kind === "invalid") {
		return {
			label: "Generated audio mix",
			value: "Invalid Output settings",
		};
	}

	if (!profile.audioCodec || profile.includedTrackCount === 0) {
		return {
			label: "Generated audio mix",
			value: "No audio track",
		};
	}

	const sourceTrackLabel =
		profile.includedTrackCount === 1 ? "source track" : "source tracks";
	return {
		label: "Generated audio mix",
		value: `${profile.includedTrackCount} included ${sourceTrackLabel} to one ${profile.audioCodec.toUpperCase()} audio track`,
	};
}

function resolutionViewModel(resolution: ResolvedOutputResolution): {
	label: "Resolution";
	value: string;
} {
	if (resolution.kind === "invalid") {
		return { label: "Resolution", value: "Invalid Output settings" };
	}

	return {
		label: "Resolution",
		value: resolution.dimensions
			? `${resolution.dimensions.width}x${resolution.dimensions.height}`
			: "Preserve source",
	};
}

function formatResolvedOutputProfile(
	profile: Extract<
		ReturnType<typeof resolveOutputVideoProfile>,
		{ kind: "resolved" }
	>,
	audioCodec: string | undefined,
): string {
	return `${profile.container.label} / ${formatVideoCodec(profile.videoCodec)} video / ${audioCodec ? `${audioCodec.toUpperCase()} audio` : "No audio"}`;
}

function formatVideoCodec(codec: string): string {
	if (codec === "avc") {
		return "H.264";
	}
	if (codec === "hevc") {
		return "H.265";
	}

	return codec.toUpperCase();
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
