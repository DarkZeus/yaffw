import { beforeEach, describe, expect, it, vi } from "vitest";

const mediabunnyMock = vi.hoisted(() => ({
	audioTracks: [] as MockAudioTrack[],
	inputs: [] as MockInput[],
	videoTracks: [] as MockVideoTrack[],
}));

vi.mock("mediabunny", () => ({
	ALL_FORMATS: [],
	BlobSource: class BlobSource {},
	Input: class Input implements MockInput {
		dispose = vi.fn();

		constructor() {
			mediabunnyMock.inputs.push(this);
		}

		async computeDuration() {
			return 2;
		}

		async getAudioTracks() {
			return mediabunnyMock.audioTracks;
		}

		async getMimeType() {
			return "video/mp4";
		}

		async getVideoTracks() {
			return mediabunnyMock.videoTracks;
		}
	},
}));

import { inspectGeneratedMediaBlob } from "../generated-media/generated-media-inspector";

beforeEach(() => {
	mediabunnyMock.audioTracks = [];
	mediabunnyMock.inputs = [];
	mediabunnyMock.videoTracks = [];
});

describe("generated media inspector metadata", () => {
	it("resolves current Generated media track metadata getters", async () => {
		mediabunnyMock.videoTracks = [createVideoTrack()];
		mediabunnyMock.audioTracks = [createAudioTrack()];

		const inspection = await inspectGeneratedMediaBlob(
			new Blob(["generated"], { type: "video/mp4" }),
		);

		expect(inspection.tracks).toEqual({
			audio: [
				{
					channels: 2,
					codec: "mp4a.40.2",
					durationUs: 2_000_000,
					id: "2",
					kind: "audio",
					label: "Mixed audio",
					language: "eng",
					sampleRate: 48_000,
				},
			],
			video: [
				{
					codec: "avc1.640028",
					durationUs: 2_000_000,
					height: 1080,
					id: "1",
					kind: "video",
					label: "Generated video",
					width: 1920,
				},
			],
		});
		expect(mediabunnyMock.inputs[0]?.dispose).toHaveBeenCalledOnce();
	});

	it("rejects and disposes when Generated media metadata cannot be read", async () => {
		const failure = new Error("Generated video dimensions are malformed.");
		const videoTrack = createVideoTrack();
		videoTrack.getDisplayHeight.mockRejectedValueOnce(failure);
		mediabunnyMock.videoTracks = [videoTrack];

		await expect(
			inspectGeneratedMediaBlob(new Blob(["generated"], { type: "video/mp4" })),
		).rejects.toBe(failure);
		expect(mediabunnyMock.inputs[0]?.dispose).toHaveBeenCalledOnce();
	});
});

type MockInput = {
	dispose: ReturnType<typeof vi.fn>;
};

type MockVideoTrack = ReturnType<typeof createVideoTrack>;
type MockAudioTrack = ReturnType<typeof createAudioTrack>;

function createVideoTrack() {
	return {
		computeDuration: vi.fn(async () => 2),
		getCodec: vi.fn(async () => "avc"),
		getCodecParameterString: vi.fn(async () => "avc1.640028"),
		getDisplayHeight: vi.fn(async () => 1080),
		getDisplayWidth: vi.fn(async () => 1920),
		getInternalCodecId: vi.fn(async () => "avc1"),
		getName: vi.fn(async () => "Generated video"),
		id: 1,
	};
}

function createAudioTrack() {
	return {
		computeDuration: vi.fn(async () => 2),
		getCodec: vi.fn(async () => "aac"),
		getCodecParameterString: vi.fn(async () => "mp4a.40.2"),
		getInternalCodecId: vi.fn(async () => "mp4a"),
		getLanguageCode: vi.fn(async () => "eng"),
		getName: vi.fn(async () => "Mixed audio"),
		getNumberOfChannels: vi.fn(async () => 2),
		getSampleRate: vi.fn(async () => 48_000),
		id: 2,
	};
}
