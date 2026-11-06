import {
	type ExportRangeAccuracyReport,
	classifyExportRangeAccuracy,
} from "./export-correctness";
import {
	type OutputSettings,
	type ReadyMediaAsset,
	type ResolvedOutputPlan,
	type Selection,
	areOutputSettingsEqual,
	createDefaultOutputSettings,
} from "./model";
import { formatOutputVideoCodec } from "./output-settings";
import type { ResolvedOutputPlanResult } from "./output-settings";
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
			reason: string;
			resolvedOutput: ResolvedOutputPlan;
			supported: true;
	  }
	| {
			plannedOutput?: PlannedOutput;
			reason: string;
			supported: false;
			technicalDetails: string;
	  };

type ExportCapabilityPlanningAsset = Pick<
	ReadyMediaAsset,
	"durationUs" | "frameTiming"
>;

type PlanDefaultExportCapabilityOptions = {
	asset: ExportCapabilityPlanningAsset;
	outputSettings: OutputSettings;
	output: ResolvedOutputPlanResult;
	rangeAccuracy?: ExportRangeAccuracyReport;
	runtime: RuntimeSupport;
	selection: Selection;
};

export function planDefaultExportCapability({
	asset,
	outputSettings,
	output,
	rangeAccuracy,
	runtime,
	selection,
}: PlanDefaultExportCapabilityOptions): ExportCapabilityReview {
	if (output.kind === "invalid") {
		return unsupportedReview({
			reason: "The current Output settings cannot be applied.",
			technicalDetails: output.error,
		});
	}
	const resolvedOutput = output.plan;
	const usingDefaultOutputSettings = areOutputSettingsEqual(
		outputSettings,
		createDefaultOutputSettings(),
	);
	const plannedOutput = plannedOutputForResolvedPlan(resolvedOutput);

	if (!runtime.supported) {
		return unsupportedReview({
			plannedOutput,
			reason:
				"This runtime cannot export with the selected documented output profile.",
			technicalDetails: runtime.reason,
		});
	}

	if (!selectionIsInsideAsset(selection, asset.durationUs)) {
		return unsupportedReview({
			plannedOutput,
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
		reason: selectedRangeAccuracy.reason,
		resolvedOutput,
		supported: true,
	};
}

function plannedOutputForResolvedPlan(plan: ResolvedOutputPlan): PlannedOutput {
	return {
		audioCodec: plan.audioCodec,
		container: plan.container.id,
		label: `${plan.container.label} / ${formatOutputVideoCodec(plan.videoCodec)} video / ${plan.audioCodec ? `${plan.audioCodec.toUpperCase()} audio` : "No audio"}`,
		videoCodec: plan.videoCodec,
	};
}

function unsupportedReview({
	plannedOutput,
	reason,
	technicalDetails,
}: {
	plannedOutput?: PlannedOutput;
	reason: string;
	technicalDetails: string;
}): ExportCapabilityReview {
	return {
		plannedOutput,
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
