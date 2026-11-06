import {
	type AudioMix,
	type ExportProgress,
	type OutputSettings,
	type ReadyMediaAsset,
	createDefaultOutputSettings,
} from "@/editor-core/model";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mediabunnyMock = vi.hoisted(() => ({
	audioAddFailure: undefined as Error | undefined,
	audioBufferSources: [] as MockAudioBufferSource[],
	conversionExecute: undefined as
		| ((
				conversion: MockConversion,
				config: MockConversionConfig,
		  ) => Promise<void>)
		| undefined,
	conversionUtilizedTracks: [{ type: "video" }] as Array<{ type: string }>,
	conversions: [] as MockConversion[],
	inputs: [] as MockInput[],
	outputFinalizeFailure: undefined as Error | undefined,
	outputs: [] as MockOutput[],
}));

const browserAudioMixMock = vi.hoisted(() => ({
	renderBrowserAudioMix: vi.fn(),
}));

vi.mock("../../audio/engine/browser-audio-mix", () => browserAudioMixMock);

vi.mock("mediabunny", () => {
	class BlobSource {
		readonly source: Blob;

		constructor(source: Blob) {
			this.source = source;
		}
	}

	class BufferTarget {
		buffer: ArrayBuffer | null = null;
	}

	class Mp4OutputFormat {
		readonly options: unknown;
		readonly fileExtension: string = ".mp4";
		readonly mimeType: string = "video/mp4";

		constructor(options?: unknown) {
			this.options = options;
		}

		getSupportedAudioCodecs() {
			return ["aac", "opus", "mp3", "flac"];
		}

		getSupportedVideoCodecs() {
			return ["avc", "hevc", "vp9"];
		}
	}

	class MovOutputFormat extends Mp4OutputFormat {}
	class MkvOutputFormat extends Mp4OutputFormat {}
	class MpegTsOutputFormat extends Mp4OutputFormat {}
	class WebMOutputFormat extends Mp4OutputFormat {
		override readonly fileExtension = ".webm";
		override readonly mimeType = "video/webm";

		override getSupportedAudioCodecs() {
			return ["opus", "vorbis"];
		}

		override getSupportedVideoCodecs() {
			return ["vp9", "av1", "vp8"];
		}
	}

	const Input = vi.fn().mockImplementation(() => {
		const input: MockInput = {
			dispose: vi.fn(),
		};
		mediabunnyMock.inputs.push(input);

		return input;
	});

	const Output = vi
		.fn()
		.mockImplementation(
			({
				format,
				target,
			}: { format: MockOutputFormat; target: BufferTarget }) => {
				const output: MockOutput = {
					addAudioTrack: vi.fn(),
					addVideoTrack: vi.fn(),
					cancel: vi.fn(async () => {}),
					finalize: vi.fn(async () => {
						if (mediabunnyMock.outputFinalizeFailure) {
							throw mediabunnyMock.outputFinalizeFailure;
						}

						target.buffer = new Uint8Array([9, 8, 7]).buffer;
					}),
					format,
					start: vi.fn(async () => {}),
					target,
				};
				mediabunnyMock.outputs.push(output);

				return output;
			},
		);

	const Conversion = {
		init: vi.fn(async (config: MockConversionConfig) => {
			const conversion: MockConversion = {
				cancel: vi.fn(async () => {}),
				config,
				execute: vi.fn(() => {
					if (mediabunnyMock.conversionExecute) {
						return mediabunnyMock.conversionExecute(conversion, config);
					}

					if (!config.composable) {
						config.output.target.buffer = new Uint8Array([1, 2, 3]).buffer;
					}
					conversion.onProgress?.(0.5);

					return Promise.resolve();
				}),
				onProgress: undefined,
				utilizedTracks: mediabunnyMock.conversionUtilizedTracks,
			};
			mediabunnyMock.conversions.push(conversion);

			return conversion;
		}),
	};

	class AudioBufferSource {
		readonly add = vi.fn(async () => {
			if (mediabunnyMock.audioAddFailure) {
				throw mediabunnyMock.audioAddFailure;
			}
		});
		readonly close = vi.fn();
		readonly options: unknown;

		constructor(options: { codec: string; quality?: unknown }) {
			if (
				options.quality === undefined &&
				options.codec !== "flac" &&
				!options.codec.startsWith("pcm-")
			) {
				throw new TypeError(
					"config.quality must be provided for compressed audio codecs.",
				);
			}
			this.options = options;
			mediabunnyMock.audioBufferSources.push(this);
		}
	}

	class Quality {
		readonly options: unknown;

		constructor(options: unknown) {
			this.options = options;
		}
	}

	return {
		ALL_FORMATS: {},
		AudioBufferSource,
		BlobSource,
		BufferTarget,
		Conversion,
		Input,
		MkvOutputFormat,
		MovOutputFormat,
		Mp4OutputFormat,
		MpegTsOutputFormat,
		Output,
		Quality,
		WebMOutputFormat,
	};
});

