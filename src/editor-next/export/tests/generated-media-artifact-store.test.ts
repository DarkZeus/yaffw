import { describe, expect, it, vi } from "vitest";

import type { GeneratedMedia } from "@/editor-core/model";
import { DEFAULT_OUTPUT_PROFILE } from "@/editor-core/model";

import { createGeneratedMediaArtifactStore } from "../generated-media/generated-media-artifact-store";

describe("Generated media artifact store", () => {
	it("retains and delivers the current Generated media artifact", () => {
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
	});

	it("replaces the current artifact and refuses superseded Generated media identities", () => {
		const store = createGeneratedMediaArtifactStore();
		const deliver = vi.fn();
		const firstGeneratedMedia = createGeneratedMedia("generated-1");
		const secondGeneratedMedia = createGeneratedMedia("generated-2");
		const firstBlob = new Blob(["first generated media"], {
			type: "video/mp4",
		});
		const secondBlob = new Blob(["second generated media"], {
			type: "video/mp4",
		});

		store.retain({
			blob: firstBlob,
			generatedMedia: firstGeneratedMedia,
		});
		store.retain({
			blob: secondBlob,
			generatedMedia: secondGeneratedMedia,
		});

		expect(store.read(firstGeneratedMedia)).toBeNull();
		expect(
			store.deliver({
				deliver,
				generatedMedia: firstGeneratedMedia,
			}),
		).toBe(false);
		expect(store.read(secondGeneratedMedia)).toBe(secondBlob);
		expect(
			store.deliver({
				deliver,
				generatedMedia: secondGeneratedMedia,
			}),
		).toBe(true);
		expect(deliver).toHaveBeenCalledOnce();
		expect(deliver).toHaveBeenCalledWith({
			blob: secondBlob,
			generatedMedia: secondGeneratedMedia,
		});
	});

	it("invalidates only a matching artifact and clears the current artifact", () => {
		const store = createGeneratedMediaArtifactStore();
		const generatedMedia = createGeneratedMedia("generated-1");
		const retainedBlob = new Blob(["generated media"], { type: "video/mp4" });

		store.retain({
			blob: retainedBlob,
			generatedMedia,
		});

		store.invalidate("generated-elsewhere");
		expect(store.read(generatedMedia)).toBe(retainedBlob);

		store.invalidate(generatedMedia.id);

		expect(store.read(generatedMedia)).toBeNull();

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
