/* @vitest-environment jsdom */

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mediabunnyMock = vi.hoisted(() => ({
	audioTracks: [] as object[],
	buffersByTrack: new Map<object, Array<{ buffer: AudioBuffer; timestamp: number }>>(),
	getAudioTracksError: undefined as Error | undefined,
	inputInstances: [] as Array<{
		dispose: ReturnType<typeof vi.fn>;
		getAudioTracks: ReturnType<typeof vi.fn>;
	}>,
}));

vi.mock("mediabunny", () => {
	class BlobSource {
		constructor(readonly source: Blob) {}
	}

	class AudioBufferSink {
		constructor(readonly track: object) {}

		async *buffers() {
			for (const chunk of mediabunnyMock.buffersByTrack.get(this.track) ?? []) {
				yield chunk;
			}
		}
	}

	const Input = vi.fn().mockImplementation(() => {
		const input = {
			dispose: vi.fn(),
			getAudioTracks: vi.fn(async () => {
				if (mediabunnyMock.getAudioTracksError) {
					throw mediabunnyMock.getAudioTracksError;
				}

				return mediabunnyMock.audioTracks;
			}),
		};
		mediabunnyMock.inputInstances.push(input);

		return input;
	});

	return {
		ALL_FORMATS: {},
		AudioBufferSink,
		BlobSource,
		Input,
	};
});

import type { ReadyMediaAsset } from "@/editor-core/model";

import {
	addAudioBufferToBuckets,
	loadBrowserWaveformLane,
	useWaveformLaneStates,
} from "./selection-waveform-lanes";
import type {
	WaveformLaneLoader,
	WaveformLaneResult,
	WaveformLaneState,
} from "./selection-waveform-lanes.types";

