import { describe, expect, it } from "vitest";

import { createDefaultOutputSettings } from "./model";
import {
	type BrowserLocalOutputSupport,
	getOutputResolutionChoices,
	resolveOutputResolution,
	resolveOutputVideoProfile,
} from "./output-settings";

describe("Output settings resolution choices", () => {
	it("offers Preserve source and aspect-correct downscales below the active source dimensions", () => {
		expect(
			getOutputResolutionChoices({
				tracks: {
					audio: [],
					video: [
						{
							height: 2160,
							id: "video-1",
							kind: "video",
							width: 3840,
						},
					],
				},
			}),
		).toEqual([
			{
				label: "Preserve source (3840x2160)",
				setting: { kind: "preserve-source" },
			},
			{
				label: "2560x1440",
				setting: { height: 1440, kind: "target-dimensions", width: 2560 },
			},
			{
				label: "1920x1080",
				setting: { height: 1080, kind: "target-dimensions", width: 1920 },
			},
			{
				label: "1280x720",
				setting: { height: 720, kind: "target-dimensions", width: 1280 },
			},
			{
				label: "854x480",
				setting: { height: 480, kind: "target-dimensions", width: 854 },
			},
			{
				label: "640x360",
				setting: { height: 360, kind: "target-dimensions", width: 640 },
			},
		]);
	});

	it("resolves Preserve source without requesting custom conversion dimensions", () => {
		expect(
			resolveOutputResolution({
				asset: {
					tracks: {
						audio: [],
						video: [
							{
								height: 1080,
								id: "video-1",
								kind: "video",
								width: 1920,
							},
						],
					},
				},
				setting: { kind: "preserve-source" },
			}),
		).toEqual({
			dimensions: { height: 1080, width: 1920 },
			kind: "resolved",
		});
	});

	it("resolves a downscale as custom conversion dimensions", () => {
		expect(
			resolveOutputResolution({
				asset: {
					tracks: {
						audio: [],
						video: [
							{
								height: 1080,
								id: "video-1",
								kind: "video",
								width: 1920,
							},
						],
					},
				},
				setting: {
					height: 720,
					kind: "target-dimensions",
					width: 1280,
				},
			}),
		).toEqual({
			conversionDimensions: { height: 720, width: 1280 },
			dimensions: { height: 720, width: 1280 },
			kind: "resolved",
		});
	});

	it("rejects target dimensions that would upscale the active source", () => {
		expect(
			resolveOutputResolution({
				asset: {
					tracks: {
						audio: [],
						video: [
							{
								height: 720,
								id: "video-1",
								kind: "video",
								width: 1280,
							},
						],
					},
				},
				setting: {
					height: 1080,
					kind: "target-dimensions",
					width: 1920,
				},
			}),
		).toEqual({
			error:
				"Target output dimensions must be positive whole pixels no larger than the active source resolution.",
			kind: "invalid",
		});
	});
});

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