import { resolveOutputPlan } from "@/editor-core/output-settings";
import { MEDIABUNNY_OUTPUT_SUPPORT } from "../adapters/mediabunny-output-support";
import {
	DefaultExportCancelledError,
	browserDefaultExportRunner,
} from "../runners/default-export-runner";
import type { DefaultExportRunnerRequest } from "../types/default-export-runner.types";

beforeEach(() => {
	mediabunnyMock.audioAddFailure = undefined;
	mediabunnyMock.audioBufferSources = [];
	mediabunnyMock.conversionExecute = undefined;
	mediabunnyMock.conversionUtilizedTracks = [{ type: "video" }];
	mediabunnyMock.conversions = [];
	mediabunnyMock.inputs = [];
	mediabunnyMock.outputFinalizeFailure = undefined;
	mediabunnyMock.outputs = [];
	browserAudioMixMock.renderBrowserAudioMix.mockReset();
	browserAudioMixMock.renderBrowserAudioMix.mockResolvedValue(null);
});

describe("browserDefaultExportRunner cleanup", () => {
	it("preserves source sizing without forcing conversion and applies explicit downscaling", async () => {
		await browserDefaultExportRunner.run(createExportRequest());
		expect(mediabunnyMock.conversions[0].config.video).not.toHaveProperty(
			"width",
		);
		expect(mediabunnyMock.conversions[0].config.video).not.toHaveProperty(
			"height",
		);
		await browserDefaultExportRunner.run(
			createExportRequest({
				outputSettings: {
					...createDefaultOutputSettings(),
					resolution: { kind: "target-dimensions", width: 1280, height: 720 },
				},
			}),
		);
		expect(mediabunnyMock.conversions[1].config.video).toMatchObject({
			width: 1280,
			height: 720,
			fit: "fill",
		});
	});
	it("skips audio decoding when No audio is selected while tracks remain included", async () => {
		await browserDefaultExportRunner.run(
			createExportRequest({
				audioMix: includedAudioMix,
				outputSettings: {
					...createDefaultOutputSettings(),
					audioCodec: { kind: "no-audio" },
				},
			}),
		);
		expect(browserAudioMixMock.renderBrowserAudioMix).not.toHaveBeenCalled();
		expect(mediabunnyMock.outputs[0].addAudioTrack).not.toHaveBeenCalled();
	});

	it("cancels composable Conversion and Output after an abort", async () => {
		const controller = new AbortController();
		mediabunnyMock.conversionExecute = () => new Promise(() => undefined);
		browserAudioMixMock.renderBrowserAudioMix.mockResolvedValue(
			{} as AudioBuffer,
		);
		const exportPromise = browserDefaultExportRunner.run(
			createExportRequest({
				audioMix: includedAudioMix,
				signal: controller.signal,
			}),
		);
		await waitForConversion();
		controller.abort();

		await expect(exportPromise).rejects.toBeInstanceOf(
			DefaultExportCancelledError,
		);
		expect(mediabunnyMock.inputs[0].dispose).toHaveBeenCalledOnce();
		expect(mediabunnyMock.conversions[0].cancel).toHaveBeenCalledOnce();
		expect(mediabunnyMock.outputs[0].cancel).toHaveBeenCalledOnce();
		expect(mediabunnyMock.audioBufferSources[0].close).toHaveBeenCalledOnce();
	});

	it("cancels Output after mixed-audio finalization failure", async () => {
		const failure = new Error("Output finalization failed.");
		mediabunnyMock.outputFinalizeFailure = failure;
		browserAudioMixMock.renderBrowserAudioMix.mockResolvedValue(
			{} as AudioBuffer,
		);

		await expect(
			browserDefaultExportRunner.run(
				createExportRequest({ audioMix: includedAudioMix }),
			),
		).rejects.toBe(failure);

		expect(mediabunnyMock.inputs[0].dispose).toHaveBeenCalledOnce();
		expect(mediabunnyMock.conversions[0].cancel).not.toHaveBeenCalled();
		expect(mediabunnyMock.outputs[0].cancel).toHaveBeenCalledOnce();
		expect(mediabunnyMock.audioBufferSources[0].close).toHaveBeenCalledOnce();
	});
});

