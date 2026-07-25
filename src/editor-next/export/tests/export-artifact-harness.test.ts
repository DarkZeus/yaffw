import { readFile } from "node:fs/promises";

import type { LocalMediaAssetInspection } from "@/editor-core/local-file-analysis";
import { createDefaultOutputSettings } from "@/editor-core/model";
import { evaluateRuntimeSupport } from "@/editor-core/runtime-capabilities";
import { describe, expect, it, vi } from "vitest";

import { inspectGeneratedMediaBlob } from "../generated-media/generated-media-inspector";
import {
	runFixtureCatalogExportArtifactHarness,
	runFullAssetExportArtifactHarness,
	runSelectedRangeExportArtifactHarness,
} from "../harness/export-artifact-harness";
import { EXPORT_CORRECTNESS_FIXTURES } from "../harness/export-correctness-fixtures";

describe("full-asset export artifact harness", () => {
	it("captures and inspects generated media bytes without performing delivery", async () => {
		const fixture = EXPORT_CORRECTNESS_FIXTURES.find(
			(candidate) => candidate.id === "mp4-video-only",
		);
		expect(fixture).toBeDefined();

		if (!fixture) {
			throw new Error("Expected the tiny MP4 video-only fixture to exist.");
		}

		const fixtureBlob = await readFixtureBlob(
			fixture.publicPath,
			fixture.expected.mimeTypePrefix,
		);
		const inspectLocalAsset = vi.fn(async () => supportedInspection);
		const run = vi.fn(async ({ onProgress, selection, source }) => {
			expect(selection).toEqual(fixture.selections.full);
			expect(source).toBeInstanceOf(Blob);
			expect(source.size).toBe(fixtureBlob.size);

			onProgress({
				phase: "preparing",
			});
			onProgress({
				completedRatio: 1,
				phase: "finalizing",
			});

			return {
				blob: fixtureBlob,
				fileName: "tiny-video-only-export.mp4",
				mimeType: "video/mp4",
			};
		});

		const result = await runFullAssetExportArtifactHarness({
			fetchFixtureBlob: async () => fixtureBlob,
			fixture,
			inspectGeneratedMedia: inspectGeneratedMediaBlob,
			inspectLocalAsset,
			runtime: supportedRuntime,
			runner: {
				cancelSupported: true,
				run,
			},
		});

		expect(inspectLocalAsset).toHaveBeenCalledTimes(1);
		expect(run).toHaveBeenCalledTimes(1);
		expect(result.artifact.bytes).toBeInstanceOf(Uint8Array);
		expect(result.artifact.bytes.byteLength).toBe(fixtureBlob.size);
		expect(result.artifact.blob.size).toBe(fixtureBlob.size);
		expect(result.report.execution.progress).toEqual([
			{
				phase: "preparing",
			},
			{
				completedRatio: 1,
				phase: "finalizing",
			},
		]);
		expect(result.report.execution.requestedSelection).toEqual(
			fixture.selections.full,
		);
		expect(result.report.execution.generatedMedia.sizeBytes).toBe(
			fixtureBlob.size,
		);
		expect(result.report.execution.generatedMedia.fileName).toBe(
			"tiny-video-only-export.mp4",
		);
		expect(result.report.execution.generatedMedia.mimeType).toBe("video/mp4");
		expect(result.report.inspection.durationUs).toBeCloseTo(
			fixture.expected.durationUs,
			-4,
		);
		expect(result.report.inspection.tracks.video).toHaveLength(
			fixture.expected.videoTrackCount,
		);
		expect(result.report.delivery).toEqual({
			performed: false,
			reason:
				"The harness captures generated media bytes directly; download remains a separate Delivery action.",
			required: true,
		});
	});

	it("carries a non-default documented profile through artifact inspection and Generated media metadata", async () => {
		const sourceFixture = requiredFixture("mp4-video-only");
		const generatedFixture = requiredFixture("webm-video-only");
		const sourceBlob = await readFixtureBlob(
			sourceFixture.publicPath,
			sourceFixture.expected.mimeTypePrefix,
		);
		const generatedBlob = await readFixtureBlob(
			generatedFixture.publicPath,
			generatedFixture.expected.mimeTypePrefix,
		);
		const outputSettings = createDefaultOutputSettings();
		outputSettings.container = {
			container: "webm",
			kind: "documented-container",
		};
		outputSettings.videoCodec = {
			codec: "vp8",
			kind: "documented-codec",
		};
		const run = vi.fn(
			async ({
				outputSettings: requestedOutputSettings,
				resolvedOutput,
				selection,
			}) => {
				expect(requestedOutputSettings).toEqual(outputSettings);
				expect(resolvedOutput).toMatchObject({
					audioCodec: undefined,
					container: {
						fileExtension: ".webm",
						id: "webm",
						mimeType: "video/webm",
					},
					videoCodec: "vp8",
				});
				expect(selection).toEqual(sourceFixture.selections.full);

				return {
					blob: generatedBlob,
					fileName: "tiny-video-only-export.mp4",
					mimeType: "video/webm",
				};
			},
		);

		const result = await runFullAssetExportArtifactHarness({
			fetchFixtureBlob: async () => sourceBlob,
			fixture: sourceFixture,
			inspectGeneratedMedia: inspectGeneratedMediaBlob,
			inspectLocalAsset: async () => supportedInspection,
			outputSettings,
			runtime: supportedRuntime,
			runner: {
				cancelSupported: true,
				run,
			},
		});

		expect(run).toHaveBeenCalledTimes(1);
		expect(result.artifact.mimeType).toBe("video/webm");
		expect(result.artifact.fileName).toBe("tiny-video-only-export.webm");
		expect(result.report.inspection).toMatchObject({
			container: "webm",
			mimeType: expect.stringMatching(/^video\/webm/),
			tracks: {
				audio: [],
				video: [
					expect.objectContaining({
						codec: "vp8",
						height: 90,
						width: 160,
					}),
				],
			},
		});
		expect(result.report.execution.generatedMedia).toMatchObject({
			fileName: "tiny-video-only-export.webm",
			mimeType: "video/webm",
			outputSettings,
			resolvedOutput: {
				audioCodec: undefined,
				container: {
					fileExtension: ".webm",
					id: "webm",
					mimeType: "video/webm",
				},
				videoCodec: "vp8",
			},
		});
		expect(result.report.exportReview).toMatchObject({
			plannedOutput: {
				container: "webm",
				videoCodec: "vp8",
			},
			supported: true,
		});
		expect(result.report.rangeAccuracy).toMatchObject({
			kind: "full-asset",
			precisionProven: false,
		});
		expect(result.report.delivery).toMatchObject({
			performed: false,
			required: true,
		});
	});

	it("reports a documented-profile runner failure instead of hiding the profile", async () => {
		const fixture = requiredFixture("mp4-video-only");
		const fixtureBlob = await readFixtureBlob(
			fixture.publicPath,
			fixture.expected.mimeTypePrefix,
		);
		const outputSettings = createDefaultOutputSettings();
		outputSettings.container = {
			container: "webm",
			kind: "documented-container",
		};
		outputSettings.videoCodec = {
			codec: "vp9",
			kind: "documented-codec",
		};

		const catalog = await runFixtureCatalogExportArtifactHarness({
			fetchFixtureBlob: async () => fixtureBlob,
			fixtures: [fixture],
			inspectLocalAsset: async () => supportedInspection,
			outputSettings,
			runtime: supportedRuntime,
			runner: {
				cancelSupported: true,
				run: async () => {
					throw new Error(
						"The runtime could not initialize its documented VP9 encoder.",
					);
				},
			},
		});

		expect(catalog.summary).toEqual({
			exported: 0,
			total: 1,
			unsupported: 1,
		});
		const failure = unsupportedCatalogResult(catalog, fixture.id).failure;
		expect(failure.stage).toBe("export-runner");
		expect(failure.reason).toBe(
			"Fixture export failed before generated media could be inspected.",
		);
		expect(failure.technicalDetails).toContain("documented VP9 encoder");
	});

	it("reports an unavailable output profile before running export", async () => {
		const fixture = requiredFixture("mp4-video-only");
		const fixtureBlob = await readFixtureBlob(
			fixture.publicPath,
			fixture.expected.mimeTypePrefix,
		);
		const outputSettings = createDefaultOutputSettings();
		outputSettings.container = {
			container: "unavailable-container",
			kind: "documented-container",
		};
		const run = vi.fn();

		const catalog = await runFixtureCatalogExportArtifactHarness({
			fetchFixtureBlob: async () => fixtureBlob,
			fixtures: [fixture],
			inspectLocalAsset: async () => supportedInspection,
			outputSettings,
			runtime: supportedRuntime,
			runner: {
				cancelSupported: true,
				run,
			},
		});

		expect(run).not.toHaveBeenCalled();
		const failure = unsupportedCatalogResult(catalog, fixture.id).failure;
		expect(failure.stage).toBe("profile-capability");
		expect(failure.reason).toBe(
			"The selected documented output profile is unavailable.",
		);
		expect(failure.technicalDetails).toContain(
			"unavailable-container container is not documented",
		);
	});
});

