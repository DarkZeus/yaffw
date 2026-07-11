import { describe, expect, it } from "vitest";

import { createDefaultOutputSettings } from "./model";
import {
	type BrowserLocalOutputSupport,
	resolveOutputVideoProfile,
} from "./output-settings";

describe("Output settings video profile resolution", () => {
	it("preserves a compatible source video codec", () => {
		const outputSettings = createDefaultOutputSettings();
		outputSettings.container = {
			container: "mp4",
			kind: "documented-container",
		};
		outputSettings.videoCodec = { kind: "preserve-source" };

		const result = resolveOutputVideoProfile({
			asset: {
				tracks: {
					audio: [],
					video: [
						{
							codec: "avc1.640028",
							id: "video-1",
							kind: "video",
						},
					],
				},
			},
			outputSettings,
			support,
		});

		expect(result).toMatchObject({
			container: { id: "mp4", label: "MP4" },
			kind: "resolved",
			videoCodec: "avc",
		});
	});

	it("normalizes HEVC parameter strings before compatibility checks", () => {
		const outputSettings = createDefaultOutputSettings();
		outputSettings.container = {
			container: "mp4",
			kind: "documented-container",
		};
		outputSettings.videoCodec = { kind: "preserve-source" };

		expect(
			resolveOutputVideoProfile({
				asset: {
					tracks: {
						audio: [],
						video: [{ codec: "hev1.1.6.L93.B0", id: "video-1", kind: "video" }],
					},
				},
				outputSettings,
				support,
			}),
		).toMatchObject({ kind: "resolved", videoCodec: "hevc" });
	});

	it("replaces an incompatible preserved source codec in documented order", () => {
		const outputSettings = createDefaultOutputSettings();
		outputSettings.container = {
			container: "webm",
			kind: "documented-container",
		};
		outputSettings.videoCodec = { kind: "preserve-source" };

		const result = resolveOutputVideoProfile({
			asset: {
				tracks: {
					audio: [],
					video: [{ codec: "avc", id: "video-1", kind: "video" }],
				},
			},
			outputSettings,
			support,
		});

		expect(result).toMatchObject({
			automaticReplacement: {
				requestedCodec: "avc",
				videoCodec: "vp9",
			},
			container: { id: "webm" },
			kind: "resolved",
			videoCodec: "vp9",
		});
	});

	it("rejects a container that has no documented compatible video codec", () => {
		const outputSettings = createDefaultOutputSettings();
		outputSettings.container = {
			container: "empty",
			kind: "documented-container",
		};
		outputSettings.videoCodec = { kind: "preserve-source" };

		expect(
			resolveOutputVideoProfile({
				asset: {
					tracks: {
						audio: [],
						video: [{ codec: "avc", id: "video-1", kind: "video" }],
					},
				},
				outputSettings,
				support: {
					containers: [
						{
							fileExtension: ".empty",
							id: "empty",
							label: "Empty",
							mimeType: "video/empty",
							videoCodecs: [],
						},
					],
				},
			}),
		).toEqual({
			error:
				"No documented video codec can satisfy the selected Empty container.",
			kind: "invalid",
		});
	});
});

const support = {
	containers: [
		{
			fileExtension: ".mp4",
			id: "mp4",
			label: "MP4",
			mimeType: "video/mp4",
			videoCodecs: ["avc", "hevc", "vp9"],
		},
		{
			fileExtension: ".webm",
			id: "webm",
			label: "WebM",
			mimeType: "video/webm",
			videoCodecs: ["vp9", "av1", "vp8"],
		},
	],
} satisfies BrowserLocalOutputSupport;
