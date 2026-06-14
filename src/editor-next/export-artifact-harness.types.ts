import type { ExportCapabilityReview } from "@/editor-core/export-capability";
import type {
	ExportRangeAccuracyReport,
	GeneratedMediaInspection,
} from "@/editor-core/export-correctness";
import type { LocalMediaAssetInspector } from "@/editor-core/local-file-analysis";
import type {
	ExportProgress,
	LocalFileSource,
	ReadyMediaAsset,
	Selection,
} from "@/editor-core/model";
import type { RuntimeSupport } from "@/editor-core/runtime-capabilities";

import type { DefaultExportRunner } from "./default-export-runner.types";
import type { ExportCorrectnessFixture } from "./export-correctness-fixtures";

export type FixtureSource = Blob & LocalFileSource;

export type ExportArtifactHarnessOptions = {
	createAssetId?: () => string;
	createDraftId?: () => string;
	createFixtureSource?: (
		blob: Blob,
		fixture: ExportCorrectnessFixture,
	) => FixtureSource;
	fetchFixtureBlob?: (fixture: ExportCorrectnessFixture) => Promise<Blob>;
	fixture?: ExportCorrectnessFixture;
	inspectGeneratedMedia?: (blob: Blob) => Promise<GeneratedMediaInspection>;
	inspectLocalAsset?: LocalMediaAssetInspector;
	runner?: DefaultExportRunner;
	runnerLabel?: string;
	runtime?: RuntimeSupport;
	selection?: Selection;
	selectionLabel?: string;
	signal?: AbortSignal;
};

export type ExportArtifactHarnessResult = {
	artifact: {
		blob: Blob;
		bytes: Uint8Array;
		fileName?: string;
		mimeType: string;
		sizeBytes: number;
	};
	report: ExportArtifactHarnessReport;
};

export type ExportArtifactHarnessFailureStage =
	| "asset-capability"
	| "export-runner"
	| "fixture-source"
	| "generated-media-inspection"
	| "runtime-capability";

export type ExportFixtureCatalogSelectionKind =
	keyof ExportCorrectnessFixture["selections"];

export type ExportFixtureCatalogHarnessOptions = Omit<
	ExportArtifactHarnessOptions,
	"fixture" | "selection" | "selectionLabel"
> & {
	fixtures?: readonly ExportCorrectnessFixture[];
	selectionKind?: ExportFixtureCatalogSelectionKind;
};

export type ExportFixtureCatalogHarnessResult = {
	results: ExportFixtureCatalogResult[];
	summary: {
		exported: number;
		total: number;
		unsupported: number;
	};
};

export type ExportFixtureCatalogResult =
	| {
			artifact: ExportArtifactHarnessResult["artifact"];
			fixture: ExportArtifactHarnessReport["fixture"];
			report: ExportArtifactHarnessReport;
			status: "exported";
	  }
	| {
			failure: {
				reason: string;
				stage: ExportArtifactHarnessFailureStage;
				technicalDetails?: string;
			};
			fixture: ExportArtifactHarnessReport["fixture"];
			selection: Selection;
			status: "unsupported";
	  };

export type ExportArtifactHarnessReport = {
	delivery: {
		performed: false;
		reason: string;
		required: true;
	};
	execution: {
		generatedMedia: {
			fileName?: string;
			mimeType: string;
			sizeBytes: number;
		};
		progress: ExportProgress[];
		requestedSelection: Selection;
		runner: string;
	};
	exportReview: ExportCapabilityReview;
	fixture: {
		fileName: string;
		id: string;
		label: string;
		publicPath: string;
		selectionLabel: string;
	};
	inspection: GeneratedMediaInspection;
	rangeAccuracy: ExportRangeAccuracyReport;
	source: {
		asset: Pick<
			ReadyMediaAsset,
			"durationUs" | "frameTiming" | "id" | "label" | "tracks"
		>;
		blob: {
			mimeType: string;
			sizeBytes: number;
		};
		selection: Selection;
	};
};

export type FullAssetExportArtifactHarnessOptions =
	ExportArtifactHarnessOptions;
export type FullAssetExportArtifactHarnessResult = ExportArtifactHarnessResult;
export type FullAssetExportArtifactHarnessReport = ExportArtifactHarnessReport;
