import {
	type ExportRangeAccuracyReport,
	classifyExportRangeAccuracy,
} from "./export-correctness";
import {
	DEFAULT_OUTPUT_PROFILE,
	type DefaultOutputProfile,
	type ReadyMediaAsset,
	type Selection,
} from "./model";
import type { RuntimeSupport } from "./runtime-capabilities";

export type PlannedOutput = {
	audioCodec: DefaultOutputProfile["audioCodec"];
	container: DefaultOutputProfile["container"];
	label: string;
	videoCodec: DefaultOutputProfile["videoCodec"];
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
			supported: true;
	  }
	| {
			plannedOutput: PlannedOutput;
			profile: DefaultOutputProfile;
			reason: string;
			supported: false;
			technicalDetails: string;
	  };

type ExportCapabilityPlanningAsset = Pick<
	ReadyMediaAsset,
	"durationUs" | "frameTiming" | "tracks"
> & {
	exportCapability: {
		profile: DefaultOutputProfile;
		supported: boolean;
	};
};

type PlanDefaultExportCapabilityOptions = {
	asset: ExportCapabilityPlanningAsset;
	defaultProfileExportable?: boolean;
	profile?: DefaultOutputProfile;
	rangeAccuracy?: ExportRangeAccuracyReport;
	runtime: RuntimeSupport;
	selection: Selection;
};

export function planDefaultExportCapability({
	asset,
	defaultProfileExportable = asset.exportCapability.supported,
	profile = DEFAULT_OUTPUT_PROFILE,
	rangeAccuracy,
	runtime,
	selection,
}: PlanDefaultExportCapabilityOptions): ExportCapabilityReview {
	const plannedOutput = plannedOutputForProfile(profile);

	if (!runtime.supported) {
		return unsupportedReview({
			plannedOutput,
			profile,
			reason:
				"This runtime cannot export with the default MP4/H.264/AAC profile.",
			technicalDetails: runtime.reason,
		});
	}

	if (!defaultProfileExportable) {
		return unsupportedReview({
			plannedOutput,
			profile,
			reason:
				"This file cannot be exported with the default MP4/H.264/AAC profile in this runtime.",
			technicalDetails:
				"The default output profile is unavailable for this media asset, and editor-next does not silently fall back to another output format.",
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
			reason:
				"The current selection covers the full asset, so export can use the default output profile without boundary trimming.",
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
		supported: true,
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
