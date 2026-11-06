import { readFile } from "node:fs/promises";

import type { ExportBoundaryEvidence } from "@/editor-core/export-correctness";
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
		const run = vi.fn(async ({ resolvedOutput, selection }) => {
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
		});

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
			if (fixture.id === "mp4-sync-flash-click-two-audio") {
				const generatedFixture = requiredFixture("mp4-sync-flash-click");

				return {
					blob: await readFixtureBlob(
						generatedFixture.publicPath,
						generatedFixture.expected.mimeTypePrefix,
					),
					fileName: `${fixture.id}-export.mp4`,
					mimeType: "video/mp4",
				};
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
			exported: 4,
			total: 5,
			unsupported: 1,
		});
		expect(run).toHaveBeenCalledTimes(5);

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

		const twoAudioSyncFixture = exportedCatalogResult(
			catalog,
			"mp4-sync-flash-click-two-audio",
		);
		expect(twoAudioSyncFixture.report.inspection.container).toBe("mp4");
		expect(twoAudioSyncFixture.report.inspection.tracks.video).toHaveLength(1);
		expect(twoAudioSyncFixture.report.inspection.tracks.audio).toHaveLength(1);

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
	it.each<{
		evidence: ExportBoundaryEvidence;
		precision: string;
	}>([
		{
			evidence: { endDeltaUs: 10_000, kind: "start-and-end", startDeltaUs: 0 },
			precision: "Boundaries verified",
		},
	])(
		"feeds measured $evidence.kind evidence into artifact accuracy and review ($precision)",
		async ({ evidence, precision }) => {
			const fixture = requiredFixture("mp4-video-only");
			const sourceBlob = await readFixtureBlob(
				fixture.publicPath,
				fixture.expected.mimeTypePrefix,
			);
			const generatedBlob = sourceBlob.slice(
				0,
				sourceBlob.size,
				sourceBlob.type,
			);
			const signal = new AbortController().signal;
			const measureBoundaryEvidence = vi.fn(async (request) => {
				expect(request).toEqual({
					fixture,
					generatedBlob,
					selection: fixture.selections.selectedRange,
					signal,
					sourceBlob,
				});
				return evidence;
			});
			const result = await runSelectedRangeExportArtifactHarness({
				fetchFixtureBlob: async () => sourceBlob,
				fixture,
				inspectGeneratedMedia: async (blob) => ({
					...(await inspectGeneratedMediaBlob(blob)),
					durationUs: 1_000_000,
				}),
				inspectLocalAsset: async () => supportedInspection,
				measureBoundaryEvidence,
				runner: {
					cancelSupported: true,
					run: async () => ({
						blob: generatedBlob,
						mimeType: generatedBlob.type,
					}),
				},
				runtime: supportedRuntime,
				signal,
			});
			expect(measureBoundaryEvidence).toHaveBeenCalledTimes(1);
			expect(result.report.boundaryEvidence).toEqual(evidence);
			expect(result.report.rangeAccuracy.kind).toBe(
				precision === "Boundaries verified" ? "proven-precise" : "best-effort",
			);
			expect(result.report.exportReview).toMatchObject({
				precision: { label: precision },
				supported: true,
			});
		},
	);

	it("records a boundary measurement failure explicitly in the fixture catalog", async () => {
		const fixture = requiredFixture("mp4-video-only");
		const blob = await readFixtureBlob(
			fixture.publicPath,
			fixture.expected.mimeTypePrefix,
		);
		const result = await runFixtureCatalogExportArtifactHarness({
			fetchFixtureBlob: async () => blob,
			fixtures: [fixture],
			inspectLocalAsset: async () => supportedInspection,
			measureBoundaryEvidence: async () => {
				throw new Error("Presented frames could not be decoded.");
			},
			runner: {
				cancelSupported: true,
				run: async () => ({ blob, mimeType: blob.type }),
			},
			runtime: supportedRuntime,
			selectionKind: "selectedRange",
		});
		expect(result.results).toMatchObject([
			{
				failure: {
					reason: "Generated media boundary measurement failed.",
					stage: "boundary-measurement",
					technicalDetails: "Presented frames could not be decoded.",
				},
				status: "unsupported",
			},
		]);
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
		analysis: {
			averageFrameRate: 25,
			frameRateIsConstant: true,
			maxFrameRate: 25,
			medianFrameRate: 25,
			minFrameRate: 25,
			probedPacketCount: 256,
			underlyingFrameRate: 25,
		},
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
		audioTracks: Array.from(
			{ length: fixture.expected.audioTrackCount },
			(_, index) => ({
				channels: 2,
				codec: "mp4a.40.2",
				id: `audio-${index + 1}`,
				label: `Audio ${index + 1}`,
				sampleRate: 44_100,
			}),
		),
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
