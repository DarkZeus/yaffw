import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mediabunnyMock = vi.hoisted(() => ({
	canDecode: true,
	decodedTimestampsUs: [] as number[],
	drawnSamples: [] as Array<{ fit: string }>,
	inputDisposals: [] as Array<ReturnType<typeof vi.fn>>,
	primaryVideoTrack: {} as object | null,
	sampleCloses: 0,
	sampleIteratorReturns: 0,
	sampleIteratorStarts: [] as number[],
	sampleSinkOptions: [] as unknown[],
}));

vi.mock("mediabunny", () => {
	class MockPacket {
		microsecondTimestamp: number;

		constructor(
			public timestamp: number,
			public sequenceNumber: number,
		) {
			this.microsecondTimestamp = Math.round(timestamp * 1_000_000);
		}
	}

	class MockSample {
		readonly microsecondTimestamp: number;

		constructor(timestamp: number) {
			this.microsecondTimestamp = Math.round(timestamp * 1_000_000);
		}

		close() {
			mediabunnyMock.sampleCloses += 1;
		}

		drawWithFit(_context: unknown, options: { fit: string }) {
			mediabunnyMock.drawnSamples.push(options);
		}
	}

	return {
		ALL_FORMATS: [],
		BlobSource: class BlobSource {
			constructor(public blob: Blob) {}
		},
		EncodedPacketSink: class EncodedPacketSink {
			async getFirstKeyPacket() {
				return new MockPacket(0, 0);
			}

			async getNextKeyPacket(packet: MockPacket) {
				return packet.sequenceNumber < 50
					? new MockPacket(packet.timestamp + 10, packet.sequenceNumber + 10)
					: null;
			}

			async getKeyPacket(timestamp: number) {
				const sequenceNumber = Math.floor(timestamp / 10) * 10;
				return new MockPacket(sequenceNumber, sequenceNumber);
			}

			async getPacket(timestamp: number) {
				const sequenceNumber = Math.max(0, Math.floor(timestamp));
				return new MockPacket(sequenceNumber, sequenceNumber);
			}
		},
		Input: class Input {
			dispose = vi.fn();

			constructor(_options: unknown) {
				mediabunnyMock.inputDisposals.push(this.dispose);
			}

			async getPrimaryVideoTrack() {
				if (!mediabunnyMock.primaryVideoTrack) {
					return null;
				}
				return {
					canDecode: async () => mediabunnyMock.canDecode,
				};
			}
		},
		VideoSampleSink: class VideoSampleSink {
			constructor(_track: unknown, options: unknown) {
				mediabunnyMock.sampleSinkOptions.push(options);
			}

			async *samples(startTimestamp: number) {
				mediabunnyMock.sampleIteratorStarts.push(startTimestamp);
				try {
					for (
						let timestamp = Math.ceil(startTimestamp);
						timestamp <= 100;
						timestamp += 1
					) {
						mediabunnyMock.decodedTimestampsUs.push(timestamp * 1_000_000);
						yield new MockSample(timestamp);
					}
				} finally {
					mediabunnyMock.sampleIteratorReturns += 1;
				}
			}
		},
	};
});

class MockOffscreenCanvas {
	readonly context = {
		clearRect: vi.fn(),
		drawImage: vi.fn(),
	};

	constructor(
		public width: number,
		public height: number,
	) {}

	getContext() {
		return this.context;
	}
}

import {
	createMediabunnyScrubFrameProvider,
	resolveScrubFrameDimensions,
} from "../scrub/mediabunny-scrub-frame-provider";

