/* @vitest-environment jsdom */

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mediabunnyMock = vi.hoisted(() => ({
	audioTracks: [] as object[],
	getAudioTracksError: undefined as Error | undefined,
	inputInstances: [] as Array<{
		dispose: ReturnType<typeof vi.fn>;
		getAudioTracks: ReturnType<typeof vi.fn>;
	}>,
	iterators: [] as Array<{
		next: ReturnType<typeof vi.fn>;
		return: ReturnType<typeof vi.fn>;
	}>,
	packetsByTrack: new Map<
		object,
		Array<{ timestamp: number; duration: number }>
	>(),
	packetsError: undefined as Error | undefined,
	sampleReadHook: undefined as (() => Promise<void>) | undefined,
	packetIterators: [] as Array<{ return: ReturnType<typeof vi.fn> }>,
	samplesByTrack: new Map<
		object,
		Array<ReturnType<typeof createAudioSampleLike>>
	>(),
}));

const waveformWorkerMock = vi.hoisted(() => ({
	deferResponse: false,
	errorMessage: "",
	instances: [] as Array<{
		addEventListener: ReturnType<typeof vi.fn>;
		postMessage: ReturnType<typeof vi.fn>;
		removeEventListener: ReturnType<typeof vi.fn>;
		terminate: ReturnType<typeof vi.fn>;
	}>,
	result: {
		samples: new Float32Array([0.25, 1]),
		status: "ready",
	} as unknown,
	throwOnConstruct: undefined as Error | undefined,
}));

