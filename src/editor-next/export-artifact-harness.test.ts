import { readFile } from "node:fs/promises";

import type { LocalMediaAssetInspection } from "@/editor-core/local-file-analysis";
import { evaluateRuntimeSupport } from "@/editor-core/runtime-capabilities";
import { describe, expect, it, vi } from "vitest";

import { EXPORT_CORRECTNESS_FIXTURES } from "./export-correctness-fixtures";
import { runFullAssetExportArtifactHarness } from "./export-artifact-harness";
import { inspectGeneratedMediaBlob } from "./generated-media-inspector";

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
});

async function readFixtureBlob(
	publicPath: string,
	mimeType: string,
): Promise<Blob> {
	const bytes = await readFile(
		new URL(`../../public${publicPath}`, import.meta.url),
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
	defaultProfileExportable: true,
	durationUs: 2_000_000,
	frameTiming: {
		fps: 25,
		frameDurationUs: 40_000,
		source: "known",
	},
	previewable: true,
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
