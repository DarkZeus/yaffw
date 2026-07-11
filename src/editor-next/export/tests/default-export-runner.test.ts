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
	audioBufferSources: [] as MockAudioBufferSource[],
	conversionExecute: undefined as
		| ((
				conversion: MockConversion,
				config: MockConversionConfig,
		  ) => Promise<void>)
		| undefined,
	conversions: [] as MockConversion[],
	encodedVideoAddFailure: undefined as Error | undefined,
	encodedVideoPacketSources: [] as MockEncodedVideoPacketSource[],
	inputs: [] as MockInput[],
	outputFinalizeFailure: undefined as Error | undefined,
	outputs: [] as MockOutput[],
	packetBatches: new Map<MockVideoTrack, MockPacket[]>(),
	videoTracks: [] as MockVideoTrack[],
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

		constructor(options?: unknown) {
			this.options = options;
		}
	}

	const Input = vi.fn().mockImplementation(() => {
		const input: MockInput = {
			dispose: vi.fn(),
			getVideoTracks: vi.fn(async () => mediabunnyMock.videoTracks),
		};
		mediabunnyMock.inputs.push(input);

		return input;
	});

	const Output = vi
		.fn()
		.mockImplementation(({ target }: { target: BufferTarget }) => {
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
				start: vi.fn(async () => {}),
				target,
			};
			mediabunnyMock.outputs.push(output);

			return output;
		});

	const Conversion = {
		init: vi.fn(async (config: MockConversionConfig) => {
			const conversion: MockConversion = {
				cancel: vi.fn(async () => {}),
				execute: vi.fn(() => {
					if (mediabunnyMock.conversionExecute) {
						return mediabunnyMock.conversionExecute(conversion, config);
					}

					config.output.target.buffer = new Uint8Array([1, 2, 3]).buffer;
					conversion.onProgress?.(0.5);

					return Promise.resolve();
				}),
				onProgress: undefined,
			};
			mediabunnyMock.conversions.push(conversion);

			return conversion;
		}),
	};

	class EncodedPacketSink {
		readonly track: MockVideoTrack;

		constructor(track: MockVideoTrack) {
			this.track = track;
		}

		async *packets() {
			for (const packet of mediabunnyMock.packetBatches.get(this.track) ?? []) {
				yield packet;
			}
		}
	}

	class EncodedVideoPacketSource {
		readonly add = vi.fn(async () => {
			if (mediabunnyMock.encodedVideoAddFailure) {
				throw mediabunnyMock.encodedVideoAddFailure;
			}
		});
		readonly close = vi.fn();
		readonly codec: string;

		constructor(codec: string) {
			this.codec = codec;
			mediabunnyMock.encodedVideoPacketSources.push(this);
		}
	}

	class AudioBufferSource {
		readonly add = vi.fn(async () => {});
		readonly close = vi.fn();
		readonly options: unknown;

		constructor(options: unknown) {
			this.options = options;
			mediabunnyMock.audioBufferSources.push(this);
		}
	}

	return {
		ALL_FORMATS: {},
		AudioBufferSource,
		BlobSource,
		BufferTarget,
		Conversion,
		EncodedPacketSink,
		EncodedVideoPacketSource,
		Input,
		Mp4OutputFormat,
		Output,
	};
});

import {
	DefaultExportCancelledError,
	browserDefaultExportRunner,
} from "../runners/default-export-runner";
import type { DefaultExportRunnerRequest } from "../types/default-export-runner.types";

beforeEach(() => {
	mediabunnyMock.audioBufferSources = [];
	mediabunnyMock.conversionExecute = undefined;
	mediabunnyMock.conversions = [];
	mediabunnyMock.encodedVideoAddFailure = undefined;
	mediabunnyMock.encodedVideoPacketSources = [];
	mediabunnyMock.inputs = [];
	mediabunnyMock.outputFinalizeFailure = undefined;
	mediabunnyMock.outputs = [];
	mediabunnyMock.packetBatches = new Map();
	mediabunnyMock.videoTracks = [];
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

	it("closes mixed-audio mux sources after successful export", async () => {
		const videoTrack = createVideoTrack();
		const packet = createPacket(2);
		mediabunnyMock.videoTracks = [videoTrack];
		mediabunnyMock.packetBatches.set(videoTrack, [packet]);
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
		expect(mediabunnyMock.inputs).toHaveLength(2);
		expect(mediabunnyMock.inputs[0].dispose).toHaveBeenCalledTimes(1);
		expect(mediabunnyMock.inputs[1].dispose).toHaveBeenCalledTimes(1);
		expect(mediabunnyMock.outputs[1].start).toHaveBeenCalledTimes(1);
		expect(mediabunnyMock.outputs[1].finalize).toHaveBeenCalledTimes(1);
		expect(mediabunnyMock.outputs[1].cancel).not.toHaveBeenCalled();
		expect(
			mediabunnyMock.encodedVideoPacketSources[0].add,
		).toHaveBeenCalledTimes(1);
		expect(
			mediabunnyMock.encodedVideoPacketSources[0].close,
		).toHaveBeenCalledTimes(1);
		expect(mediabunnyMock.audioBufferSources[0].add).toHaveBeenCalledTimes(1);
		expect(mediabunnyMock.audioBufferSources[0].close).toHaveBeenCalledTimes(1);
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

	it("cancels and closes mixed-audio mux resources after mux failure", async () => {
		const failure = new Error("Packet mux failed.");
		const videoTrack = createVideoTrack();
		mediabunnyMock.videoTracks = [videoTrack];
		mediabunnyMock.packetBatches.set(videoTrack, [createPacket(2)]);
		mediabunnyMock.encodedVideoAddFailure = failure;
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

		expect(mediabunnyMock.inputs[1].dispose).toHaveBeenCalledTimes(1);
		expect(mediabunnyMock.outputs[1].cancel).toHaveBeenCalledTimes(1);
		expect(
			mediabunnyMock.encodedVideoPacketSources[0].close,
		).toHaveBeenCalledTimes(1);
		expect(mediabunnyMock.audioBufferSources[0].close).toHaveBeenCalledTimes(1);
	});
});

type MockFn = ReturnType<typeof vi.fn>;

type MockInput = {
	dispose: MockFn;
	getVideoTracks: MockFn;
};

type MockOutput = {
	addAudioTrack: MockFn;
	addVideoTrack: MockFn;
	cancel: MockFn;
	finalize: MockFn;
	start: MockFn;
	target: {
		buffer: ArrayBuffer | null;
	};
};

type MockConversion = {
	cancel: MockFn;
	execute: MockFn;
	onProgress?: (completedRatio: number) => void;
};

type MockConversionConfig = {
	output: MockOutput;
	video: {
		codec: string;
		fit?: string;
		height?: number;
		width?: number;
	};
};

type MockVideoTrack = {
	codec: "avc";
	getDecoderConfig: MockFn;
	getFirstTimestamp: MockFn;
};

type MockPacket = {
	clone: MockFn;
	timestamp: number;
};

type MockEncodedVideoPacketSource = {
	add: MockFn;
	close: MockFn;
};

type MockAudioBufferSource = {
	add: MockFn;
	close: MockFn;
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

function createVideoTrack(): MockVideoTrack {
	return {
		codec: "avc",
		getDecoderConfig: vi.fn(async () => ({ codec: "avc1.42E01E" })),
		getFirstTimestamp: vi.fn(async () => 1),
	};
}

function createPacket(timestamp: number): MockPacket {
	return {
		clone: vi.fn(({ timestamp: normalizedTimestamp }) => ({
			timestamp: normalizedTimestamp,
		})),
		timestamp,
	};
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
