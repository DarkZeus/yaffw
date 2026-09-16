import type { ReadyMediaAsset } from "@/editor-core/model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { preparePreviewAudioResources } from "../engine/preview-audio-resources";
const mockMedia = vi.hoisted(() => ({
	inputs: [] as Array<{ dispose: ReturnType<typeof vi.fn> }>,
	tracks: [] as Array<Record<string, unknown>>,
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
	mockMedia.inputs = [];
	mockMedia.tracks = [createInputTrack()];
});
describe("preparePreviewAudioResources", () => {
	it("returns metadata without decoding and retains the one asset Input until disposal", async () => {
		const result = await preparePreviewAudioResources({
			asset: readyAsset,
			signal: new AbortController().signal,
			source: new Blob(["video"]),
		});
		expect(result.resources).toEqual([
			{
				numberOfChannels: 2,
				sampleRate: 48_000,
				track: readyAsset.tracks.audio[0],
				trackId: "audio-1",
				trackIndex: 0,
			},
		]);
		expect(result.failures).toEqual([]);
		expect(result.provider.durationSeconds).toBe(12);
		expect(mockMedia.inputs).toHaveLength(1);
		expect(mockMedia.inputs[0]?.dispose).not.toHaveBeenCalled();
		await result.provider.dispose();
		await result.provider.dispose();
		expect(mockMedia.inputs[0]?.dispose).toHaveBeenCalledOnce();
	});
	it("maps embedded track indices to domain IDs and preserves failed tracks for engine retry", async () => {
		mockMedia.tracks = [
			createInputTrack({ id: 42 }),
			createInputTrack({ id: 88, canDecode: vi.fn(async () => false) }),
		];
		const result = await preparePreviewAudioResources({
			asset: twoTrackReadyAsset,
			signal: new AbortController().signal,
			source: new Blob(),
		});
		expect(result.provider.trackIds).toEqual(["audio-1", "audio-2"]);
		expect(result.resources.map((resource) => resource.trackId)).toEqual([
			"audio-1",
			"audio-2",
		]);
		expect(result.failures).toEqual([
			expect.objectContaining({
				trackId: "audio-2",
				reason: "Track is not decodable in this browser.",
			}),
		]);
		await result.provider.dispose();
	});
	it("isolates missing-track and metadata failures without discarding healthy metadata", async () => {
		mockMedia.tracks = [
			createInputTrack({
				getSampleRate: vi.fn(async () => {
					throw new Error("metadata failed");
				}),
			}),
		];
		const result = await preparePreviewAudioResources({
			asset: twoTrackReadyAsset,
			signal: new AbortController().signal,
			source: new Blob(),
		});
		expect(result.resources).toHaveLength(2);
		expect(result.failures.map((failure) => failure.reason)).toEqual([
			"metadata failed",
			"The analyzed audio track is no longer available.",
		]);
		await result.provider.dispose();
	});
	it("disposes exactly once when abort races metadata completion", async () => {
		const pendingMetadata = createDeferred<number>();
		mockMedia.tracks = [
			createInputTrack({ getSampleRate: () => pendingMetadata.promise }),
		];
		const controller = new AbortController();
		const pending = preparePreviewAudioResources({
			asset: readyAsset,
			signal: controller.signal,
			source: new Blob(),
		});
		await vi.waitFor(() => expect(mockMedia.inputs).toHaveLength(1));
		controller.abort();
		expect(mockMedia.inputs[0]?.dispose).toHaveBeenCalledOnce();
		pendingMetadata.resolve(48_000);
		await expect(pending).rejects.toMatchObject({ name: "AbortError" });
		expect(mockMedia.inputs[0]?.dispose).toHaveBeenCalledOnce();
	});
	it("does not open an Input for an already aborted request", async () => {
		const controller = new AbortController();
		controller.abort();
		await expect(
			preparePreviewAudioResources({
				asset: readyAsset,
				signal: controller.signal,
				source: new Blob(),
			}),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(mockMedia.inputs).toHaveLength(0);
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
