import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import {
	type ExportCapabilityReview,
	planDefaultExportCapability,
} from "@/editor-core/export-capability";
import {
	type ExportRangeAccuracyReport,
	type GeneratedMediaInspection,
	classifyExportRangeAccuracy,
} from "@/editor-core/export-correctness";
import {
	type LocalMediaAssetInspector,
	analyzeLocalMediaAssetDraft,
} from "@/editor-core/local-file-analysis";
import { createLocalMediaAssetDraft } from "@/editor-core/local-file-import";
import {
	type ExportProgress,
	type GeneratedMedia,
	type LocalFileSource,
	type OutputSettings,
	type ReadyMediaAsset,
	type Selection,
	createDefaultOutputSettings,
} from "@/editor-core/model";
import {
	type BrowserLocalOutputSupport,
	resolveOutputPlan,
} from "@/editor-core/output-settings";
import {
	type RuntimeSupport,
	detectRuntimeSupport,
} from "@/editor-core/runtime-capabilities";

import { inspectBrowserLocalMediaAssetDraft } from "../../media-asset/adapters/browser-local-asset-analyzer";
import { MEDIABUNNY_OUTPUT_SUPPORT } from "../adapters/mediabunny-output-support";
import { inspectGeneratedMediaBlob } from "../generated-media/generated-media-inspector";
import { createGeneratedMediaMetadata } from "../generated-media/generated-media-metadata";
import { browserDefaultExportRunner } from "../runners/default-export-runner";
import type { DefaultExportRunner } from "../types/default-export-runner.types";
import {
	EXPORT_CORRECTNESS_FIXTURES,
	type ExportCorrectnessFixture,
} from "./export-correctness-fixtures";

export type FixtureSource = Blob & LocalFileSource;

