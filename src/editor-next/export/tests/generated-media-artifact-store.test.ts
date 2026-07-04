import { describe, expect, it, vi } from "vitest";

import type { GeneratedMedia } from "@/editor-core/model";
import { DEFAULT_OUTPUT_PROFILE } from "@/editor-core/model";

import { createGeneratedMediaArtifactStore } from "../generated-media/generated-media-artifact-store";

describe("Generated media artifact store", () => {
	it("retains, delivers, invalidates, and clears Generated media blobs by metadata id", () => {
		const store = createGeneratedMediaArtifactStore();
		const deliver = vi.fn();
		const generatedMedia = createGeneratedMedia("generated-1");
		const retainedBlob = new Blob(["generated media"], { type: "video/mp4" });

		store.retain({
			blob: retainedBlob,
			generatedMedia,
		});

		expect(store.read(generatedMedia)).toBe(retainedBlob);
		expect(
			store.deliver({
				deliver,
				generatedMedia,
			}),
		).toBe(true);
		expect(deliver).toHaveBeenCalledWith({
			blob: retainedBlob,
			generatedMedia,
		});

		store.invalidate(generatedMedia.id);

		expect(store.read(generatedMedia)).toBeNull();
		expect(
			store.deliver({
				deliver,
				generatedMedia,
			}),
		).toBe(false);
		expect(deliver).toHaveBeenCalledTimes(1);

		store.retain({
			blob: retainedBlob,
			generatedMedia,
		});
		store.clear();

		expect(store.read(generatedMedia)).toBeNull();
	});
});

function createGeneratedMedia(id: string): GeneratedMedia {
	return {
		assetId: "asset-1",
		createdAtMs: 1_717_171_717,
		fileName: "clip-export.mp4",
		id,
		mimeType: "video/mp4",
		profile: DEFAULT_OUTPUT_PROFILE,
		selection: {
			endUs: 1_000_000,
			startUs: 0,
		},
		sizeBytes: 15,
	};
}
