import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReadyMediaAsset } from "@/editor-core/model";

const mockMedia = vi.hoisted(() => ({
	encodedAddShouldFail: false,
	encodedSources: [] as Array<{
		add: ReturnType<typeof vi.fn>;
		close: ReturnType<typeof vi.fn>;
	}>,
	inputs: [] as Array<{ dispose: ReturnType<typeof vi.fn> }>,
	outputs: [] as Array<{ cancel: ReturnType<typeof vi.fn> }>,
	tracks: [] as Array<typeof mockTrack>,
}));

function installMediabunnyMock() {
	class FakeOutputFormat {
		getSupportedAudioCodecs() {
			return ["aac", "mp3", "opus", "vorbis", "flac", "pcm-s16"];
		}
	}

	class FakeInput {
		dispose = vi.fn();

		constructor() {
			mockMedia.inputs.push(this);
		}

		async getAudioTracks() {
			return mockMedia.tracks;
		}
	}

	class FakeOutput {
		cancel = vi.fn();
		start = vi.fn();
		finalize = vi.fn(async () => {
			this.target.buffer = new Uint8Array([1, 2, 3]).buffer;
		});

		constructor({ target }: { target: FakeBufferTarget }) {
			this.target = target;
			mockMedia.outputs.push(this);
		}

		addAudioTrack() {}

		private target: FakeBufferTarget;
	}

	class FakeEncodedAudioPacketSource {
		add = vi.fn(async () => {
			if (mockMedia.encodedAddShouldFail) {
				throw new Error("packet add failed");
			}
		});
		close = vi.fn();

		constructor() {
			mockMedia.encodedSources.push(this);
		}
	}

	class FakeEncodedPacketSink {
		async *packets() {
			yield {
				clone(overrides: Record<string, unknown>) {
					return {
						...this,
						...overrides,
					};
				},
				timestamp: 0,
			};
		}
	}

	class FakeBufferTarget {
		buffer: ArrayBuffer | null = null;
	}

	vi.doMock("mediabunny", () => ({
		ALL_FORMATS: [],
		AdtsOutputFormat: FakeOutputFormat,
		AudioBufferSource: FakeEncodedAudioPacketSource,
		AudioSampleSink: class {},
		AudioSampleSource: FakeEncodedAudioPacketSource,
		BlobSource: class {},
		BufferTarget: FakeBufferTarget,
		EncodedAudioPacketSource: FakeEncodedAudioPacketSource,
		EncodedPacketSink: FakeEncodedPacketSink,
		FlacOutputFormat: FakeOutputFormat,
		Input: FakeInput,
		Mp3OutputFormat: FakeOutputFormat,
		Mp4OutputFormat: FakeOutputFormat,
		OggOutputFormat: FakeOutputFormat,
		Output: FakeOutput,
		WavOutputFormat: FakeOutputFormat,
		WebMOutputFormat: FakeOutputFormat,
	}));
}

beforeEach(() => {
	vi.clearAllMocks();
	mockMedia.encodedAddShouldFail = false;
	mockMedia.encodedSources = [];
	mockMedia.inputs = [];
	mockMedia.outputs = [];
	mockMedia.tracks = [mockTrack];
});

afterEach(() => {
	vi.doUnmock("mediabunny");
	vi.resetModules();
});

describe("preparePreviewAudioResources cleanup", () => {
	it("releases remux resources when a track preparation attempt fails", async () => {
		installMediabunnyMock();
		mockMedia.encodedAddShouldFail = true;
		const { preparePreviewAudioResources } = await import(
			"../engine/preview-audio-resources"
		);

		const result = await preparePreviewAudioResources({
			asset: readyAsset,
			createObjectURL: vi.fn(() => "blob:audio-preview"),
			revokeObjectURL: vi.fn(),
			signal: new AbortController().signal,
			source: new Blob(["video"], { type: "video/mp4" }),
		});

		expect(result.resources).toEqual([]);
		expect(result.failures[0]?.reason).toContain("packet add failed");
		expect(mockMedia.inputs[0]?.dispose).toHaveBeenCalledTimes(1);
		expect(mockMedia.outputs).toHaveLength(2);
		expect(mockMedia.encodedSources).toHaveLength(2);

		for (const output of mockMedia.outputs) {
			expect(output.cancel).toHaveBeenCalledTimes(1);
		}

		for (const source of mockMedia.encodedSources) {
			expect(source.close).toHaveBeenCalledTimes(1);
		}
	});

	it("records a metadata getter rejection as that Preview audio track failure", async () => {
		installMediabunnyMock();
		const failure = new Error("Audio codec metadata is malformed.");
		mockMedia.tracks = [
			{
				...mockTrack,
				getCodec: vi.fn(async () => {
					throw failure;
				}),
			},
		];
		const { preparePreviewAudioResources } = await import(
			"../engine/preview-audio-resources"
		);

		const result = await preparePreviewAudioResources({
			asset: readyAsset,
			createObjectURL: vi.fn(() => "blob:audio-preview"),
			revokeObjectURL: vi.fn(),
			signal: new AbortController().signal,
			source: new Blob(["video"], { type: "video/mp4" }),
		});

		expect(result.resources).toEqual([]);
		expect(result.failures).toEqual([
			expect.objectContaining({
				reason: "Audio codec metadata is malformed.",
				trackId: "audio-1",
			}),
		]);
		expect(mockMedia.inputs[0]?.dispose).toHaveBeenCalledOnce();
	});
});

const mockTrack = {
	canDecode: vi.fn(async () => false),
	getCodec: vi.fn(async () => "aac"),
	getDecoderConfig: vi.fn(async () => ({ codec: "aac" })),
	getFirstTimestamp: vi.fn(async () => 0),
	getLanguageCode: vi.fn(async () => "und"),
	getName: vi.fn(async () => "Voice"),
	id: "audio-1",
};

const readyAsset = {
	durationUs: 12_000_000,
	exportCapability: {
		profile: {
			audioCodec: "aac",
			container: "mp4",
			videoCodec: "h264",
		},
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
		sizeBytes: 1_024,
	},
	tracks: {
		audio: [
			{
				codec: "aac",
				id: "audio-1",
				kind: "audio",
				label: "Voice",
			},
		],
		video: [
			{
				id: "video-1",
				kind: "video",
			},
		],
	},
} satisfies ReadyMediaAsset;
