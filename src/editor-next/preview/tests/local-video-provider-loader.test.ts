/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadSource } = vi.hoisted(() => ({ loadSource: vi.fn() }));
vi.mock("@vidstack/react", () => ({
	VideoProviderLoader: class {
		async load() {
			const provider = {
				currentSrc: null as { src: unknown; type: string } | null,
				loadSource: async (
					source: { src: unknown; type: string },
					preload: string,
				) => {
					await loadSource(source, preload);
					provider.currentSrc = source;
				},
			};
			return provider;
		}
	},
}));

import { LocalVideoProviderLoader } from "../player/local-video-provider-loader";

beforeEach(() => loadSource.mockReset());

describe("LocalVideoProviderLoader", () => {
	it("selects the native provider only for editor-owned video Blob URLs", () => {
		const loader = new LocalVideoProviderLoader();
		expect(
			loader.canPlay({ src: "blob:local-video", type: "video/object" }),
		).toBe(true);
		expect(
			loader.canPlay({
				src: "https://example.com/video",
				type: "video/object",
			}),
		).toBe(false);
		expect(
			loader.canPlay({ src: "blob:local-audio", type: "audio/object" }),
		).toBe(false);
	});

	it("loads existing URLs without an unsupported MIME hint or another object URL", async () => {
		const createObjectURL = vi.fn();
		vi.stubGlobal("URL", { createObjectURL });
		try {
			const loader = new LocalVideoProviderLoader();
			// The base loader is isolated here; no media-context fields are read.
			const provider = await loader.load(
				{} as Parameters<typeof loader.load>[0],
			);
			await provider.loadSource(
				{ src: "blob:existing-asset", type: "video/object" },
				"metadata",
			);
			expect(loadSource).toHaveBeenCalledWith(
				{ src: "blob:existing-asset", type: "?" },
				"metadata",
			);
			expect(provider.currentSrc).toEqual({
				src: "blob:existing-asset",
				type: "video/object",
			});
			expect(createObjectURL).not.toHaveBeenCalled();
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
