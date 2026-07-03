import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { EXPORT_CORRECTNESS_FIXTURES } from "./export-correctness-fixtures";

describe("preview sync regression fixture", () => {
	it("registers the sync flash/click fixture as first-class preview regression coverage", () => {
		const syncFixture = EXPORT_CORRECTNESS_FIXTURES.find(
			(fixture) => fixture.id === "mp4-sync-flash-click",
		);

		if (!syncFixture?.previewSync) {
			throw new Error(
				"Expected the sync flash/click fixture to include preview sync metadata.",
			);
		}

		expect(syncFixture.previewSync).toEqual({
			eventDurationUs: 100_000,
			eventsUs: Array.from({ length: 9 }, (_, index) => {
				const eventTimeUs = (index + 1) * 1_000_000;

				return {
					audioClickUs: eventTimeUs,
					visualFlashUs: eventTimeUs,
				};
			}),
			manualQaDocumentPath: "docs/preview-sync-regression.md",
			regressionScenarios: [
				"play-pause-seek-frame-step",
				"selection-loop",
				"audio-mix-changes",
			],
		});

		const manualQaDocument = readFileSync(
			join(process.cwd(), syncFixture.previewSync.manualQaDocumentPath),
			"utf8",
		);

		expect(manualQaDocument).toContain("sync-flash-click.mp4");
		expect(manualQaDocument).toContain("1.0s through 9.0s");
		expect(manualQaDocument).toContain("play, pause, seek, frame-step");
		expect(manualQaDocument).toContain("selection loop");
		expect(manualQaDocument).toContain("audio mix");
		expect(manualQaDocument).toContain("original visible-drift failure");
	});

	it("documents the preview clock authority invariant and regression path", () => {
		const invariantDocument = readFileSync(
			join(process.cwd(), "docs/preview-clock-invariant.md"),
			"utf8",
		);
		const normalizedInvariantDocument = invariantDocument.replace(/\s+/g, " ");

		expect(normalizedInvariantDocument).toContain(
			"Single-asset editing session",
		);
		expect(normalizedInvariantDocument).toContain("Preview clock state");
		expect(normalizedInvariantDocument).toContain(
			"audio engine is the preview time authority",
		);
		expect(normalizedInvariantDocument).toContain(
			"native video is a muted visual follower",
		);
		expect(normalizedInvariantDocument).toContain(
			"WaveSurfer waveform rendering",
		);
		expect(normalizedInvariantDocument).toContain("Export jobs");
		expect(invariantDocument).toContain("docs/preview-sync-regression.md");
		expect(invariantDocument).toContain("sync-flash-click.mp4");
	});
});
