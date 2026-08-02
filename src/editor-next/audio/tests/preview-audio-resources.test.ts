import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReadyMediaAsset } from "@/editor-core/model";

const mockMedia = vi.hoisted(() => ({
	decodeTrack: vi.fn(),
	inputs: [] as Array<{ dispose: ReturnType<typeof vi.fn> }>,
	tracks: [] as Array<Record<string, unknown>>,
}));

vi.mock("../../media-work/adapters/mediabunny-audio-buffer", () => ({
	decodeMediabunnyAudioTrackRange: mockMedia.decodeTrack,
}));

vi.mock("mediabunny", () => ({
	ALL_FORMATS: [],
	BlobSource: class {},
	Input: class {
		dispose = vi.fn();

		constructor() {
			mockMedia.inputs.push(this);
		}

		async getAudioTracks() {
			return mockMedia.tracks;
		}
	},
}));

beforeEach(() => {
	vi.clearAllMocks();
	mockMedia.inputs = [];
	mockMedia.tracks = [createInputTrack()];
	mockMedia.decodeTrack.mockResolvedValue(createAudioBuffer());
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("preparePreviewAudioResources", () => {
	it("prepares a directly decoded resource with the source timestamp", async () => {
		const { preparePreviewAudioResources } = await import(
			"../engine/preview-audio-resources"
		);

		const result = await preparePreviewAudioResources({
			asset: readyAsset,
			signal: new AbortController().signal,
			source: new Blob(["video"], { type: "video/mp4" }),
		});

		expect(result.failures).toEqual([]);
		expect(result.resources).toEqual([
			expect.objectContaining({
				audioBuffer: expect.any(Object),
				startPositionSeconds: 0.75,
				trackId: "audio-1",
				trackIndex: 0,
			}),
		]);
		expect(mockMedia.decodeTrack).toHaveBeenCalledWith(
			expect.objectContaining({
				endSeconds: 10,
				format: { numberOfChannels: 2, sampleRate: 48_000 },
				startSeconds: 0.75,
			}),
		);
		expect(mockMedia.inputs[0]?.dispose).toHaveBeenCalledOnce();
	});

	it("decodes tracks concurrently while preserving asset track order", async () => {
		const firstDecode = createDeferred<AudioBuffer>();
		const secondDecode = createDeferred<AudioBuffer>();
		const firstAudioBuffer = createAudioBuffer();
		const secondAudioBuffer = createAudioBuffer();
		mockMedia.tracks = [
			createInputTrack({ id: "audio-1" }),
			createInputTrack({ id: "audio-2" }),
		];
		mockMedia.decodeTrack
			.mockImplementationOnce(() => firstDecode.promise)
			.mockImplementationOnce(() => secondDecode.promise);
		const { preparePreviewAudioResources } = await import(
			"../engine/preview-audio-resources"
		);

		const pending = preparePreviewAudioResources({
			asset: twoTrackReadyAsset,
			signal: new AbortController().signal,
			source: new Blob(["video"], { type: "video/mp4" }),
		});

		await vi.waitFor(() =>
			expect(mockMedia.decodeTrack).toHaveBeenCalledTimes(2),
		);
		secondDecode.resolve(secondAudioBuffer);
		firstDecode.resolve(firstAudioBuffer);

		await expect(pending).resolves.toEqual({
			failures: [],
			resources: [
				expect.objectContaining({
					audioBuffer: firstAudioBuffer,
					trackId: "audio-1",
					trackIndex: 0,
				}),
				expect.objectContaining({
					audioBuffer: secondAudioBuffer,
					trackId: "audio-2",
					trackIndex: 1,
				}),
			],
		});
	});

	it("isolates a track metadata failure and disposes the input", async () => {
		mockMedia.tracks = [
			createInputTrack({
				canDecode: vi.fn(async () => {
					throw new Error("Audio codec metadata is malformed.");
				}),
			}),
		];
		const { preparePreviewAudioResources } = await import(
			"../engine/preview-audio-resources"
		);

		const result = await preparePreviewAudioResources({
			asset: readyAsset,
			signal: new AbortController().signal,
			source: new Blob(["video"]),
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

	it("disposes Mediabunny immediately when preparation is cancelled", async () => {
		const controller = new AbortController();
		mockMedia.decodeTrack.mockImplementation(
			({ signal }: { signal: AbortSignal }) =>
				new Promise((_resolve, reject) => {
					signal.addEventListener("abort", () => {
						reject(new DOMException("cancelled", "AbortError"));
					});
				}),
		);
		const { preparePreviewAudioResources } = await import(
			"../engine/preview-audio-resources"
		);

		const pending = preparePreviewAudioResources({
			asset: readyAsset,
			signal: controller.signal,
			source: new Blob(["video"]),
		});
		await vi.waitFor(() =>
			expect(mockMedia.decodeTrack).toHaveBeenCalledOnce(),
		);
		controller.abort();

		await expect(pending).rejects.toMatchObject({ name: "AbortError" });
		expect(mockMedia.inputs[0]?.dispose).toHaveBeenCalled();
	});
});

function createInputTrack(overrides: Record<string, unknown> = {}) {
	return {
		canDecode: vi.fn(async () => true),
		computeDuration: vi.fn(async () => 10),
		getFirstTimestamp: vi.fn(async () => 0.75),
		getNumberOfChannels: vi.fn(async () => 2),
		getSampleRate: vi.fn(async () => 48_000),
		id: "audio-1",
		...overrides,
	};
}

function createAudioBuffer(): AudioBuffer {
	return {
		duration: 9.25,
		length: 444_000,
		numberOfChannels: 2,
		sampleRate: 48_000,
	} as AudioBuffer;
}

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});

	return { promise, resolve };
}

const readyAsset = {
	durationUs: 12_000_000,
	exportCapability: {
		profile: { audioCodec: "aac", container: "mp4", videoCodec: "h264" },
		supported: true,
	},
	frameTiming: { fps: 30, frameDurationUs: 33_333, source: "known" },
	id: "asset-1",
	label: "clip.mp4",
	provenance: {
		fileName: "clip.mp4",
		mimeType: "video/mp4",
		sizeBytes: 1_024,
	},
	tracks: {
		audio: [{ codec: "aac", id: "audio-1", kind: "audio", label: "Voice" }],
		video: [{ id: "video-1", kind: "video" }],
	},
} satisfies ReadyMediaAsset;

const twoTrackReadyAsset = {
	...readyAsset,
	tracks: {
		...readyAsset.tracks,
		audio: [
			readyAsset.tracks.audio[0],
			{ codec: "aac", id: "audio-2", kind: "audio", label: "Desktop" },
		],
	},
} satisfies ReadyMediaAsset;
