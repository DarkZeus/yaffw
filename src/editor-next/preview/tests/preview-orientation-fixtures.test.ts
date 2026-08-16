import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { MediaAssetDraft } from "@/editor-core/model";
import { inspectBrowserLocalMediaAssetDraft } from "../../media-asset/adapters/browser-local-asset-analyzer";
import { PREVIEW_ORIENTATION_FIXTURES } from "../harness/preview-orientation-fixtures";
import { getPreviewDisplayAspectRatio } from "../layout/preview-aperture-layout";

describe("Preview orientation fixtures", () => {
	it("preserves container rotation as analyzed display dimensions", async () => {
		for (const fixture of PREVIEW_ORIENTATION_FIXTURES) {
			const fixturePath = join(
				process.cwd(),
				"public",
				fixture.publicPath.replace(/^\//, ""),
			);
			const bytes = await readFile(fixturePath);
			const source = new File([bytes], `${fixture.id}.mp4`, {
				type: "video/mp4",
			});
			const draft = {
				id: fixture.id,
				kind: "local-file",
				label: source.name,
				provenance: {
					fileName: source.name,
					mimeType: source.type,
					sizeBytes: source.size,
				},
				source,
			} satisfies MediaAssetDraft;

			const inspection = await inspectBrowserLocalMediaAssetDraft(draft, {});
			const primaryVideoTrack = inspection.videoTracks[0];

			expect(primaryVideoTrack, fixture.id).toMatchObject(
				fixture.displayDimensions,
			);
			expect(
				getPreviewDisplayAspectRatio({
					tracks: {
						audio: [],
						video: primaryVideoTrack
							? [{ ...primaryVideoTrack, kind: "video" }]
							: [],
					},
				}),
				fixture.id,
			).toBe(
				fixture.displayDimensions.width / fixture.displayDimensions.height,
			);
		}
	});
});