describe("fixture catalog export artifact harness", () => {
	it("measures supported fixtures and reports unsupported fixture export capability", async () => {
		const inspectLocalAsset = vi.fn(async (draft) =>
			inspectionForFixtureLabel(draft.label),
		);
		const run = vi.fn(async ({ selection, source }) => {
			const fixture = EXPORT_CORRECTNESS_FIXTURES.find(
				(candidate) => candidate.fileName === source.name,
			);
			expect(fixture).toBeDefined();

			if (!fixture) {
				throw new Error(`Unexpected fixture source ${source.name}.`);
			}

			expect(selection).toEqual(fixture.selections.full);

			if (fixture.container === "webm") {
				throw new Error(
					"WebM input cannot be exported with the default MP4/H.264/AAC profile in this runtime.",
				);
			}

			return {
				blob: source,
				fileName: `${fixture.id}-export.mp4`,
				mimeType: "video/mp4",
			};
		});

		const catalog = await runFixtureCatalogExportArtifactHarness({
			fetchFixtureBlob: (fixture) =>
				readFixtureBlob(fixture.publicPath, fixture.expected.mimeTypePrefix),
			inspectGeneratedMedia: inspectGeneratedMediaBlob,
			inspectLocalAsset,
			runtime: supportedRuntime,
			runner: {
				cancelSupported: true,
				run,
			},
		});

		expect(catalog.summary).toEqual({
			exported: 3,
			total: 4,
			unsupported: 1,
		});
		expect(run).toHaveBeenCalledTimes(4);

		const videoOnly = exportedCatalogResult(catalog, "mp4-video-only");
		expect(videoOnly.report.inspection.container).toBe("mp4");
		expect(videoOnly.report.inspection.tracks.video).toHaveLength(1);
		expect(videoOnly.report.inspection.tracks.audio).toHaveLength(0);

		const withAudio = exportedCatalogResult(catalog, "mp4-video-with-audio");
		expect(withAudio.report.inspection.container).toBe("mp4");
		expect(withAudio.report.inspection.tracks.video).toHaveLength(1);
		expect(withAudio.report.inspection.tracks.audio).toHaveLength(1);

		const syncFixture = exportedCatalogResult(catalog, "mp4-sync-flash-click");
		expect(syncFixture.report.inspection.container).toBe("mp4");
		expect(syncFixture.report.inspection.tracks.video).toHaveLength(1);
		expect(syncFixture.report.inspection.tracks.audio).toHaveLength(1);
		expect(
			EXPORT_CORRECTNESS_FIXTURES.find(
				(candidate) => candidate.id === "mp4-sync-flash-click",
			)?.expected,
		).toEqual(
			expect.objectContaining({
				syncEventDurationUs: 100_000,
				syncEventsUs: [
					{ audioClickUs: 1_000_000, visualFlashUs: 1_000_000 },
					{ audioClickUs: 2_000_000, visualFlashUs: 2_000_000 },
					{ audioClickUs: 3_000_000, visualFlashUs: 3_000_000 },
					{ audioClickUs: 4_000_000, visualFlashUs: 4_000_000 },
					{ audioClickUs: 5_000_000, visualFlashUs: 5_000_000 },
					{ audioClickUs: 6_000_000, visualFlashUs: 6_000_000 },
					{ audioClickUs: 7_000_000, visualFlashUs: 7_000_000 },
					{ audioClickUs: 8_000_000, visualFlashUs: 8_000_000 },
					{ audioClickUs: 9_000_000, visualFlashUs: 9_000_000 },
				],
			}),
		);

		const webm = unsupportedCatalogResult(catalog, "webm-video-only");
		expect(webm.failure.stage).toBe("export-runner");
		expect(webm.failure.reason).toBe(
			"Fixture export failed before generated media could be inspected.",
		);
		expect(webm.failure.technicalDetails).toContain(
			"WebM input cannot be exported",
		);
	});
});

