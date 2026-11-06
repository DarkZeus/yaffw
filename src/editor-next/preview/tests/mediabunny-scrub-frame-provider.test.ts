import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mediabunnyMock = vi.hoisted(() => ({
	beforeKeyPacket: null as ((timestamp: number) => Promise<void>) | null,
	beforePacket: null as ((timestamp: number) => Promise<void>) | null,
	beforeSample: null as ((timestamp: number) => Promise<void>) | null,
	canDecode: true,
	backgroundKeyReads: 0,
	decodedTimestampsUs: [] as number[],
	drawnSamples: [] as Array<{ fit: string }>,
	inputDisposals: [] as Array<ReturnType<typeof vi.fn>>,
	keyPacketInterval: 10,
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
				mediabunnyMock.backgroundKeyReads++;
				return new MockPacket(0, 0);
			}

			async getNextKeyPacket(packet: MockPacket) {
				mediabunnyMock.backgroundKeyReads++;
				return packet.sequenceNumber < 50
					? new MockPacket(packet.timestamp + 10, packet.sequenceNumber + 10)
					: null;
			}

			async getKeyPacket(timestamp: number) {
				await mediabunnyMock.beforeKeyPacket?.(timestamp);
				const interval = mediabunnyMock.keyPacketInterval;
				const sequenceNumber = Math.floor(timestamp / interval) * interval;
				return new MockPacket(sequenceNumber, sequenceNumber);
			}

			async getPacket(timestamp: number) {
				await mediabunnyMock.beforePacket?.(timestamp);
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
						await mediabunnyMock.beforeSample?.(timestamp);
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

import { createMediabunnyScrubFrameProvider } from "../scrub/mediabunny-scrub-frame-provider";

beforeEach(() => {
	mediabunnyMock.beforeKeyPacket = null;
	mediabunnyMock.beforePacket = null;
	mediabunnyMock.beforeSample = null;
	mediabunnyMock.canDecode = true;
	mediabunnyMock.backgroundKeyReads = 0;
	mediabunnyMock.decodedTimestampsUs = [];
	mediabunnyMock.drawnSamples = [];
	mediabunnyMock.inputDisposals = [];
	mediabunnyMock.keyPacketInterval = 10;
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

	it.each(["packet", "key packet", "sample"] as const)(
		"discards an obsolete request waiting for a %s",
		async (stage) => {
			const pending = pauseFirstScrubOperation(stage);
			const onFrame = vi.fn();
			const provider = createProvider(onFrame);

			provider.requestFrame(8_000_000);
			await waitForCondition(() => pending.entered());
			provider.requestFrame(45_000_000);
			pending.resume();
			await waitForCondition(() => onFrame.mock.calls.length === 1);
			await flushMicrotasks();

			expect(
				onFrame.mock.calls.map(([frame]) => frame.actualTimestampUs),
			).toEqual([45_000_000]);
			expect(onFrame.mock.calls[0]?.[0].requestId).toBe(2);
			provider.dispose();
			await waitForCondition(
				() =>
					mediabunnyMock.sampleIteratorReturns ===
					mediabunnyMock.sampleIteratorStarts.length,
			);
			expect(mediabunnyMock.sampleCloses).toBe(
				mediabunnyMock.decodedTimestampsUs.length,
			);
		},
	);

	it.each(["sample"] as const)(
		"cleans up without presenting after disposal during a pending %s",
		async (stage) => {
			const pending = pauseFirstScrubOperation(stage);
			const onFrame = vi.fn();
			const onUnavailable = vi.fn();
			const provider = createMediabunnyScrubFrameProvider({
				frameDurationUs: 1_000_000,
				onFrame,
				onUnavailable,
				source: new Blob(["video"]),
			});

			provider.requestFrame(8_000_000);
			await waitForCondition(() => pending.entered());
			provider.dispose();
			provider.dispose();
			provider.requestFrame(45_000_000);
			provider.warm();
			pending.resume();
			await flushMicrotasks();

			expect(onFrame).not.toHaveBeenCalled();
			expect(onUnavailable).not.toHaveBeenCalled();
			expect(mediabunnyMock.inputDisposals).toHaveLength(1);
			expect(mediabunnyMock.inputDisposals[0]).toHaveBeenCalled();
			expect(mediabunnyMock.sampleIteratorReturns).toBe(
				mediabunnyMock.sampleIteratorStarts.length,
			);
			expect(mediabunnyMock.sampleCloses).toBe(
				mediabunnyMock.decodedTimestampsUs.length,
			);
			if (stage === "sample") {
				expect(mediabunnyMock.sampleCloses).toBeGreaterThan(0);
				expect(mediabunnyMock.sampleIteratorReturns).toBe(1);
			}
		},
	);

	it("reuses forward decoding and reseeds an uncached reversal within one GOP", async () => {
		mediabunnyMock.keyPacketInterval = 100;
		const onFrame = vi.fn();
		const provider = createProvider(onFrame);

		provider.requestFrame(5_000_000);
		await waitForCondition(() => onFrame.mock.calls.length === 1);
		await flushMicrotasks();
		provider.requestFrame(40_000_000);
		await waitForCondition(() => onFrame.mock.calls.length === 2);
		await flushMicrotasks();
		expect(mediabunnyMock.sampleIteratorStarts).toEqual([0]);

		provider.requestFrame(1_000_000);
		await waitForCondition(() => onFrame.mock.calls.length === 3);
		expect(mediabunnyMock.sampleIteratorStarts).toEqual([0, 0]);
		expect(mediabunnyMock.sampleIteratorReturns).toBe(1);
		expect(
			onFrame.mock.calls.map(([frame]) => frame.actualTimestampUs),
		).toEqual([5_000_000, 40_000_000, 1_000_000]);
		provider.dispose();
	});
});

function pauseFirstScrubOperation(stage: "packet" | "key packet" | "sample") {
	let entered = false;
	let resume: () => void = () => undefined;
	const gate = new Promise<void>((resolve) => {
		resume = resolve;
	});
	const pause = async () => {
		if (!entered) {
			entered = true;
			await gate;
		}
	};
	if (stage === "packet") {
		mediabunnyMock.beforePacket = pause;
	} else if (stage === "key packet") {
		mediabunnyMock.beforeKeyPacket = pause;
	} else {
		mediabunnyMock.beforeSample = pause;
	}
	return { entered: () => entered, resume: () => resume() };
}

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
	await vi.waitFor(() => expect(condition()).toBe(true), {
		interval: 5,
		timeout: 1_000,
	});
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