beforeEach(() => {
	mediabunnyMock.canDecode = true;
	mediabunnyMock.decodedTimestampsUs = [];
	mediabunnyMock.drawnSamples = [];
	mediabunnyMock.inputDisposals = [];
	mediabunnyMock.primaryVideoTrack = {};
	mediabunnyMock.sampleCloses = 0;
	mediabunnyMock.sampleIteratorReturns = 0;
	mediabunnyMock.sampleIteratorStarts = [];
	mediabunnyMock.sampleSinkOptions = [];
	vi.stubGlobal("OffscreenCanvas", MockOffscreenCanvas);
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("Mediabunny scrub frame provider", () => {
	it("warms the packet index and sample sink without presenting a frame", async () => {
		const onFrame = vi.fn();
		const provider = createProvider(onFrame);

		provider.warm();
		await waitForCondition(() => mediabunnyMock.sampleSinkOptions.length === 1);

		expect(mediabunnyMock.sampleSinkOptions).toEqual([
			{ optimizeForLatency: true },
		]);
		expect(mediabunnyMock.decodedTimestampsUs).toEqual([]);
		expect(onFrame).not.toHaveBeenCalled();
		provider.dispose();
	});

	it("presents only the exact frame after interaction settles", async () => {
		const onFrame = vi.fn();
		const provider = createProvider(onFrame);
		provider.warm();
		await waitForCondition(() => mediabunnyMock.sampleSinkOptions.length === 1);
		vi.useFakeTimers();

		provider.requestFrame(8_000_000, { priority: "interactive" });
		await flushMicrotasks();

		vi.advanceTimersByTime(119);
		await flushMicrotasks();
		expect(onFrame).not.toHaveBeenCalled();

		vi.advanceTimersByTime(1);
		await flushMicrotasksUntil(() =>
			onFrame.mock.calls.some(
				([frame]) => frame.actualTimestampUs === 8_000_000,
			),
		);
		expect(onFrame).toHaveBeenLastCalledWith(
			expect.objectContaining({
				actualTimestampUs: 8_000_000,
				timestampUs: 8_000_000,
			}),
		);
		expect(onFrame).toHaveBeenCalledTimes(1);
		expect(onFrame.mock.calls[0]?.[0].canvas).toMatchObject({
			height: 720,
			width: 1280,
		});

		provider.dispose();
	});

	it("presents only the exact frame immediately for a committed target", async () => {
		const onFrame = vi.fn();
		const provider = createProvider(onFrame);
		provider.warm();
		await waitForCondition(() => mediabunnyMock.sampleSinkOptions.length === 1);
		vi.useFakeTimers();

		provider.requestFrame(8_000_000, { priority: "final" });
		await flushMicrotasksUntil(() =>
			onFrame.mock.calls.some(
				([frame]) => frame.actualTimestampUs === 8_000_000,
			),
		);

		expect(
			onFrame.mock.calls.map(([frame]) => frame.actualTimestampUs),
		).toEqual([8_000_000]);
		provider.dispose();
	});

	it("resets the settling delay and presents only the latest interactive target", async () => {
		const onFrame = vi.fn();
		const provider = createProvider(onFrame);
		provider.warm();
		await waitForCondition(() => mediabunnyMock.sampleSinkOptions.length === 1);
		vi.useFakeTimers();

		provider.requestFrame(8_000_000, { priority: "interactive" });
		await flushMicrotasks();
		vi.advanceTimersByTime(100);
		provider.requestFrame(9_000_000, { priority: "interactive" });
		await flushMicrotasks();
		vi.advanceTimersByTime(119);
		await flushMicrotasks();
		expect(onFrame).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		await flushMicrotasksUntil(() => onFrame.mock.calls.length === 1);

		expect(
			mediabunnyMock.decodedTimestampsUs.filter((value) => value === 0),
		).toHaveLength(1);
		expect(onFrame.mock.calls[0]?.[0]).toMatchObject({
			actualTimestampUs: 9_000_000,
			requestId: 2,
			timestampUs: 9_000_000,
		});
		provider.dispose();
	});

	it("shows a cached exact frame without waiting for interaction to settle", async () => {
		const onFrame = vi.fn();
		const provider = createProvider(onFrame);

		provider.requestFrame(8_000_000, { priority: "final" });
		await waitForCondition(() =>
			onFrame.mock.calls.some(
				([frame]) => frame.actualTimestampUs === 8_000_000,
			),
		);
		onFrame.mockClear();
		vi.useFakeTimers();

		provider.requestFrame(8_000_000, { priority: "interactive" });
		await flushMicrotasksUntil(() => onFrame.mock.calls.length === 1);

		expect(onFrame).toHaveBeenCalledWith(
			expect.objectContaining({
				actualTimestampUs: 8_000_000,
				requestId: 2,
			}),
		);
		provider.dispose();
	});

	it("commits the final target without waiting for or replaying an interactive seek", async () => {
		const onFrame = vi.fn();
		const provider = createProvider(onFrame);
		provider.warm();
		await waitForCondition(() => mediabunnyMock.sampleSinkOptions.length === 1);
		vi.useFakeTimers();

		provider.requestFrame(8_000_000, { priority: "interactive" });
		await flushMicrotasks();
		vi.advanceTimersByTime(100);
		provider.requestFrame(9_000_000, { priority: "final" });
		await flushMicrotasksUntil(() => onFrame.mock.calls.length === 1);
		await vi.advanceTimersByTimeAsync(120);

		expect(
			onFrame.mock.calls.map(([frame]) => frame.actualTimestampUs),
		).toEqual([9_000_000]);
		provider.dispose();
	});

	it("draws samples with their own rotation and flip metadata and closes them", async () => {
		const onFrame = vi.fn();
		const provider = createProvider(onFrame);

		provider.requestFrame(8_000_000, { priority: "final" });
		await waitForCondition(() => onFrame.mock.calls.length === 1);
		provider.dispose();
		await waitForCondition(() => mediabunnyMock.sampleIteratorReturns === 1);

		expect(mediabunnyMock.drawnSamples.length).toBeGreaterThan(0);
		expect(mediabunnyMock.drawnSamples).toEqual(
			mediabunnyMock.drawnSamples.map(() => ({ fit: "fill" })),
		);
		expect(mediabunnyMock.sampleCloses).toBe(
			mediabunnyMock.decodedTimestampsUs.length,
		);
	});

	it("reseeds the sample iterator only for a GOP jump", async () => {
		const onFrame = vi.fn();
		const provider = createProvider(onFrame);

		provider.requestFrame(5_000_000, { priority: "final" });
		await waitForCondition(() => onFrame.mock.calls.length === 1);
		provider.requestFrame(7_000_000, { priority: "final" });
		await waitForCondition(() => onFrame.mock.calls.length === 2);
		expect(mediabunnyMock.sampleIteratorStarts).toEqual([0]);

		provider.requestFrame(45_000_000, { priority: "final" });
		await waitForCondition(() => onFrame.mock.calls.length === 3);

		expect(mediabunnyMock.sampleIteratorStarts).toEqual([0, 40]);
		expect(mediabunnyMock.sampleIteratorReturns).toBe(1);
		expect(onFrame.mock.calls[2]?.[0].actualTimestampUs).toBe(45_000_000);
		provider.dispose();
	});

	it("reports an undecodable primary video track", async () => {
		mediabunnyMock.canDecode = false;
		const onUnavailable = vi.fn();
		const provider = createMediabunnyScrubFrameProvider({
			frameDurationUs: 1_000_000,
			onFrame: vi.fn(),
			onUnavailable,
			source: new Blob(["video"]),
		});

		provider.requestFrame(1_000_000);
		await waitForCondition(() => onUnavailable.mock.calls.length === 1);

		expect(onUnavailable).toHaveBeenCalledWith(
			"This browser cannot decode the primary video track for scrubbing.",
		);
		provider.dispose();
	});

	it("falls back to the native preview when the video track is unavailable", async () => {
		mediabunnyMock.primaryVideoTrack = null;
		const onUnavailable = vi.fn();
		const provider = createMediabunnyScrubFrameProvider({
			frameDurationUs: 1_000_000,
			onFrame: vi.fn(),
			onUnavailable,
			source: new Blob(["video"]),
		});

		provider.requestFrame(1_000_000);
		await waitForCondition(() => onUnavailable.mock.calls.length === 1);

		expect(onUnavailable).toHaveBeenCalledWith(
			"The active media asset has no video track to scrub.",
		);
		provider.dispose();
	});

	it("bounds sharp scrub frames at preview resolution while preserving aspect ratio", () => {
		expect(
			resolveScrubFrameDimensions({
				displayHeight: 2160,
				displayWidth: 3840,
			}),
		).toEqual({ height: 720, width: 1280 });
		expect(
			resolveScrubFrameDimensions({
				displayHeight: 1920,
				displayWidth: 1080,
			}),
		).toEqual({ height: 1280, width: 720 });
	});
});

function createProvider(onFrame: ReturnType<typeof vi.fn>) {
	return createMediabunnyScrubFrameProvider({
		displayHeight: 2160,
		displayWidth: 3840,
		frameDurationUs: 1_000_000,
		onFrame,
		source: new Blob(["video"]),
	});
}

async function waitForCondition(condition: () => boolean) {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (condition()) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	throw new Error("Timed out waiting for scrub provider state.");
}

async function flushMicrotasks() {
	for (let attempt = 0; attempt < 50; attempt += 1) {
		await Promise.resolve();
	}
}

async function flushMicrotasksUntil(condition: () => boolean) {
	for (let attempt = 0; attempt < 500; attempt += 1) {
		if (condition()) {
			return;
		}
		await Promise.resolve();
	}
	throw new Error("Timed out waiting for scrub provider state.");
}