describe("selected-range export artifact harness", () => {
	it("captures a selected-range artifact and reports duration drift conservatively", async () => {
		const fixture = EXPORT_CORRECTNESS_FIXTURES.find(
			(candidate) => candidate.id === "mp4-video-only",
		);
		expect(fixture).toBeDefined();

		if (!fixture) {
			throw new Error("Expected the tiny MP4 video-only fixture to exist.");
		}

		const fixtureBlob = await readFixtureBlob(
			fixture.publicPath,
			fixture.expected.mimeTypePrefix,
		);
		const inspectLocalAsset = vi.fn(async () => supportedInspection);
		const run = vi.fn(async ({ selection }) => {
			expect(selection).toEqual(fixture.selections.selectedRange);

			return {
				blob: fixtureBlob,
				fileName: "tiny-video-only-selected-export.mp4",
				mimeType: "video/mp4",
			};
		});

		const result = await runSelectedRangeExportArtifactHarness({
			fetchFixtureBlob: async () => fixtureBlob,
			fixture,
			inspectGeneratedMedia: inspectGeneratedMediaBlob,
			inspectLocalAsset,
			runtime: supportedRuntime,
			runner: {
				cancelSupported: true,
				run,
			},
		});

		expect(run).toHaveBeenCalledTimes(1);
		expect(result.report.execution.requestedSelection).toEqual(
			fixture.selections.selectedRange,
		);
		expect(result.report.rangeAccuracy.kind).toBe("best-effort");
		expect(result.report.rangeAccuracy.generatedDurationUs).toBe(
			fixture.expected.durationUs,
		);
		expect(result.report.rangeAccuracy.requestedDurationUs).toBe(1_000_000);
		expect(result.report.rangeAccuracy.durationDeltaUs).toBe(1_000_000);
		expect(result.report.rangeAccuracy.toleranceUs).toBe(40_000);
		expect(result.report.exportReview.supported).toBe(true);
		if (!result.report.exportReview.supported) {
			throw new Error(
				`Expected supported review: ${result.report.exportReview.reason}`,
			);
		}
		expect(result.report.exportReview.method.label).toBe("Standard export");
		expect(result.report.exportReview.precision.label).toBe(
			"Boundaries unverified",
		);
		expect(result.report.exportReview.reason).toContain(
			"boundary evidence is unavailable",
		);
	});
});

