import type { GeneratedMediaInspection } from "@/editor-core/export-correctness";
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

export type FullAssetExportArtifactHarnessOptions = {
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
	signal?: AbortSignal;
};

export type FullAssetExportArtifactHarnessResult = {
	artifact: {
		blob: Blob;
		bytes: Uint8Array;
		fileName?: string;
		mimeType: string;
		sizeBytes: number;
	};
	report: FullAssetExportArtifactHarnessReport;
};

export type FullAssetExportArtifactHarnessReport = {
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
	fixture: {
		fileName: string;
		id: string;
		label: string;
		publicPath: string;
	};
	inspection: GeneratedMediaInspection;
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

export async function runFullAssetExportArtifactHarness({
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
	signal,
}: FullAssetExportArtifactHarnessOptions = {}): Promise<FullAssetExportArtifactHarnessResult> {
	if (!runtime.supported) {
		throw new Error(`Export artifact harness requires a supported runtime. ${runtime.reason}`);
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
		selection: analysis.selection,
		signal: exportSignal,
		source,
	});
	const generatedBytes = new Uint8Array(await exportResult.blob.arrayBuffer());
	const generatedMimeType =
		exportResult.mimeType || exportResult.blob.type || "application/octet-stream";
	const generatedBlob =
		exportResult.blob.type === generatedMimeType
			? exportResult.blob
			: new Blob([generatedBytes], { type: generatedMimeType });
	const inspection = await inspectGeneratedMedia(generatedBlob);

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
				requestedSelection: analysis.selection,
				runner: runnerLabel,
			},
			fixture: {
				fileName: fixture.fileName,
				id: fixture.id,
				label: fixture.label,
				publicPath: fixture.publicPath,
			},
			inspection,
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
				selection: analysis.selection,
			},
		},
	};
}

function defaultFullAssetFixture(): ExportCorrectnessFixture {
	const fixture = EXPORT_CORRECTNESS_FIXTURES.find(
		(candidate) => candidate.id === "mp4-video-only",
	);

	if (!fixture) {
		throw new Error("The tiny MP4 video-only export fixture is not registered.");
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