vi.mock("mediabunny", () => {
	class BlobSource {
		constructor(readonly source: Blob) {}
	}

	class AudioSampleSink {
		constructor(readonly track: object) {}

		samples() {
			const samples = mediabunnyMock.samplesByTrack.get(this.track) ?? [];
			let index = 0;
			const iterator = {
				next: vi.fn(async () => {
					await mediabunnyMock.sampleReadHook?.();
					const value = samples[index];
					index += 1;

					return value
						? { done: false as const, value }
						: { done: true as const, value: undefined };
				}),
				return: vi.fn(async () => ({
					done: true as const,
					value: undefined,
				})),
			};
			mediabunnyMock.iterators.push(iterator);

			return {
				[Symbol.asyncIterator]: () => iterator,
			};
		}
	}

	class EncodedPacketSink {
		constructor(readonly track: object) {}
		packets() {
			const packets = mediabunnyMock.packetsByTrack.get(this.track) ?? [];
			let index = 0;
			const iterator = {
				next: vi.fn(async () => {
					if (mediabunnyMock.packetsError) throw mediabunnyMock.packetsError;
					const value = packets[index++];
					return value
						? { done: false as const, value }
						: { done: true as const, value: undefined };
				}),
				return: vi.fn(async () => ({ done: true as const, value: undefined })),
			};
			mediabunnyMock.packetIterators.push(iterator);
			return { [Symbol.asyncIterator]: () => iterator };
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
		AudioSampleSink,
		EncodedPacketSink,
		BlobSource,
		Input,
	};
});

vi.mock("../waveform/selection-waveform-lanes.worker?worker", () => {
	class MockWaveformLaneWorker {
		private listeners = new Map<string, Set<(event: unknown) => void>>();

		addEventListener = vi.fn(
			(type: string, listener: (event: unknown) => void) => {
				const listeners = this.listeners.get(type) ?? new Set();
				listeners.add(listener);
				this.listeners.set(type, listeners);
			},
		);

		removeEventListener = vi.fn(
			(type: string, listener: (event: unknown) => void) => {
				this.listeners.get(type)?.delete(listener);
			},
		);

		postMessage = vi.fn(() => {
			if (waveformWorkerMock.deferResponse) {
				return;
			}

			queueMicrotask(() => {
				if (waveformWorkerMock.errorMessage) {
					this.dispatch("error", { message: waveformWorkerMock.errorMessage });
					return;
				}

				this.dispatch("message", {
					data: {
						result: waveformWorkerMock.result,
						type: "done",
					},
				});
			});
		});

		terminate = vi.fn();

		constructor() {
			if (waveformWorkerMock.throwOnConstruct) {
				throw waveformWorkerMock.throwOnConstruct;
			}

			waveformWorkerMock.instances.push(this);
		}

		private dispatch(type: string, event: unknown) {
			for (const listener of this.listeners.get(type) ?? []) {
				listener(event);
			}
		}
	}

	return {
		default: MockWaveformLaneWorker,
	};
});

import type { ReadyMediaAsset } from "@/editor-core/model";

import type {
	WaveformLaneLoader,
	WaveformLaneResult,
	WaveformLaneState,
} from "../types/selection-waveform-lanes.types";
import {
	addAudioSampleToBuckets,
	clearWaveformLaneCache,
	loadBrowserWaveformLane,
	useWaveformLaneStates,
} from "../waveform/selection-waveform-lanes";

beforeEach(() => {
	clearWaveformLaneCache();
	mediabunnyMock.packetsByTrack = new Map();
	mediabunnyMock.packetsError = undefined;
	mediabunnyMock.sampleReadHook = undefined;
	mediabunnyMock.packetIterators = [];
	mediabunnyMock.audioTracks = [];
	mediabunnyMock.getAudioTracksError = undefined;
	mediabunnyMock.inputInstances = [];
	mediabunnyMock.iterators = [];
	mediabunnyMock.samplesByTrack = new Map();
	waveformWorkerMock.deferResponse = false;
	waveformWorkerMock.errorMessage = "";
	waveformWorkerMock.instances = [];
	waveformWorkerMock.result = {
		samples: new Float32Array([0.25, 1]),
		status: "ready",
	};
	waveformWorkerMock.throwOnConstruct = undefined;
	vi.stubGlobal("Worker", undefined);
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

describe("useWaveformLaneStates", () => {
	it("ignores obsolete lane completion after asset replacement", async () => {
		const stale = createDeferred<WaveformLaneResult>();
		const current = createDeferred<WaveformLaneResult>();
		const replacement = new Blob(["replacement"]);
		const loader: WaveformLaneLoader = vi.fn((request) =>
			request.source === source ? stale.promise : current.promise,
		);
		const view = render(<WaveformLaneStateProbe waveformLaneLoader={loader} />);
		view.rerender(
			<WaveformLaneStateProbe
				waveformLaneLoader={loader}
				laneSource={replacement}
			/>,
		);
		await act(async () => {
			current.resolve({ status: "ready", samples: [1] });
			await current.promise;
		});
		await act(async () => {
			stale.resolve({ status: "unavailable", reason: "obsolete" });
			await stale.promise;
		});
		expect(readLaneStates()["audio-voice"]).toMatchObject({
			status: "ready",
			samples: [1],
		});
		expect(vi.mocked(loader).mock.calls[0][0].signal?.aborted).toBe(true);
		view.unmount();
		expect(vi.mocked(loader).mock.calls[2][0].signal?.aborted).toBe(true);
	});
});

describe("loadBrowserWaveformLane", () => {
	it.each([
		{
			timestamps: [1, 1.1, 1.2, 3, 3.1],
			packetDuration: 1.8,
			kind: "already media-timed",
		},
	])(
		"places $kind decoded timestamps after a packet gap and preserves leading silence",
		async ({ timestamps, packetDuration }) => {
			const track = createMockAudioTrack({ sampleRate: 100 });
			mediabunnyMock.audioTracks = [track];
			// Leading offset 1s; compressed packet before the gap has inferred duration.
			mediabunnyMock.packetsByTrack.set(track, [
				{ timestamp: 1, duration: 0.1 },
				{ timestamp: 1.1, duration: 0.1 },
				{ timestamp: 1.2, duration: packetDuration },
				{ timestamp: 3, duration: 0.1 },
				{ timestamp: 3.1, duration: 0.1 },
			]);
			const samples = timestamps.map((time) =>
				createAudioSampleLike([new Array(10).fill(1)], 100, time),
			);
			mediabunnyMock.samplesByTrack.set(track, samples);
			const result = await loadBrowserWaveformLane({
				assetDurationUs: 4_000_000,
				source,
				track: readyAsset.tracks.audio[0],
				trackIndex: 0,
			});
			expect(result.status).toBe("ready");
			if (result.status !== "ready")
				throw new Error("Expected ready waveform.");
			const at = (seconds: number) =>
				result.samples[Math.floor((seconds / 4) * 8192)];
			expect(at(0.5)).toBe(0);
			expect(at(1.11)).toBe(1);
			expect(at(1.31)).toBe(0);
			expect(at(2.5)).toBe(0);
			expect(at(3.01)).toBe(1);
			expect(at(3.11)).toBe(1);
			for (const sample of samples)
				expect(sample.close).toHaveBeenCalledTimes(1);
			expect(mediabunnyMock.packetIterators[0]?.return).toHaveBeenCalledTimes(
				1,
			);
		},
	);

	it("closes a sample delivered after cancellation and returns its iterator", async () => {
		const controller = new AbortController();
		const track = createMockAudioTrack();
		const sample = createAudioSampleLike([[1]], 100);
		mediabunnyMock.audioTracks = [track];
		mediabunnyMock.samplesByTrack.set(track, [sample]);
		mediabunnyMock.sampleReadHook = async () => {
			controller.abort();
		};
		await expect(
			loadBrowserWaveformLane({
				assetDurationUs: readyAsset.durationUs,
				signal: controller.signal,
				source,
				track: readyAsset.tracks.audio[0],
				trackIndex: 0,
			}),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(sample.close).toHaveBeenCalledTimes(1);
		expect(mediabunnyMock.iterators[0]?.return).toHaveBeenCalledTimes(1);
		expect(lastMediaInput().dispose).toHaveBeenCalledTimes(1);
	});

	it("loads waveform lanes through a worker when available", async () => {
		vi.stubGlobal("Worker", vi.fn());

		const result = await loadBrowserWaveformLane({
			assetDurationUs: readyAsset.durationUs,
			source,
			track: readyAsset.tracks.audio[0],
			trackIndex: 0,
		});

		expect(result.status).toBe("ready");
		if (result.status !== "ready") {
			throw new Error("Expected ready waveform result.");
		}
		expect(result.samples).toBeInstanceOf(Float32Array);
		expect(Array.from(result.samples)).toEqual([0.25, 1]);
		expect(mediabunnyMock.inputInstances).toHaveLength(0);
		expect(waveformWorkerMock.instances).toHaveLength(1);

		expect(waveformWorkerMock.instances[0]?.terminate).toHaveBeenCalledTimes(1);
	});

	it("keeps a worker's domain-unavailable result final instead of decoding on the current thread", async () => {
		vi.stubGlobal("Worker", vi.fn());
		waveformWorkerMock.result = {
			status: "unavailable",
			reason: "The audio track cannot be decoded.",
		};
		const result = await loadBrowserWaveformLane({
			assetDurationUs: readyAsset.durationUs,
			source,
			track: readyAsset.tracks.audio[0],
			trackIndex: 0,
		});
		expect(result).toEqual(waveformWorkerMock.result);
		expect(mediabunnyMock.inputInstances).toHaveLength(0);
		expect(waveformWorkerMock.instances[0]?.terminate).toHaveBeenCalledOnce();
	});

	it("falls back to the current thread when the worker script fails to start", async () => {
		vi.stubGlobal("Worker", vi.fn());
		waveformWorkerMock.errorMessage = "Worker script failed";
		const audioTrack = createMockAudioTrack();
		mediabunnyMock.audioTracks = [audioTrack];
		mediabunnyMock.samplesByTrack.set(audioTrack, [
			createAudioSampleLike([[0.5, 1]], 2),
		]);

		const result = await loadBrowserWaveformLane({
			assetDurationUs: readyAsset.durationUs,
			source,
			track: readyAsset.tracks.audio[0],
			trackIndex: 0,
		});

		expect(result.status).toBe("ready");
		expect(waveformWorkerMock.instances[0]?.terminate).toHaveBeenCalledTimes(1);
		expect(mediabunnyMock.inputInstances).toHaveLength(1);
	});
});

describe("addAudioSampleToBuckets", () => {
	it("maps waveform samples by media timestamps instead of lane-local offsets", () => {
		const delayedBuckets = new Array<number>(10).fill(0);
		const delayedSample = createAudioSampleLike(
			[
				[0.5, 1, 0.25, 0.75],
				[0.25, 0.5, 0.75, 0.25],
			],
			2,
			4,
		);

		addAudioSampleToBuckets({
			buckets: delayedBuckets,
			mediaDurationSeconds: 10,
			sample: delayedSample,
		});

		expect(delayedBuckets).toEqual([0, 0, 0, 0, 0.75, 0.5, 0, 0, 0, 0]);
		expect(delayedSample.copyTo).toHaveBeenCalledTimes(2);

		const clippedBuckets = new Array<number>(4).fill(0);

		addAudioSampleToBuckets({
			buckets: clippedBuckets,
			mediaDurationSeconds: 4,
			sample: createAudioSampleLike([[1, 0.5, 0.25, 0.125]], 2, -0.5),
		});

		expect(clippedBuckets).toEqual([0.5, 0.125, 0, 0]);
	});
});

const source = new File(["video"], "clip.mp4", { type: "video/mp4" });

function WaveformLaneStateProbe({
	waveformLaneLoader,
	laneSource = source,
}: {
	waveformLaneLoader: WaveformLaneLoader;
	laneSource?: Blob;
}) {
	const laneStates = useWaveformLaneStates({
		asset: readyAsset,
		source: laneSource,
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
						samples: Array.from(lane.samples),
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
	codec = "aac",
	sampleRate = 48_000,
}: {
	canDecode?: boolean;
	durationSeconds?: number;
	codec?: string;
	sampleRate?: number;
} = {}) {
	return {
		canDecode: vi.fn(async () => canDecode),
		getCodec: vi.fn(async () => codec),
		getSampleRate: vi.fn(async () => sampleRate),
		computeDuration: vi.fn(async () => durationSeconds),
	};
}

const readyAsset = {
	durationUs: 12_000_000,
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

function createAudioSampleLike(
	channels: number[][],
	sampleRate: number,
	timestamp = 0,
) {
	return {
		close: vi.fn(),
		copyTo: vi.fn(
			(
				destination: Float32Array,
				{
					format,
					planeIndex,
				}: { format: "f32" | "f32-planar"; planeIndex: number },
			) => {
				if (format === "f32-planar") {
					destination.set(channels[planeIndex] ?? []);
					return;
				}

				for (
					let frameIndex = 0;
					frameIndex < (channels[0]?.length ?? 0);
					frameIndex += 1
				) {
					for (
						let channelIndex = 0;
						channelIndex < channels.length;
						channelIndex += 1
					) {
						destination[frameIndex * channels.length + channelIndex] =
							channels[channelIndex]?.[frameIndex] ?? 0;
					}
				}
			},
		),
		numberOfFrames: channels[0]?.length ?? 0,
		numberOfChannels: channels.length,
		sampleRate,
		timestamp,
	};
}