export type ExportArtifactHarnessOptions = {
	createAssetId?: () => string;
	createDraftId?: () => string;
	createGeneratedMediaId?: () => string;
	createFixtureSource?: (
		blob: Blob,
		fixture: ExportCorrectnessFixture,
	) => FixtureSource;
	fetchFixtureBlob?: (fixture: ExportCorrectnessFixture) => Promise<Blob>;
	fixture?: ExportCorrectnessFixture;
	inspectGeneratedMedia?: (blob: Blob) => Promise<GeneratedMediaInspection>;
	inspectLocalAsset?: LocalMediaAssetInspector;
	now?: () => number;
	outputSettings?: OutputSettings;
	outputSupport?: BrowserLocalOutputSupport;
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
	| "profile-capability"
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
		generatedMedia: GeneratedMedia;
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

export async function runFixtureCatalogExportArtifactHarness({
	fixtures = EXPORT_CORRECTNESS_FIXTURES,
	selectionKind = "full",
	...options
}: ExportFixtureCatalogHarnessOptions = {}): Promise<ExportFixtureCatalogHarnessResult> {
	const selectionLabel = selectionLabelForCatalogKind(selectionKind);
	const results: ExportFixtureCatalogResult[] = [];

	for (const fixture of fixtures) {
		const selection = fixture.selections[selectionKind];

		try {
			const result = await runExportArtifactHarness({
				...options,
				fixture,
				selection,
				selectionLabel,
			});

			results.push({
				artifact: result.artifact,
				fixture: result.report.fixture,
				report: result.report,
				status: "exported",
			});
		} catch (error) {
			results.push({
				failure: failureFromError(error),
				fixture: fixtureReport(fixture, selectionLabel),
				selection,
				status: "unsupported",
			});
		}
	}

	const exported = results.filter(
		(result) => result.status === "exported",
	).length;

	return {
		results,
		summary: {
			exported,
			total: results.length,
			unsupported: results.length - exported,
		},
	};
}

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
	createGeneratedMediaId = () => "export-artifact-harness-generated-media",
	createFixtureSource = createBrowserFixtureSource,
	fetchFixtureBlob = fetchBrowserFixtureBlob,
	fixture = defaultFullAssetFixture(),
	inspectGeneratedMedia = inspectGeneratedMediaBlob,
	inspectLocalAsset = inspectBrowserLocalMediaAssetDraft,
	now = () => 0,
	outputSettings = createDefaultOutputSettings(),
	outputSupport = MEDIABUNNY_OUTPUT_SUPPORT,
	runner = browserDefaultExportRunner,
	runnerLabel = "browserDefaultExportRunner",
	runtime = detectRuntimeSupport(),
	selection = fixture.selections.full,
	selectionLabel = "full asset",
	signal,
}: ExportArtifactHarnessOptions): Promise<ExportArtifactHarnessResult> {
	if (!runtime.supported) {
		throw new ExportArtifactHarnessFailure(
			"runtime-capability",
			"The current runtime cannot run export fixture measurements.",
			runtime.reason,
		);
	}

	let sourceBlob: Blob;

	try {
		sourceBlob = await fetchFixtureBlob(fixture);
	} catch (error) {
		throw new ExportArtifactHarnessFailure(
			"fixture-source",
			`Fixture ${fixture.id} could not be loaded.`,
			errorToTechnicalDetails(error),
		);
	}

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
		throw new ExportArtifactHarnessFailure(
			"asset-capability",
			analysis.failure.message,
			analysis.failure.technicalDetails,
		);
	}

	const audioMix = createDefaultAudioMix(analysis.asset);
	const resolvedOutput = resolveOutputPlan({
		asset: analysis.asset,
		audioMix,
		outputSettings,
		support: outputSupport,
	});

	if (resolvedOutput.kind === "invalid") {
		throw new ExportArtifactHarnessFailure(
			"profile-capability",
			"The selected documented output profile is unavailable.",
			resolvedOutput.error,
		);
	}

	const exportReadiness = planDefaultExportCapability({
		asset: analysis.asset,
		audioMix,
		outputSettings,
		runtime,
		selection,
		support: outputSupport,
	});

	if (!exportReadiness.supported) {
		throw new ExportArtifactHarnessFailure(
			"asset-capability",
			exportReadiness.reason,
			exportReadiness.technicalDetails,
		);
	}

	const progress: ExportProgress[] = [];
	const exportSignal = signal ?? new AbortController().signal;
	let exportResult: Awaited<ReturnType<DefaultExportRunner["run"]>>;

	try {
		exportResult = await runner.run({
			asset: analysis.asset,
			audioMix,
			onProgress: (event) => {
				progress.push(event);
			},
			outputSettings,
			resolvedOutput: resolvedOutput.plan,
			selection,
			signal: exportSignal,
			source,
		});
	} catch (error) {
		throw new ExportArtifactHarnessFailure(
			"export-runner",
			"Fixture export failed before generated media could be inspected.",
			errorToTechnicalDetails(error),
		);
	}

	let generatedBytes: Uint8Array;

	try {
		generatedBytes = new Uint8Array(await exportResult.blob.arrayBuffer());
	} catch (error) {
		throw new ExportArtifactHarnessFailure(
			"export-runner",
			"Fixture export failed before generated media bytes could be captured.",
			errorToTechnicalDetails(error),
		);
	}

	const generatedMimeType =
		exportResult.mimeType ||
		exportResult.blob.type ||
		"application/octet-stream";
	const generatedBlob =
		exportResult.blob.type === generatedMimeType
			? exportResult.blob
			: new Blob([generatedBytes], { type: generatedMimeType });
	let inspection: GeneratedMediaInspection;

	try {
		inspection = await inspectGeneratedMedia(generatedBlob);
	} catch (error) {
		throw new ExportArtifactHarnessFailure(
			"generated-media-inspection",
			"Generated media could not be inspected.",
			errorToTechnicalDetails(error),
		);
	}

	const rangeAccuracy = classifyExportRangeAccuracy({
		frameTiming: analysis.asset.frameTiming,
		generatedMedia: inspection,
		selection,
		sourceDurationUs: analysis.asset.durationUs,
	});
	const exportReview = planDefaultExportCapability({
		asset: analysis.asset,
		audioMix,
		outputSettings,
		rangeAccuracy,
		runtime,
		selection,
		support: outputSupport,
	});
	const generatedMedia = createGeneratedMediaMetadata({
		asset: analysis.asset,
		blob: generatedBlob,
		fileName: exportResult.fileName,
		generatedMediaId: createGeneratedMediaId(),
		now,
		outputSettings,
		resolvedOutput: resolvedOutput.plan,
		selection,
	});

	return {
		artifact: {
			blob: generatedBlob,
			bytes: generatedBytes,
			fileName: generatedMedia.fileName,
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
				generatedMedia,
				progress,
				requestedSelection: selection,
				runner: runnerLabel,
			},
			exportReview,
			fixture: {
				...fixtureReport(fixture, selectionLabel),
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

class ExportArtifactHarnessFailure extends Error {
	readonly reason: string;
	readonly stage: ExportArtifactHarnessFailureStage;
	readonly technicalDetails?: string;

	constructor(
		stage: ExportArtifactHarnessFailureStage,
		reason: string,
		technicalDetails?: string,
	) {
		super(technicalDetails ? `${reason} ${technicalDetails}` : reason);
		this.name = "ExportArtifactHarnessFailure";
		this.reason = reason;
		this.stage = stage;
		this.technicalDetails = technicalDetails;
	}
}

function failureFromError(error: unknown): {
	reason: string;
	stage: ExportArtifactHarnessFailureStage;
	technicalDetails?: string;
} {
	if (error instanceof ExportArtifactHarnessFailure) {
		return {
			reason: error.reason,
			stage: error.stage,
			technicalDetails: error.technicalDetails,
		};
	}

	return {
		reason: "Fixture export failed before generated media could be inspected.",
		stage: "export-runner",
		technicalDetails: errorToTechnicalDetails(error),
	};
}

function fixtureReport(
	fixture: ExportCorrectnessFixture,
	selectionLabel: string,
): ExportArtifactHarnessReport["fixture"] {
	return {
		fileName: fixture.fileName,
		id: fixture.id,
		label: fixture.label,
		publicPath: fixture.publicPath,
		selectionLabel,
	};
}

function selectionLabelForCatalogKind(
	selectionKind: ExportFixtureCatalogSelectionKind,
): string {
	switch (selectionKind) {
		case "full":
			return "full asset";
		case "selectedRange":
			return "selected range";
	}
}

function errorToTechnicalDetails(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
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
