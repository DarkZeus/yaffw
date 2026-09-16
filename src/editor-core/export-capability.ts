import {
	type ExportRangeAccuracyReport,
	classifyExportRangeAccuracy,
} from "./export-correctness";
import {
	type AudioMix,
	DEFAULT_OUTPUT_PROFILE,
	type DefaultOutputProfile,
	type OutputSettings,
	type ReadyMediaAsset,
	type ResolvedOutputPlan,
	type Selection,
	areOutputSettingsEqual,
	createDefaultOutputSettings,
} from "./model";
import {
	type BrowserLocalOutputSupport,
	resolveOutputPlan,
} from "./output-settings";
import type { RuntimeSupport } from "./runtime-capabilities";

export type PlannedOutput = {
	audioCodec?: string;
	container: string;
	label: string;
	videoCodec: string;
};

export type ExportMethodKey = "best-effort" | "fast" | "precision";

export type ExportMethod = {
	key: ExportMethodKey;
	label: string;
};

export type ExportPrecisionKey =
	| "best-effort"
	| "full-asset"
	| "proven-precise";

export type ExportPrecision = {
	key: ExportPrecisionKey;
	label: string;
};

export type ExportCapabilityReview =
	| {
			method: ExportMethod;
			plannedOutput: PlannedOutput;
			precision: ExportPrecision;
			profile: DefaultOutputProfile;
			reason: string;
			resolvedOutput?: ResolvedOutputPlan;
			supported: true;
	  }
	| {
			plannedOutput: PlannedOutput;
			profile: DefaultOutputProfile;
			reason: string;
			resolvedOutput?: ResolvedOutputPlan;
			supported: false;
			technicalDetails: string;
	  };

type ExportCapabilityPlanningAsset = Pick<
	ReadyMediaAsset,
	"durationUs" | "frameTiming" | "tracks"
>;

type PlanDefaultExportCapabilityOptions = {
	asset: ExportCapabilityPlanningAsset;
	audioMix?: AudioMix;
	outputSettings?: OutputSettings;
	profile?: DefaultOutputProfile;
	rangeAccuracy?: ExportRangeAccuracyReport;
	runtime: RuntimeSupport;
	selection: Selection;
	support?: BrowserLocalOutputSupport;
};

export function planDefaultExportCapability({
	asset,
	audioMix,
	outputSettings,
	profile = DEFAULT_OUTPUT_PROFILE,
	rangeAccuracy,
	runtime,
	selection,
	support,
}: PlanDefaultExportCapabilityOptions): ExportCapabilityReview {
	const resolved =
		audioMix && outputSettings && support
			? resolveOutputPlan({ asset, audioMix, outputSettings, support })
			: undefined;
	const resolvedOutput =
		resolved?.kind === "resolved" ? resolved.plan : undefined;
	const usingDefaultOutputSettings =
		!outputSettings ||
		areOutputSettingsEqual(outputSettings, createDefaultOutputSettings());
	const plannedOutput = resolvedOutput
		? plannedOutputForResolvedPlan(resolvedOutput)
		: plannedOutputForProfile(profile);

	if (resolved?.kind === "invalid") {
		return unsupportedReview({
			plannedOutput: {
				...plannedOutput,
				label: "Invalid Output settings",
			},
			profile,
			reason: "The current Output settings cannot be applied.",
			technicalDetails: resolved.error,
		});
	}

	if (!runtime.supported) {
		return unsupportedReview({
			plannedOutput,
			profile,
			reason:
				"This runtime cannot export with the selected documented output profile.",
			technicalDetails: runtime.reason,
		});
	}

	if (!selectionIsInsideAsset(selection, asset.durationUs)) {
		return unsupportedReview({
			plannedOutput,
			profile,
			reason: "The current selection is outside the active media asset.",
			technicalDetails: `Expected selection inside [0, ${asset.durationUs}], got [${selection.startUs}, ${selection.endUs}].`,
		});
	}

	if (isFullAssetSelection(selection, asset.durationUs)) {
		return {
			method: {
				key: "fast",
				label: "Whole file export",
			},
			plannedOutput,
			precision: {
				key: "full-asset",
				label: "Whole file",
			},
			profile,
			reason: usingDefaultOutputSettings
				? "The current selection covers the full asset, so export can use the default output profile without boundary trimming."
				: "The current selection covers the full asset, so export can use the selected output plan without boundary trimming.",
			resolvedOutput,
			supported: true,
		};
	}

	const selectedRangeAccuracy =
		rangeAccuracy ??
		classifyExportRangeAccuracy({
			frameTiming: asset.frameTiming,
			selection,
			sourceDurationUs: asset.durationUs,
		});

	if (selectedRangeAccuracy.kind === "proven-precise") {
		return {
			method: {
				key: "precision",
				label: "Verified export",
			},
			plannedOutput,
			precision: {
				key: "proven-precise",
				label: "Boundaries verified",
			},
			profile,
			reason: selectedRangeAccuracy.reason,
			resolvedOutput,
			supported: true,
		};
	}

	return {
		method: {
			key: "best-effort",
			label: "Standard export",
		},
		plannedOutput,
		precision: {
			key: "best-effort",
			label: "Boundaries unverified",
		},
		profile,
		reason: selectedRangeAccuracy.reason,
		resolvedOutput,
		supported: true,
	};
}

export function plannedOutputForResolvedPlan(
	plan: ResolvedOutputPlan,
): PlannedOutput {
	return {
		audioCodec: plan.audioCodec,
		container: plan.container.id,
		label: `${plan.container.label} / ${formatVideoCodec(plan.videoCodec)} video / ${plan.audioCodec ? `${plan.audioCodec.toUpperCase()} audio` : "No audio"}`,
		videoCodec: plan.videoCodec,
	};
}

export function plannedOutputForProfile(
	profile: DefaultOutputProfile = DEFAULT_OUTPUT_PROFILE,
): PlannedOutput {
	return {
		audioCodec: profile.audioCodec,
		container: profile.container,
		label: "MP4 / H.264 video / AAC audio",
		videoCodec: profile.videoCodec,
	};
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

function unsupportedReview({
	plannedOutput,
	profile,
	reason,
	technicalDetails,
}: {
	plannedOutput: PlannedOutput;
	profile: DefaultOutputProfile;
	reason: string;
	technicalDetails: string;
}): ExportCapabilityReview {
	return {
		plannedOutput,
		profile,
		reason,
		supported: false,
		technicalDetails,
	};
}

function selectionIsInsideAsset(
	selection: Selection,
	durationUs: number,
): boolean {
	return (
		Number.isSafeInteger(selection.startUs) &&
		Number.isSafeInteger(selection.endUs) &&
		selection.startUs >= 0 &&
		selection.endUs <= durationUs &&
		selection.startUs < selection.endUs
	);
}

function isFullAssetSelection(
	selection: Selection,
	durationUs: number,
): boolean {
	return selection.startUs === 0 && selection.endUs === durationUs;
}
