import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { EXPORT_CORRECTNESS_FIXTURES } from "./export-correctness-fixtures";
import { inspectGeneratedMediaBlob } from "./generated-media-inspector";

describe("generated media inspector", () => {
	it.each(EXPORT_CORRECTNESS_FIXTURES)(
		"inspects $label fixture track inventory and duration",
		async (fixture) => {
			const inspection = await inspectGeneratedMediaBlob(
				await readFixtureBlob(fixture.publicPath, fixture.expected.mimeTypePrefix),
			);

			expect(inspection.container).toBe(fixture.container);
			expect(inspection.mimeType).toMatch(fixture.expected.mimeTypePrefix);
			expect(inspection.durationUs).toBeCloseTo(
				fixture.expected.durationUs,
				-4,
			);
			expect(inspection.tracks.video).toHaveLength(
				fixture.expected.videoTrackCount,
			);
			expect(inspection.tracks.audio).toHaveLength(
				fixture.expected.audioTrackCount,
			);
			expect(inspection.tracks.video[0]?.width).toBe(160);
			expect(inspection.tracks.video[0]?.height).toBe(90);
		},
	);
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
