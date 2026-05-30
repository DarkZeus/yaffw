import {
	planDefaultExportCapability,
	type ExportCapabilityReview,
} from "@/editor-core/export-capability";
import {
	classifyExportRangeAccuracy,
	type ExportRangeAccuracyReport,
	type GeneratedMediaInspection,
} from "@/editor-core/export-correctness";
import {
	analyzeLocalMediaAssetDraft,
	type LocalMediaAssetInspector,
} from "@/editor-core/local-file-analysis";
import { createLocalMediaAssetDraft } from "@/editor-core/local-file-import";
import type {
	ExportProgress,
	LocalFileSource,
	ReadyMediaAsset,
	Selection,
} from "@/editor-core/model";
import {
	detectRuntimeSupport,
	type RuntimeSupport,
} from "@/editor-core/runtime-capabilities";

import { inspectBrowserLocalMediaAssetDraft } from "./browser-local-asset-analyzer";
import {
	browserDefaultExportRunner,
	type DefaultExportRunner,
} from "./default-export-runner";
import {
	EXPORT_CORRECTNESS_FIXTURES,
	type ExportCorrectnessFixture,
} from "./export-correctness-fixtures";
import { inspectGeneratedMediaBlob } from "./generated-media-inspector";

type FixtureSource = Blob & LocalFileSource;

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

export async function runFullAssetExportArtifactHarness(
	options: FullAssetExportArtifactHarnessOptions = {},
): Promise<FullAssetExportArtifactHarnessResult> {
	const fixture = options.fixture ?? defaultFullAssetFixture();

	return runExportArtifactHarness({
		...options,
		fixture,
		selection: options.selection ?? fixture.selections.full,
		selectionLabel: options.selectionLabel ?? "full asset",
	});
}

export async function runSelectedRangeExportArtifactHarness(
	options: ExportArtifactHarnessOptions = {},
): Promise<ExportArtifactHarnessResult> {
	const fixture = options.fixture ?? defaultFullAssetFixture();

	return runExportArtifactHarness({
		...options,
		fixture,
		selection: options.selection ?? fixture.selections.selectedRange,
		selectionLabel: options.selectionLabel ?? "selected range",
	});
}

async function runExportArtifactHarness({
	createAssetId = () => "export-artifact-harness-asset",
	createDraftId = () => "export-artifact-harness-draft",
	createFixtureSource = createBrowserFixtureSource,
	fetchFixtureBlob = fetchBrowserFixtureBlob,
	fixture = defaultFullAssetFixture(),
	inspectGeneratedMedia = inspectGeneratedMediaBlob,
	inspectLocalAsset = inspectBrowserLocalMediaAssetDraft,
	runner = browserDefaultExportRunner,
	runnerLabel = "browserDefaultExportRunner",
	runtime = detectRuntimeSupport(),
	selection = fixture.selections.full,
	selectionLabel = "full asset",
	signal,
}: ExportArtifactHarnessOptions): Promise<ExportArtifactHarnessResult> {
	if (!runtime.supported) {
		throw new Error(
			`Export artifact harness requires a supported runtime. ${runtime.reason}`,
		);
	}

	const sourceBlob = await fetchFixtureBlob(fixture);
	const source = createFixtureSource(sourceBlob, fixture);
	const draft = createLocalMediaAssetDraft(source, {
		createDraftId,
	});
	const analysis = await analyzeLocalMediaAssetDraft(draft, {
		createAssetId,
		inspect: inspectLocalAsset,
		runtime,
	});

	if (analysis.status !== "ready") {
		throw new Error(
			`Fixture ${fixture.id} could not become a ready media asset. ${
				analysis.failure.message
			}${
				analysis.failure.technicalDetails
					? ` ${analysis.failure.technicalDetails}`
					: ""
			}`,
		);
	}

	const progress: ExportProgress[] = [];
	const exportSignal = signal ?? new AbortController().signal;
	const exportResult = await runner.run({
		asset: analysis.asset,
		onProgress: (event) => {
			progress.push(event);
		},
		selection,
		signal: exportSignal,
		source,
	});
	const generatedBytes = new Uint8Array(await exportResult.blob.arrayBuffer());
	const generatedMimeType =
		exportResult.mimeType ||
		exportResult.blob.type ||
		"application/octet-stream";
	const generatedBlob =
		exportResult.blob.type === generatedMimeType
			? exportResult.blob
			: new Blob([generatedBytes], { type: generatedMimeType });
	const inspection = await inspectGeneratedMedia(generatedBlob);
	const rangeAccuracy = classifyExportRangeAccuracy({
		frameTiming: analysis.asset.frameTiming,
		generatedMedia: inspection,
		selection,
		sourceDurationUs: analysis.asset.durationUs,
	});
	const exportReview = planDefaultExportCapability({
		asset: analysis.asset,
		rangeAccuracy,
		runtime,
		selection,
	});

	return {
		artifact: {
			blob: generatedBlob,
			bytes: generatedBytes,
			fileName: exportResult.fileName,
			mimeType: generatedMimeType,
			sizeBytes: generatedBlob.size,
		},
		report: {
			delivery: {
				performed: false,
				reason:
					"The harness captures generated media bytes directly; download remains a separate Delivery action.",
				required: true,
			},
			execution: {
				generatedMedia: {
					fileName: exportResult.fileName,
					mimeType: generatedMimeType,
					sizeBytes: generatedBlob.size,
				},
				progress,
				requestedSelection: selection,
				runner: runnerLabel,
			},
			exportReview,
			fixture: {
				fileName: fixture.fileName,
				id: fixture.id,
				label: fixture.label,
				publicPath: fixture.publicPath,
				selectionLabel,
			},
			inspection,
			rangeAccuracy,
			source: {
				asset: {
					durationUs: analysis.asset.durationUs,
					frameTiming: analysis.asset.frameTiming,
					id: analysis.asset.id,
					label: analysis.asset.label,
					tracks: analysis.asset.tracks,
				},
				blob: {
					mimeType: source.type,
					sizeBytes: source.size,
				},
				selection,
			},
		},
	};
}

function defaultFullAssetFixture(): ExportCorrectnessFixture {
	const fixture = EXPORT_CORRECTNESS_FIXTURES.find(
		(candidate) => candidate.id === "mp4-video-only",
	);

	if (!fixture) {
		throw new Error(
			"The tiny MP4 video-only export fixture is not registered.",
		);
	}

	return fixture;
}

async function fetchBrowserFixtureBlob(
	fixture: ExportCorrectnessFixture,
): Promise<Blob> {
	const response = await fetch(fixture.publicPath);

	if (!response.ok) {
		throw new Error(
			`Could not fetch export fixture ${fixture.publicPath}: ${response.status} ${response.statusText}`,
		);
	}

	return response.blob();
}

function createBrowserFixtureSource(
	blob: Blob,
	fixture: ExportCorrectnessFixture,
): FixtureSource {
	const mimeType = blob.type || fixture.expected.mimeTypePrefix;

	if (typeof File === "function") {
		return new File([blob], fixture.fileName, {
			lastModified: 0,
			type: mimeType,
		});
	}

	Object.defineProperties(blob, {
		lastModified: {
			configurable: true,
			value: 0,
		},
		name: {
			configurable: true,
			value: fixture.fileName,
		},
	});

	return blob as FixtureSource;
}