async function readFixtureBlob(
	publicPath: string,
	mimeType: string,
): Promise<Blob> {
	const bytes = await readFile(
		new URL(`../../../../public${publicPath}`, import.meta.url),
	);

	return new Blob([new Uint8Array(bytes)], { type: mimeType });
}

const supportedRuntime = evaluateRuntimeSupport({
	fileApi: true,
	mediaSource: true,
	objectUrl: true,
	videoDecoder: true,
	videoEncoder: true,
});

const supportedInspection = {
	audioTracks: [],
	durationUs: 2_000_000,
	frameTiming: {
		fps: 25,
		frameDurationUs: 40_000,
		source: "known",
	},
	videoTracks: [
		{
			codec: "avc1.42c00d",
			height: 90,
			id: "video-1",
			label: "Video 1",
			width: 160,
		},
	],
} satisfies LocalMediaAssetInspection;

function inspectionForFixtureLabel(label: string): LocalMediaAssetInspection {
	const fixture = EXPORT_CORRECTNESS_FIXTURES.find(
		(candidate) => candidate.fileName === label,
	);

	if (!fixture) {
		throw new Error(`Unknown fixture ${label}.`);
	}

	return {
		...supportedInspection,
		audioTracks:
			fixture.expected.audioTrackCount === 0
				? []
				: [
						{
							channels: 2,
							codec: "mp4a.40.2",
							id: "audio-1",
							label: "Audio 1",
							sampleRate: 44_100,
						},
					],
		durationUs: fixture.expected.durationUs,
		videoTracks: [
			{
				codec: fixture.container === "mp4" ? "avc1.42c00d" : "vp8",
				height: 90,
				id: "video-1",
				label: "Video 1",
				width: 160,
			},
		],
	};
}

function requiredFixture(id: string) {
	const fixture = EXPORT_CORRECTNESS_FIXTURES.find(
		(candidate) => candidate.id === id,
	);

	if (!fixture) {
		throw new Error(`Expected export correctness fixture ${id}.`);
	}

	return fixture;
}

function exportedCatalogResult(
	catalog: Awaited<ReturnType<typeof runFixtureCatalogExportArtifactHarness>>,
	fixtureId: string,
) {
	const result = catalog.results.find(
		(candidate) => candidate.fixture.id === fixtureId,
	);

	if (!result || result.status !== "exported") {
		throw new Error(`Expected exported catalog result for ${fixtureId}.`);
	}

	return result;
}

function unsupportedCatalogResult(
	catalog: Awaited<ReturnType<typeof runFixtureCatalogExportArtifactHarness>>,
	fixtureId: string,
) {
	const result = catalog.results.find(
		(candidate) => candidate.fixture.id === fixtureId,
	);

	if (!result || result.status !== "unsupported") {
		throw new Error(`Expected unsupported catalog result for ${fixtureId}.`);
	}

	return result;
}
