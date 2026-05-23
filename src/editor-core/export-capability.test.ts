import { describe, expect, it } from "vitest";

import { planDefaultExportCapability } from "./export-capability";
import type { ReadyMediaAsset, Selection } from "./model";
import { DEFAULT_OUTPUT_PROFILE } from "./model";
import { evaluateRuntimeSupport } from "./runtime-capabilities";

describe("default export capability planning", () => {
	it("rejects unsupported default-profile export without falling back to another format", () => {
		const review = planDefaultExportCapability({
			asset: readyAsset,
			defaultProfileExportable: false,
			runtime: supportedRuntime,
			selection: fullSelection,
		});

		expect(review.supported).toBe(false);
		if (review.supported) {
			throw new Error(`Expected unsupported review: ${review.reason}`);
		}

		expect(review.profile).toEqual(DEFAULT_OUTPUT_PROFILE);
		expect(review.plannedOutput.label).toBe("MP4 / H.264 video / AAC audio");
		expect(review.reason).toContain("default MP4/H.264/AAC profile");
		expect(review.technicalDetails).toContain("does not silently fall back");
		expect(review.plannedOutput.container).toBe("mp4");
	});

	it("labels a full compatible asset selection as fast export", () => {
		const review = planDefaultExportCapability({
			asset: readyAsset,
			runtime: supportedRuntime,
			selection: fullSelection,
		});

		expect(review.supported).toBe(true);
		if (!review.supported) {
			throw new Error(`Expected supported review: ${review.reason}`);
		}

		expect(review.method.label).toBe("Fast export");
		expect(review.precision.label).toBe("Full asset");
		expect(review.reason).toContain("full asset");
		expect(review.profile).toEqual(DEFAULT_OUTPUT_PROFILE);
	});

	it("labels a frame-aligned selection with known timing as precision export", () => {
		const review = planDefaultExportCapability({
			asset: {
				...readyAsset,
				frameTiming: {
					fps: 25,
					frameDurationUs: 40_000,
					source: "known",
				},
			},
			runtime: supportedRuntime,
			selection: {
				endUs: 4_000_000,
				startUs: 1_000_000,
			},
		});

		expect(review.supported).toBe(true);
		if (!review.supported) {
			throw new Error(`Expected supported review: ${review.reason}`);
		}

		expect(review.method.label).toBe("Precision export");
		expect(review.precision.label).toBe("Frame-aligned");
		expect(review.reason).toContain("known frame timing");
	});

	it("labels estimated or unaligned selections as best-effort export with a reason", () => {
		const review = planDefaultExportCapability({
			asset: {
				...readyAsset,
				frameTiming: {
					fps: 30,
					frameDurationUs: 33_333,
					reason: "Exact frame timing was unavailable.",
					source: "estimated",
				},
			},
			runtime: supportedRuntime,
			selection: {
				endUs: 4_000_000,
				startUs: 1_000_000,
			},
		});

		expect(review.supported).toBe(true);
		if (!review.supported) {
			throw new Error(`Expected supported review: ${review.reason}`);
		}

		expect(review.method.label).toBe("Best-effort export");
		expect(review.precision.label).toBe("Best effort");
		expect(review.reason).toContain("Exact frame timing is unavailable");
	});
});

const supportedRuntime = evaluateRuntimeSupport({
	fileApi: true,
	mediaSource: true,
	objectUrl: true,
	videoDecoder: true,
	videoEncoder: true,
});

const readyAsset = {
	durationUs: 12_000_000,
	exportCapability: {
		profile: DEFAULT_OUTPUT_PROFILE,
		supported: true,
	},
	frameTiming: {
		fps: 30,
		frameDurationUs: 33_333,
		source: "known",
	},
	id: "asset-1",
	label: "clip.mp4",
	provenance: {
		fileName: "clip.mp4",
		mimeType: "video/mp4",
		sizeBytes: 42_000_000,
	},
	tracks: {
		audio: [
			{
				channels: 2,
				codec: "aac",
				id: "audio-1",
				kind: "audio",
				label: "Voice",
				sampleRate: 48_000,
			},
		],
		video: [
			{
				codec: "h264",
				height: 1080,
				id: "video-1",
				kind: "video",
				label: "Main",
				width: 1920,
			},
		],
	},
} satisfies ReadyMediaAsset;

const fullSelection = {
	endUs: 12_000_000,
	startUs: 0,
} satisfies Selection;
