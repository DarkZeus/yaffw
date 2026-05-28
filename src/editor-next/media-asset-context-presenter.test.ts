import { describe, expect, it } from "vitest";

import {
	DEFAULT_OUTPUT_PROFILE,
	type ReadyMediaAsset,
	type Selection,
} from "@/editor-core/model";

import { createMediaAssetContextViewModel } from "./media-asset-context-presenter";

describe("media asset context presenter", () => {
	it("derives ready media asset identity, provenance, media facts, and selection context", () => {
		const viewModel = createMediaAssetContextViewModel({
			asset: readyAsset,
			closeDisabled: false,
			selection,
		});

		expect(viewModel.identity.name).toBe("recording.mp4");
		expect(viewModel.identity.assetId).toBe("asset-context");
		expect(viewModel.identity.summary).toBe(
			"Loaded for preview, selection, and export.",
		);
		expect(viewModel.closeFile).toEqual({
			disabled: false,
			label: "Close file",
		});
		expect(viewModel.provenanceFacts).toEqual([
			{ label: "Asset identity", value: "asset-context" },
			{ label: "Source file", value: "recording.mp4" },
			{ label: "Duration", value: "00:01:12.500" },
			{ label: "Size", value: "4.5 MB" },
			{ label: "Type", value: "MP4" },
		]);
		expect(viewModel.videoFacts).toEqual([
			{ label: "Video tracks", value: "1" },
			{ label: "Primary video", value: "Screen" },
			{ label: "Resolution", value: "1920x1080" },
			{ label: "Aspect", value: "16:9" },
			{ label: "Frame timing", value: "60 fps known" },
			{ label: "Codec", value: "h264" },
		]);
		expect(viewModel.audioFacts).toEqual([
			{ label: "Audio tracks", value: "1" },
			{ label: "Primary audio", value: "Voice" },
			{ label: "Channels", value: "Stereo" },
			{ label: "Sample rate", value: "48 kHz" },
			{ label: "Codec", value: "aac" },
			{ label: "Language", value: "eng" },
		]);
		expect(viewModel.selectionFacts).toEqual([
			{ label: "Selection start", value: "00:00:18.000" },
			{ label: "Selection end", value: "00:00:54.250" },
			{ label: "Selection duration", value: "00:00:36.250" },
			{ label: "Asset coverage", value: "50%" },
		]);
	});

	it("keeps close-state behavior display-ready for disabled export states", () => {
		const viewModel = createMediaAssetContextViewModel({
			asset: readyAsset,
			closeDisabled: true,
			selection,
		});

		expect(viewModel.closeFile).toEqual({
			disabled: true,
			label: "Close file",
		});
	});
});

const readyAsset = {
	durationUs: 72_500_000,
	exportCapability: {
		profile: DEFAULT_OUTPUT_PROFILE,
		supported: true,
	},
	frameTiming: {
		fps: 60,
		frameDurationUs: 16_667,
		source: "known",
	},
	id: "asset-context",
	label: "recording.mp4",
	provenance: {
		fileName: "recording.mp4",
		mimeType: "video/mp4",
		sizeBytes: 4_718_592,
	},
	tracks: {
		audio: [
			{
				channels: 2,
				codec: "aac",
				id: "audio-1",
				kind: "audio",
				label: "Voice",
				language: "eng",
				sampleRate: 48_000,
			},
		],
		video: [
			{
				codec: "h264",
				height: 1080,
				id: "video-1",
				kind: "video",
				label: "Screen",
				width: 1920,
			},
		],
	},
} satisfies ReadyMediaAsset;

const selection = {
	endUs: 54_250_000,
	startUs: 18_000_000,
} satisfies Selection;
