import {
	type AudioMix,
	DEFAULT_OUTPUT_PROFILE,
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
	it("passes resolved downscale dimensions to Mediabunny conversion", async () => {
		let conversionConfig: MockConversionConfig | undefined;
		mediabunnyMock.conversionExecute = (_conversion, config) => {
			conversionConfig = config;
			config.output.target.buffer = new Uint8Array([1, 2, 3]).buffer;
			return Promise.resolve();
		};

		await browserDefaultExportRunner.run(
			createExportRequest({
				outputSettings: downscaledOutputSettings,
			}),
		);

		expect(conversionConfig?.video).toEqual({
			codec: "avc",
			fit: "fill",
			height: 720,
			width: 1280,
		});
	});

	it("does not set custom dimensions when resolution preserves the source", async () => {
		let conversionConfig: MockConversionConfig | undefined;
		mediabunnyMock.conversionExecute = (_conversion, config) => {
			conversionConfig = config;
			config.output.target.buffer = new Uint8Array([1, 2, 3]).buffer;
			return Promise.resolve();
		};

		await browserDefaultExportRunner.run(createExportRequest());

		expect(conversionConfig?.video).toEqual({ codec: "avc" });
	});

	it("uses the resolved non-default container, codec, and MIME type", async () => {
		let conversionConfig: MockConversionConfig | undefined;
		mediabunnyMock.conversionExecute = (_conversion, config) => {
			conversionConfig = config;
			config.output.target.buffer = new Uint8Array([1, 2, 3]).buffer;
			return Promise.resolve();
		};
		const outputSettings = createDefaultOutputSettings();
		outputSettings.container = {
			container: "webm",
			kind: "documented-container",
		};
		outputSettings.videoCodec = {
			codec: "vp9",
			kind: "documented-codec",
		};

		const result = await browserDefaultExportRunner.run(
			createExportRequest({ outputSettings }),
		);

		expect(conversionConfig?.video).toEqual({ codec: "vp9" });
		expect(conversionConfig?.output.format.mimeType).toBe("video/webm");
		expect(result.mimeType).toBe("video/webm");
		expect(result.blob.type).toBe("video/webm");
	});

	it("disposes video-only export resources after successful export", async () => {
		const onProgress = vi.fn();

		const result = await browserDefaultExportRunner.run(
			createExportRequest({
				onProgress,
			}),
		);

		await expect(result.blob.arrayBuffer()).resolves.toHaveProperty(
			"byteLength",
			3,
		);
		expect(result.mimeType).toBe("video/mp4");
		expect(onProgress).toHaveBeenCalledWith({ phase: "preparing" });
		expect(onProgress).toHaveBeenCalledWith({
			completedRatio: 0.5,
			phase: "encoding",
		});
		expect(onProgress).toHaveBeenCalledWith({
			completedRatio: 1,
			phase: "finalizing",
		});
		expect(mediabunnyMock.inputs).toHaveLength(1);
		expect(mediabunnyMock.inputs[0].dispose).toHaveBeenCalledTimes(1);
		expect(mediabunnyMock.conversions[0].cancel).not.toHaveBeenCalled();
		expect(mediabunnyMock.outputs[0].cancel).not.toHaveBeenCalled();
	});

	it("cancels partial video-only export work after an abort", async () => {
		const controller = new AbortController();
		mediabunnyMock.conversionExecute = () => new Promise(() => {});

		const exportPromise = browserDefaultExportRunner.run(
			createExportRequest({
				signal: controller.signal,
			}),
		);

		await waitForConversion();
		controller.abort();

		await expect(exportPromise).rejects.toBeInstanceOf(
			DefaultExportCancelledError,
		);
		expect(mediabunnyMock.inputs[0].dispose).toHaveBeenCalledTimes(1);
		expect(mediabunnyMock.conversions[0].cancel).toHaveBeenCalledTimes(1);
		expect(mediabunnyMock.outputs[0].cancel).toHaveBeenCalledTimes(1);
	});

	it("cancels partial video-only export work after encoder failure", async () => {
		const failure = new Error("Encoder rejected the source video.");
		mediabunnyMock.conversionExecute = () => Promise.reject(failure);

		await expect(
			browserDefaultExportRunner.run(createExportRequest()),
		).rejects.toBe(failure);

		expect(mediabunnyMock.inputs[0].dispose).toHaveBeenCalledTimes(1);
		expect(mediabunnyMock.conversions[0].cancel).toHaveBeenCalledTimes(1);
		expect(mediabunnyMock.outputs[0].cancel).toHaveBeenCalledTimes(1);
	});

	it("drives video conversion and the Generated audio mix into one Output", async () => {
		browserAudioMixMock.renderBrowserAudioMix.mockResolvedValue({
			audioBuffer: {} as AudioBuffer,
			includedTrackCount: 1,
		});

		const result = await browserDefaultExportRunner.run(
			createExportRequest({
				audioMix: includedAudioMix,
			}),
		);

		await expect(result.blob.arrayBuffer()).resolves.toHaveProperty(
			"byteLength",
			3,
		);
		expect(browserAudioMixMock.renderBrowserAudioMix).toHaveBeenCalledTimes(1);
		expect(mediabunnyMock.inputs).toHaveLength(1);
		expect(mediabunnyMock.inputs[0].dispose).toHaveBeenCalledTimes(1);
		expect(mediabunnyMock.outputs).toHaveLength(1);
		expect(mediabunnyMock.conversions[0]?.config.composable).toBe(true);
		expect(mediabunnyMock.conversions[0]?.config.output).toBe(
			mediabunnyMock.outputs[0],
		);
		expect(mediabunnyMock.outputs[0].addAudioTrack).toHaveBeenCalledWith(
			mediabunnyMock.audioBufferSources[0],
			{ name: "Mixed audio" },
		);
		expect(mediabunnyMock.outputs[0].start).toHaveBeenCalledTimes(1);
		expect(mediabunnyMock.outputs[0].finalize).toHaveBeenCalledTimes(1);
		expect(mediabunnyMock.outputs[0].cancel).not.toHaveBeenCalled();
		expect(mediabunnyMock.audioBufferSources[0].add).toHaveBeenCalledTimes(1);
		expect(mediabunnyMock.audioBufferSources[0].close).toHaveBeenCalledTimes(1);
		expect(mediabunnyMock.audioBufferSources[0].options).toMatchObject({
			codec: "aac",
			quality: { options: "medium" },
		});
	});

	it("encodes the Generated audio mix with the resolved explicit codec", async () => {
		browserAudioMixMock.renderBrowserAudioMix.mockResolvedValue({
			audioBuffer: {} as AudioBuffer,
			includedTrackCount: 1,
		});
		const outputSettings = createDefaultOutputSettings();
		outputSettings.audioCodec = {
			codec: "flac",
			kind: "documented-codec",
		};

		await browserDefaultExportRunner.run(
			createExportRequest({
				audioMix: includedAudioMix,
				outputSettings,
			}),
		);

		expect(mediabunnyMock.audioBufferSources[0].options).toMatchObject({
			codec: "flac",
		});
		expect(mediabunnyMock.audioBufferSources[0].options).not.toHaveProperty(
			"quality",
		);
	});

	it("passes independent subjective video and custom audio bitrate choices", async () => {
		let conversionConfig: MockConversionConfig | undefined;
		mediabunnyMock.conversionExecute = (_conversion, config) => {
			conversionConfig = config;
			config.output.target.buffer = new Uint8Array([1, 2, 3]).buffer;
			return Promise.resolve();
		};
		browserAudioMixMock.renderBrowserAudioMix.mockResolvedValue({
			audioBuffer: {} as AudioBuffer,
			includedTrackCount: 1,
		});
		const outputSettings = createDefaultOutputSettings();
		outputSettings.videoQuality = {
			kind: "subjective-quality",
			quality: "high",
		};
		outputSettings.audioQuality = {
			bitrateBps: 256_000,
			kind: "custom-bitrate",
		};

		await browserDefaultExportRunner.run(
			createExportRequest({ audioMix: includedAudioMix, outputSettings }),
		);

		expect(conversionConfig?.video.quality).toMatchObject({ options: "high" });
		expect(mediabunnyMock.audioBufferSources[0].options).toMatchObject({
			quality: { options: { bitrate: 256_000 } },
		});
	});

	it("passes an exact custom video bitrate and subjective audio Quality", async () => {
		let conversionConfig: MockConversionConfig | undefined;
		mediabunnyMock.conversionExecute = (_conversion, config) => {
			conversionConfig = config;
			config.output.target.buffer = new Uint8Array([1, 2, 3]).buffer;
			return Promise.resolve();
		};
		browserAudioMixMock.renderBrowserAudioMix.mockResolvedValue({
			audioBuffer: {} as AudioBuffer,
			includedTrackCount: 1,
		});
		const outputSettings = createDefaultOutputSettings();
		outputSettings.videoQuality = {
			bitrateBps: 4_000_000,
			kind: "custom-bitrate",
		};
		outputSettings.audioQuality = {
			kind: "subjective-quality",
			quality: "high",
		};

		await browserDefaultExportRunner.run(
			createExportRequest({ audioMix: includedAudioMix, outputSettings }),
		);

		expect(conversionConfig?.video.quality).toMatchObject({
			options: { bitrate: 4_000_000 },
		});
		expect(mediabunnyMock.audioBufferSources[0].options).toMatchObject({
			quality: { options: "high" },
		});
	});

	it("keeps an all-excluded Audio mix as a valid video-only export", async () => {
		const result = await browserDefaultExportRunner.run(
			createExportRequest({
				audioMix: excludedAudioMix,
			}),
		);

		await expect(result.blob.arrayBuffer()).resolves.toHaveProperty(
			"byteLength",
			3,
		);
		expect(browserAudioMixMock.renderBrowserAudioMix).not.toHaveBeenCalled();
		expect(mediabunnyMock.inputs).toHaveLength(1);
	});

	it("renders an included zero-volume track as a silent Generated audio mix", async () => {
		browserAudioMixMock.renderBrowserAudioMix.mockResolvedValue({
			audioBuffer: {} as AudioBuffer,
			includedTrackCount: 1,
		});

		await browserDefaultExportRunner.run(
			createExportRequest({
				audioMix: zeroVolumeIncludedAudioMix,
			}),
		);

		expect(browserAudioMixMock.renderBrowserAudioMix).toHaveBeenCalledWith(
			expect.objectContaining({
				audioMix: zeroVolumeIncludedAudioMix,
			}),
		);
		expect(mediabunnyMock.audioBufferSources).toHaveLength(1);
	});

	it("cancels and closes mixed-audio resources after audio-source failure", async () => {
		const failure = new Error("Generated audio mix encoding failed.");
		mediabunnyMock.audioAddFailure = failure;
		browserAudioMixMock.renderBrowserAudioMix.mockResolvedValue({
			audioBuffer: {} as AudioBuffer,
			includedTrackCount: 1,
		});

		await expect(
			browserDefaultExportRunner.run(
				createExportRequest({
					audioMix: includedAudioMix,
				}),
			),
		).rejects.toBe(failure);

		expect(mediabunnyMock.inputs[0].dispose).toHaveBeenCalledTimes(1);
		expect(mediabunnyMock.conversions[0].cancel).toHaveBeenCalledTimes(1);
		expect(mediabunnyMock.outputs[0].cancel).toHaveBeenCalledTimes(1);
		expect(mediabunnyMock.audioBufferSources[0].close).toHaveBeenCalledTimes(1);
	});

	it("cancels and closes mixed-audio resources after Conversion failure", async () => {
		const failure = new Error("Video conversion failed.");
		mediabunnyMock.conversionExecute = () => Promise.reject(failure);
		browserAudioMixMock.renderBrowserAudioMix.mockResolvedValue({
			audioBuffer: {} as AudioBuffer,
			includedTrackCount: 1,
		});

		await expect(
			browserDefaultExportRunner.run(
				createExportRequest({ audioMix: includedAudioMix }),
			),
		).rejects.toBe(failure);

		expect(mediabunnyMock.inputs[0].dispose).toHaveBeenCalledOnce();
		expect(mediabunnyMock.conversions[0].cancel).toHaveBeenCalledOnce();
		expect(mediabunnyMock.outputs[0].cancel).toHaveBeenCalledOnce();
		expect(mediabunnyMock.audioBufferSources[0].close).toHaveBeenCalledOnce();
	});

	it("cancels composable Conversion and Output after an abort", async () => {
		const controller = new AbortController();
		mediabunnyMock.conversionExecute = () => new Promise(() => undefined);
		browserAudioMixMock.renderBrowserAudioMix.mockResolvedValue({
			audioBuffer: {} as AudioBuffer,
			includedTrackCount: 1,
		});
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
		browserAudioMixMock.renderBrowserAudioMix.mockResolvedValue({
			audioBuffer: {} as AudioBuffer,
			includedTrackCount: 1,
		});

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

	it("rejects a composable export when Conversion cannot utilize video", async () => {
		mediabunnyMock.conversionUtilizedTracks = [];
		browserAudioMixMock.renderBrowserAudioMix.mockResolvedValue({
			audioBuffer: {} as AudioBuffer,
			includedTrackCount: 1,
		});

		await expect(
			browserDefaultExportRunner.run(
				createExportRequest({ audioMix: includedAudioMix }),
			),
		).rejects.toThrow("could not utilize a video track");

		expect(mediabunnyMock.inputs[0].dispose).toHaveBeenCalledOnce();
		expect(mediabunnyMock.conversions[0].cancel).toHaveBeenCalledOnce();
		expect(mediabunnyMock.outputs[0].cancel).toHaveBeenCalledOnce();
		expect(mediabunnyMock.audioBufferSources).toEqual([]);
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
	return {
		asset: readyAsset,
		audioMix,
		onProgress,
		outputSettings,
		selection: {
			endUs: 1_000_000,
			startUs: 0,
		},
		signal,
		source: new Blob(["video"], { type: "video/mp4" }),
	};
}

const downscaledOutputSettings = {
	...createDefaultOutputSettings(),
	resolution: {
		height: 720,
		kind: "target-dimensions",
		width: 1280,
	},
} satisfies OutputSettings;

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
	exportCapability: {
		profile: DEFAULT_OUTPUT_PROFILE,
		supported: true,
	},
	frameTiming: {
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

const zeroVolumeIncludedAudioMix = {
	...includedAudioMix,
	tracks: {
		"audio-1": {
			...includedAudioMix.tracks["audio-1"],
			volumePercent: 0,
		},
	},
} as const;

const excludedAudioMix = {
	finalPeakGuardDb: -1,
	outputChannels: 2,
	tracks: {
		"audio-1": {
			channelMode: "preserve",
			include: false,
			trackId: "audio-1",
			volumePercent: 100,
		},
	},
} as const;