type MockFn = ReturnType<typeof vi.fn>;

type MockInput = {
	dispose: MockFn;
};

type MockOutput = {
	addAudioTrack: MockFn;
	addVideoTrack: MockFn;
	cancel: MockFn;
	finalize: MockFn;
	format: MockOutputFormat;
	start: MockFn;
	target: {
		buffer: ArrayBuffer | null;
	};
};

type MockOutputFormat = {
	fileExtension: string;
	mimeType: string;
};

type MockConversion = {
	cancel: MockFn;
	config: MockConversionConfig;
	execute: MockFn;
	onProgress?: (completedRatio: number) => void;
	utilizedTracks: Array<{ type: string }>;
};

type MockConversionConfig = {
	composable?: boolean;
	copy?: unknown;
	output: MockOutput;
	video: {
		codec: string;
		fit?: string;
		height?: number;
		quality?: unknown;
		width?: number;
	};
};

type MockAudioBufferSource = {
	add: MockFn;
	close: MockFn;
	options: unknown;
};

function createExportRequest({
	audioMix = videoOnlyAudioMix,
	onProgress = vi.fn(),
	outputSettings = createDefaultOutputSettings(),
	signal = new AbortController().signal,
}: {
	audioMix?: AudioMix;
	onProgress?: (progress: ExportProgress) => void;
	outputSettings?: OutputSettings;
	signal?: AbortSignal;
} = {}): DefaultExportRunnerRequest {
	const output = resolveOutputPlan({
		asset: readyAsset,
		audioMix,
		outputSettings,
		support: MEDIABUNNY_OUTPUT_SUPPORT,
	});
	if (output.kind === "invalid") throw new Error(output.error);
	return {
		audioMix,
		onProgress,
		resolvedOutput: output.plan,
		selection: {
			endUs: 1_000_000,
			startUs: 0,
		},
		signal,
		source: new Blob(["video"], { type: "video/mp4" }),
	};
}

async function waitForConversion() {
	for (let attempt = 0; attempt < 10; attempt += 1) {
		if (mediabunnyMock.conversions.length > 0) {
			return;
		}

		await Promise.resolve();
	}

	throw new Error("Expected the export conversion to start.");
}

const readyAsset = {
	durationUs: 1_000_000,
	frameTiming: {
		analysis: {
			averageFrameRate: 30,
			frameRateIsConstant: true,
			maxFrameRate: 30,
			medianFrameRate: 30,
			minFrameRate: 30,
			probedPacketCount: 256,
			underlyingFrameRate: 30,
		},
		fps: 30,
		frameDurationUs: 33_333,
		source: "known",
	},
	id: "asset-export-cleanup",
	label: "cleanup.mp4",
	provenance: {
		fileName: "cleanup.mp4",
		mimeType: "video/mp4",
		sizeBytes: 5,
	},
	tracks: {
		audio: [
			{
				codec: "aac",
				id: "audio-1",
				kind: "audio",
			},
		],
		video: [
			{
				codec: "avc",
				height: 1080,
				id: "video-1",
				kind: "video",
				width: 1920,
			},
		],
	},
} satisfies ReadyMediaAsset;

const videoOnlyAudioMix = {
	finalPeakGuardDb: -1,
	outputChannels: 2,
	tracks: {},
} as const;

const includedAudioMix = {
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
} as const;
