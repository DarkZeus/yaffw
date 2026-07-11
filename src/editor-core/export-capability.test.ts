import { describe, expect, it } from "vitest";

import { planDefaultExportCapability } from "./export-capability";
import { classifyExportRangeAccuracy } from "./export-correctness";
import type { ReadyMediaAsset, Selection } from "./model";
import { DEFAULT_OUTPUT_PROFILE, createDefaultOutputSettings } from "./model";
import { evaluateRuntimeSupport } from "./runtime-capabilities";

describe("default export capability planning", () => {
	it("rejects selections outside the active media asset", () => {
		const review = planDefaultExportCapability({
			asset: readyAsset,
			runtime: supportedRuntime,
			selection: {
				endUs: readyAsset.durationUs + 1,
				startUs: 1_000_000,
			},
		});

		expect(review.supported).toBe(false);
		if (review.supported) {
			throw new Error(`Expected unsupported review: ${review.reason}`);
		}

		expect(review.profile).toEqual(DEFAULT_OUTPUT_PROFILE);
		expect(review.plannedOutput.label).toBe("MP4 / H.264 video / AAC audio");
		expect(review.reason).toContain("outside the active media asset");
		expect(review.technicalDetails).toContain("Expected selection inside");
		expect(review.plannedOutput.container).toBe("mp4");
	});

	it("labels a full compatible asset selection as a whole-file export", () => {
		const review = planDefaultExportCapability({
			asset: readyAsset,
			runtime: supportedRuntime,
			selection: fullSelection,
		});

		expect(review.supported).toBe(true);
		if (!review.supported) {
			throw new Error(`Expected supported review: ${review.reason}`);
		}

		expect(review.method.label).toBe("Whole file export");
		expect(review.precision.label).toBe("Whole file");
		expect(review.reason).toContain("full asset");
		expect(review.profile).toEqual(DEFAULT_OUTPUT_PROFILE);
	});

	it("plans capability from the applied Output settings and resolved Generated audio mix", () => {
		const outputSettings = createDefaultOutputSettings();
		outputSettings.container = {
			container: "webm",
			kind: "documented-container",
		};
		outputSettings.videoCodec = {
			codec: "vp9",
			kind: "documented-codec",
		};

		const review = planDefaultExportCapability({
			asset: readyAsset,
			audioMix: {
				finalPeakGuardDb: -1,
				outputChannels: 2,
				tracks: {
					"audio-1": {
						channelMode: "preserve",
						include: true,
						trackId: "audio-1",
						volumePercent: 100,
					},
				},
			},
			outputSettings,
			runtime: supportedRuntime,
			selection: fullSelection,
			support: {
				containers: [
					{
						audioCodecs: ["opus"],
						fileExtension: ".webm",
						id: "webm",
						label: "WebM",
						mimeType: "video/webm",
						videoCodecs: ["vp9"],
					},
				],
			},
		});

		expect(review.supported).toBe(true);
		if (!review.supported) {
			throw new Error(`Expected supported review: ${review.reason}`);
		}
		expect(review.plannedOutput).toEqual({
			audioCodec: "opus",
			container: "webm",
			label: "WebM / VP9 video / OPUS audio",
			videoCodec: "vp9",
		});
		expect(review.resolvedOutput).toMatchObject({
			audioCodec: "opus",
			container: { fileExtension: ".webm", mimeType: "video/webm" },
			videoCodec: "vp9",
		});
	});

	it("keeps frame-aligned selections unverified until generated-media evidence proves precision", () => {
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

		expect(review.method.label).toBe("Standard export");
		expect(review.precision.label).toBe("Boundaries unverified");
		expect(review.reason).toContain("has not been proven");
	});

	it("labels a selected range as precision export only with proven boundary evidence", () => {
		const selection = {
			endUs: 4_000_000,
			startUs: 1_000_000,
		};
		const rangeAccuracy = classifyExportRangeAccuracy({
			boundaryEvidence: {
				endDeltaUs: 0,
				kind: "start-and-end",
				startDeltaUs: 0,
			},
			frameTiming: {
				fps: 25,
				frameDurationUs: 40_000,
				source: "known",
			},
			selection,
			sourceDurationUs: readyAsset.durationUs,
		});
		const review = planDefaultExportCapability({
			asset: readyAsset,
			rangeAccuracy,
			runtime: supportedRuntime,
			selection,
		});

		expect(review.supported).toBe(true);
		if (!review.supported) {
			throw new Error(`Expected supported review: ${review.reason}`);
		}

		expect(review.method.label).toBe("Verified export");
		expect(review.precision.label).toBe("Boundaries verified");
		expect(review.reason).toContain("selection boundaries");
	});

	it("keeps the export review unverified when measured boundary drift exceeds tolerance", () => {
		const selection = {
			endUs: 4_000_000,
			startUs: 1_000_000,
		};
		const rangeAccuracy = classifyExportRangeAccuracy({
			boundaryEvidence: {
				endDeltaUs: 0,
				kind: "start-and-end",
				startDeltaUs: 41_000,
			},
			frameTiming: {
				fps: 25,
				frameDurationUs: 40_000,
				source: "known",
			},
			selection,
			sourceDurationUs: readyAsset.durationUs,
		});
		const review = planDefaultExportCapability({
			asset: readyAsset,
			rangeAccuracy,
			runtime: supportedRuntime,
			selection,
		});

		expect(review.supported).toBe(true);
		if (!review.supported) {
			throw new Error(`Expected supported review: ${review.reason}`);
		}

		expect(review.method.label).toBe("Standard export");
		expect(review.precision.label).toBe("Boundaries unverified");
		expect(review.reason).toContain("outside the current frame tolerance");
	});

	it("labels estimated or unaligned selections as standard export with a reason", () => {
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

		expect(review.method.label).toBe("Standard export");
		expect(review.precision.label).toBe("Boundaries unverified");
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