beforeEach(() => {
	mediabunnyMock.audioTracks = [];
	mediabunnyMock.buffersByTrack = new Map();
	mediabunnyMock.getAudioTracksError = undefined;
	mediabunnyMock.inputInstances = [];
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("useWaveformLaneStates", () => {
	it("starts lanes as loading and records loader results by track identity", async () => {
		const voiceLane = createDeferred<WaveformLaneResult>();
		const desktopLane = createDeferred<WaveformLaneResult>();
		const waveformLaneLoader: WaveformLaneLoader = vi.fn(({ trackIndex }) =>
			trackIndex === 0 ? voiceLane.promise : desktopLane.promise,
		);

		render(<WaveformLaneStateProbe waveformLaneLoader={waveformLaneLoader} />);

		await waitFor(() => {
			expect(readLaneStates()).toEqual({
				"audio-desktop": {
					status: "loading",
					trackId: "audio-desktop",
				},
				"audio-voice": {
					status: "loading",
					trackId: "audio-voice",
				},
			});
		});

		expect(waveformLaneLoader).toHaveBeenNthCalledWith(1, {
			assetDurationUs: readyAsset.durationUs,
			source,
			track: readyAsset.tracks.audio[0],
			trackIndex: 0,
		});
		expect(waveformLaneLoader).toHaveBeenNthCalledWith(2, {
			assetDurationUs: readyAsset.durationUs,
			source,
			track: readyAsset.tracks.audio[1],
			trackIndex: 1,
		});

		await act(async () => {
			voiceLane.resolve({
				samples: [0.2, 0.8],
				status: "ready",
			});
			desktopLane.reject(new Error("Decode failed"));
			await Promise.allSettled([voiceLane.promise, desktopLane.promise]);
		});

		await waitFor(() => {
			expect(readLaneStates()).toEqual({
				"audio-desktop": {
					reason: "Decode failed",
					status: "unavailable",
					trackId: "audio-desktop",
				},
				"audio-voice": {
					samples: [0.2, 0.8],
					status: "ready",
					trackId: "audio-voice",
				},
			});
		});
	});
});

describe("loadBrowserWaveformLane", () => {
	it("disposes the media input after loading a ready waveform lane", async () => {
		const audioTrack = createMockAudioTrack();
		mediabunnyMock.audioTracks = [audioTrack];
		mediabunnyMock.buffersByTrack.set(audioTrack, [
			{
				buffer: createAudioBufferLike([[0.5, 1]], 2),
				timestamp: 0,
			},
		]);

		const result = await loadBrowserWaveformLane({
			assetDurationUs: readyAsset.durationUs,
			source,
			track: readyAsset.tracks.audio[0],
			trackIndex: 0,
		});

		expect(result.status).toBe("ready");
		if (result.status === "ready") {
			expect(result.samples).toHaveLength(8192);
			expect(Math.max(...result.samples)).toBe(1);
		}
		expect(lastMediaInput().dispose).toHaveBeenCalledTimes(1);
	});

	it("disposes the media input when the requested audio track is unavailable", async () => {
		const result = await loadBrowserWaveformLane({
			assetDurationUs: readyAsset.durationUs,
			source,
			track: readyAsset.tracks.audio[0],
			trackIndex: 0,
		});

		expect(result).toEqual({
			reason: "The analyzed audio track is no longer available.",
			status: "unavailable",
		});
		expect(lastMediaInput().dispose).toHaveBeenCalledTimes(1);
	});

	it("disposes the media input when waveform loading throws", async () => {
		mediabunnyMock.getAudioTracksError = new Error("Input failed");

		const result = await loadBrowserWaveformLane({
			assetDurationUs: readyAsset.durationUs,
			source,
			track: readyAsset.tracks.audio[0],
			trackIndex: 0,
		});

		expect(result).toEqual({
			reason: "Input failed",
			status: "unavailable",
		});
		expect(lastMediaInput().dispose).toHaveBeenCalledTimes(1);
	});
});

describe("addAudioBufferToBuckets", () => {
	it("maps waveform samples by media timestamps instead of lane-local offsets", () => {
		const delayedBuckets = new Array<number>(10).fill(0);

		addAudioBufferToBuckets({
			buckets: delayedBuckets,
			buffer: createAudioBufferLike([[0.5, 1, 0.25, 0.75]], 2),
			mediaDurationSeconds: 10,
			timestampSeconds: 4,
		});

		expect(delayedBuckets).toEqual([0, 0, 0, 0, 1, 0.75, 0, 0, 0, 0]);

		const clippedBuckets = new Array<number>(4).fill(0);

		addAudioBufferToBuckets({
			buckets: clippedBuckets,
			buffer: createAudioBufferLike([[1, 0.5, 0.25, 0.125]], 2),
			mediaDurationSeconds: 4,
			timestampSeconds: -0.5,
		});

		expect(clippedBuckets).toEqual([0.5, 0.125, 0, 0]);
	});
});

const source = new File(["video"], "clip.mp4", { type: "video/mp4" });

function WaveformLaneStateProbe({
	waveformLaneLoader,
}: {
	waveformLaneLoader: WaveformLaneLoader;
}) {
	const laneStates = useWaveformLaneStates({
		asset: readyAsset,
		source,
		waveformLaneLoader,
	});

	return (
		<output data-testid="lane-states">
			{JSON.stringify(serializeLaneStates(laneStates))}
		</output>
	);
}

function serializeLaneStates(laneStates: Record<string, WaveformLaneState>) {
	return Object.fromEntries(
		Object.entries(laneStates).map(([laneId, lane]) => {
			const base = {
				status: lane.status,
				trackId: lane.track.id,
			};

			if (lane.status === "ready") {
				return [
					laneId,
					{
						...base,
						samples: lane.samples,
					},
				];
			}

			if (lane.status === "unavailable") {
				return [
					laneId,
					{
						...base,
						reason: lane.reason,
					},
				];
			}

			return [laneId, base];
		}),
	);
}

function readLaneStates() {
	return JSON.parse(screen.getByTestId("lane-states").textContent ?? "{}");
}

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		resolve = promiseResolve;
		reject = promiseReject;
	});

	return {
		promise,
		reject,
		resolve,
	};
}

function lastMediaInput() {
	const input = mediabunnyMock.inputInstances.at(-1);

	if (!input) {
		throw new Error("Expected a Mediabunny input to be created.");
	}

	return input;
}

function createMockAudioTrack({
	canDecode = true,
	durationSeconds = 12,
}: {
	canDecode?: boolean;
	durationSeconds?: number;
} = {}) {
	return {
		canDecode: vi.fn(async () => canDecode),
		computeDuration: vi.fn(async () => durationSeconds),
	};
}

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
				channels: 2,
				codec: "aac",
				id: "audio-voice",
				kind: "audio",
				label: "Voice",
				sampleRate: 48_000,
			},
			{
				channels: 2,
				codec: "aac",
				id: "audio-desktop",
				kind: "audio",
				label: "Desktop",
				sampleRate: 48_000,
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

function createAudioBufferLike(
	channels: number[][],
	sampleRate: number,
): AudioBuffer {
	return {
		getChannelData: (index: number) => Float32Array.from(channels[index] ?? []),
		length: channels[0]?.length ?? 0,
		numberOfChannels: channels.length,
		sampleRate,
	} as AudioBuffer;
}
