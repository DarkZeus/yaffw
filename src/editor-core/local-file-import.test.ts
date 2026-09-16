import { describe, expect, it } from "vitest";

import {
	type LocalMediaAssetInspection,
	analyzeLocalMediaAssetDraft,
} from "./local-file-analysis";
import { createLocalMediaAssetDraft } from "./local-file-import";
import type { LocalFileSource, MediaAssetDraft } from "./model";
import { evaluateRuntimeSupport } from "./runtime-capabilities";

describe("local media asset analysis", () => {
	it("turns a readable local media file with audio into a ready media asset", async () => {
		const draft = createLocalMediaAssetDraft(
			{
				lastModified: 1_715_000_000_000,
				name: "voice-cut.mp4",
				size: 42_000_000,
				type: "video/mp4",
			},
			{
				createDraftId: () => "draft-local-1",
			},
		);

		const result = await analyzeLocalMediaAssetDraft(draft, {
			createAssetId: () => "asset-local-1",
			inspect: async () => ({
				audioTracks: [
					{
						channels: 2,
						codec: "aac",
						id: "audio-1",
						language: "eng",
						label: "Voice",
						sampleRate: 48_000,
					},
				],
				durationUs: 12_000_000,
				frameTiming: {
					fps: 30,
					frameDurationUs: 33_333,
					source: "known",
				},
				videoTracks: [
					{
						codec: "avc",
						height: 1080,
						id: "video-1",
						label: "Main",
						width: 1920,
					},
				],
			}),
			runtime: supportedRuntime,
		});

		expect(result.status).toBe("ready");
		if (result.status !== "ready") {
			throw new Error(`Expected ready analysis, got ${result.status}`);
		}

		expect(result.asset.id).toBe("asset-local-1");
		expect(result.asset.label).toBe("voice-cut.mp4");
		expect(result.asset.provenance).toEqual({
			fileName: "voice-cut.mp4",
			lastModifiedMs: 1_715_000_000_000,
			mimeType: "video/mp4",
			sizeBytes: 42_000_000,
		});
		expect(result.asset.durationUs).toBe(12_000_000);
		expect(result.asset.tracks.video).toHaveLength(1);
		expect(result.asset.tracks.audio).toHaveLength(1);
		expect(result.asset.exportCapability.supported).toBe(true);
		expect(result.selection).toEqual({
			endUs: 12_000_000,
			startUs: 0,
		});
	});

	it("accepts video-only files when default export is available", async () => {
		const result = await analyzeLocalMediaAssetDraft(
			draftFor({
				name: "screen-only.webm",
				type: "video/webm",
			}),
			{
				createAssetId: () => "asset-video-only",
				inspect: async () => ({
					...supportedInspection,
					audioTracks: [],
				}),
				runtime: supportedRuntime,
			},
		);

		expect(result.status).toBe("ready");
		if (result.status !== "ready") {
			throw new Error(`Expected ready analysis, got ${result.status}`);
		}

		expect(result.asset.tracks.audio).toHaveLength(0);
		expect(result.asset.tracks.video).toHaveLength(1);
		expect(result.selection).toEqual({
			endUs: supportedInspection.durationUs,
			startUs: 0,
		});
	});

	it("delegates generic media files to the Mediabunny inspector", async () => {
		const result = await analyzeLocalMediaAssetDraft(
			draftFor({
				name: "camera-export.m3u8",
				type: "application/octet-stream",
			}),
			{
				createAssetId: () => "asset-generic-video",
				inspect: async () => supportedInspection,
				runtime: supportedRuntime,
			},
		);

		expect(result.status).toBe("ready");
	});

	it("preserves non-default video codec facts without rejecting import", async () => {
		const result = await analyzeLocalMediaAssetDraft(
			draftFor({
				name: "camera-export-hevc.mov",
				type: "video/quicktime",
			}),
			{
				createAssetId: () => "asset-preview-blocked",
				inspect: async () => ({
					...supportedInspection,
					videoTracks: [
						{
							codec: "hevc",
							height: 1080,
							id: "video-1",
							label: "Main",
							width: 1920,
						},
					],
				}),
				runtime: supportedRuntime,
			},
		);

		expect(result.status).toBe("ready");
		if (result.status !== "ready") {
			throw new Error(`Expected ready analysis, got ${result.status}`);
		}

		expect(result.asset.tracks.video[0]?.codec).toBe("hevc");
	});

	it("rejects audio-only files before they enter the ready editor", async () => {
		const result = await analyzeLocalMediaAssetDraft(
			draftFor({
				name: "meeting-audio.mp4",
				type: "video/mp4",
			}),
			{
				createAssetId: () => "asset-audio-only",
				inspect: async () => ({
					...supportedInspection,
					audioTracks: [
						{
							channels: 2,
							codec: "aac",
							id: "audio-1",
							sampleRate: 48_000,
						},
					],
					videoTracks: [],
				}),
				runtime: supportedRuntime,
			},
		);

		expect(result.status).toBe("unsupported");
		if (result.status !== "unsupported") {
			throw new Error(`Expected unsupported analysis, got ${result.status}`);
		}

		expect(result.failure.message).toContain("Audio-only");
		expect(result.failure.technicalDetails).toContain("no video track");
	});

	it("returns a plain unreadable-file failure with technical details", async () => {
		const result = await analyzeLocalMediaAssetDraft(
			draftFor({
				name: "corrupt.mp4",
				type: "video/mp4",
			}),
			{
				createAssetId: () => "asset-corrupt",
				inspect: async () => {
					throw new Error("Mediabunny could not parse the container.");
				},
				runtime: supportedRuntime,
			},
		);

		expect(result.status).toBe("unsupported");
		if (result.status !== "unsupported") {
			throw new Error(`Expected unsupported analysis, got ${result.status}`);
		}

		expect(result.failure.message).toBe("The media asset could not be read.");
		expect(result.failure.technicalDetails).toContain("could not parse");
	});

	it("keeps default export capability startable for non-default audio codecs", async () => {
		const result = await analyzeLocalMediaAssetDraft(
			draftFor({
				name: "he-aac-source.mp4",
				type: "video/mp4",
			}),
			{
				createAssetId: () => "asset-he-aac",
				inspect: async () => ({
					...supportedInspection,
					audioTracks: [
						{
							channels: 2,
							codec: "mp4a.40.5",
							id: "audio-1",
							label: "Audio 1",
							sampleRate: 22_050,
						},
					],
				}),
				runtime: supportedRuntime,
			},
		);

		expect(result.status).toBe("ready");
		if (result.status !== "ready") {
			throw new Error(`Expected ready analysis, got ${result.status}`);
		}

		expect(result.asset.tracks.audio[0]).toEqual(
			expect.objectContaining({
				codec: "mp4a.40.5",
				sampleRate: 22_050,
			}),
		);
		expect(result.asset.exportCapability.supported).toBe(true);
	});
});

const supportedInspection = {
	audioTracks: [
		{
			channels: 2,
			codec: "aac",
			id: "audio-1",
			language: "eng",
			label: "Voice",
			sampleRate: 48_000,
		},
	],
	durationUs: 12_000_000,
	frameTiming: {
		fps: 30,
		frameDurationUs: 33_333,
		source: "known",
	},
	videoTracks: [
		{
			codec: "avc",
			height: 1080,
			id: "video-1",
			label: "Main",
			width: 1920,
		},
	],
} satisfies LocalMediaAssetInspection;

const supportedRuntime = evaluateRuntimeSupport({
	fileApi: true,
	mediaSource: true,
	objectUrl: true,
	videoDecoder: true,
	videoEncoder: true,
});

function draftFor(
	source: Pick<LocalFileSource, "name" | "type">,
): MediaAssetDraft {
	return createLocalMediaAssetDraft(
		{
			lastModified: 1_715_000_000_000,
			name: source.name,
			size: 42_000_000,
			type: source.type,
		},
		{
			createDraftId: () => "draft-local-1",
		},
	);
}
