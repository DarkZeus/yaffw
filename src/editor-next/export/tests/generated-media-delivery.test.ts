/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";

import { createDefaultOutputSettings } from "@/editor-core/model";

import { deliverBrowserGeneratedMedia } from "../generated-media/generated-media-delivery";

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

afterEach(() => {
	vi.restoreAllMocks();
	restoreObjectUrl("createObjectURL", originalCreateObjectURL);
	restoreObjectUrl("revokeObjectURL", originalRevokeObjectURL);
});

describe("deliverBrowserGeneratedMedia", () => {
	it("removes its anchor and revokes the object URL when browser delivery fails", () => {
		Object.defineProperty(URL, "createObjectURL", {
			configurable: true,
			value: vi.fn(() => "blob:generated-delivery"),
		});
		Object.defineProperty(URL, "revokeObjectURL", {
			configurable: true,
			value: vi.fn(),
		});
		vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
			throw new Error("Browser blocked the delivery action.");
		});

		expect(() =>
			deliverBrowserGeneratedMedia({
				blob: new Blob(["generated media"], { type: "video/mp4" }),
				generatedMedia: {
					assetId: "asset-1",
					createdAtMs: 1,
					fileName: "clip-export.mp4",
					id: "generated-1",
					mimeType: "video/mp4",
					outputSettings: createDefaultOutputSettings(),
					profile: {
						audioCodec: "aac",
						container: "mp4",
						videoCodec: "h264",
					},
					resolvedOutput: {
						audioCodec: "aac",
						audioQuality: { kind: "preserve-source" },
						container: {
							fileExtension: ".mp4",
							id: "mp4",
							label: "MP4",
							mimeType: "video/mp4",
						},
						includedAudioTrackCount: 1,
						resolution: { height: 1080, width: 1920 },
						videoCodec: "avc",
						videoQuality: { kind: "preserve-source" },
					},
					selection: { endUs: 1_000_000, startUs: 0 },
					sizeBytes: 15,
				},
			}),
		).toThrow("Browser blocked the delivery action.");

		expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:generated-delivery");
		expect(
			document.querySelector('a[href="blob:generated-delivery"]'),
		).toBeNull();
	});
});

function restoreObjectUrl(
	key: "createObjectURL" | "revokeObjectURL",
	value: typeof URL.createObjectURL | typeof URL.revokeObjectURL | undefined,
) {
	if (value) {
		Object.defineProperty(URL, key, {
			configurable: true,
			value,
		});
		return;
	}

	delete URL[key];
}
