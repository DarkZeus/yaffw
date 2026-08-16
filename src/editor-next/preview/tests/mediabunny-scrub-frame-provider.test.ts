import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mediabunnyMock = vi.hoisted(() => ({
	decodedTimestampsUs: [] as number[],
	decoderCloses: [] as Array<ReturnType<typeof vi.fn>>,
	decoderResets: [] as Array<ReturnType<typeof vi.fn>>,
	inputDisposals: [] as Array<ReturnType<typeof vi.fn>>,
	packetIteratorStarts: [] as number[],
	primaryVideoTrack: {} as object | null,
}));

vi.mock("mediabunny", () => {
	class MockPacket {
		microsecondTimestamp: number;
		type: "delta" | "key";

		constructor(
			public timestamp: number,
			public sequenceNumber: number,
			type?: "delta" | "key",
		) {
			this.microsecondTimestamp = Math.round(timestamp * 1_000_000);
			this.type = type ?? (sequenceNumber % 10 === 0 ? "key" : "delta");
		}

		toEncodedVideoChunk() {
			return {
				duration: 1_000_000,
				timestamp: this.microsecondTimestamp,
				type: this.type,
			};
		}
	}

	return {
		ALL_FORMATS: [],
		BlobSource: class BlobSource {
			constructor(public blob: Blob) {}
		},
		EncodedPacketSink: class EncodedPacketSink {
			async getFirstKeyPacket() {
				return new MockPacket(0, 0, "key");
			}

			async getNextKeyPacket(packet: MockPacket) {
				return packet.sequenceNumber < 20
					? new MockPacket(
							packet.timestamp + 10,
							packet.sequenceNumber + 10,
							"key",
						)
					: null;
			}

			async getKeyPacket(timestamp: number) {
				const sequenceNumber = Math.floor(timestamp / 10) * 10;
				return new MockPacket(sequenceNumber, sequenceNumber, "key");
			}

			async getPacket(timestamp: number) {
				const sequenceNumber = Math.max(0, Math.floor(timestamp));
				return new MockPacket(sequenceNumber, sequenceNumber);
			}

			async *packets(startPacket: MockPacket) {
				mediabunnyMock.packetIteratorStarts.push(startPacket.timestamp);
				for (
					let sequenceNumber = startPacket.sequenceNumber;
					sequenceNumber <= 60;
					sequenceNumber += 1
				) {
					yield new MockPacket(sequenceNumber, sequenceNumber);
				}
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
					getDecoderConfig: async () => ({
						codec: "avc1.640034",
						codedHeight: 2160,
						codedWidth: 3840,
					}),
					getRotation: async () => 0,
				};
			}
		},
	};
});

class MockOffscreenCanvas {
	readonly context = {
		clearRect: vi.fn(),
		drawImage: vi.fn(),
		restore: vi.fn(),
		rotate: vi.fn(),
		save: vi.fn(),
		translate: vi.fn(),
	};

	constructor(
		public width: number,
		public height: number,
	) {}

	getContext() {
		return this.context;
	}
}

class MockVideoDecoder extends EventTarget {
	static async isConfigSupported(config: VideoDecoderConfig) {
		return { config, supported: true };
	}

	decodeQueueSize = 0;
	state: CodecState = "unconfigured";
	readonly close = vi.fn(() => {
		this.state = "closed";
	});
	readonly reset = vi.fn(() => {
		this.state = "unconfigured";
	});

	constructor(
		private callbacks: {
			error: (error: DOMException) => void;
			output: (frame: VideoFrame) => void;
		},
	) {
		super();
		mediabunnyMock.decoderCloses.push(this.close);
		mediabunnyMock.decoderResets.push(this.reset);
	}

	configure(_config: VideoDecoderConfig) {
		this.state = "configured";
	}

	decode(chunk: EncodedVideoChunk) {
		mediabunnyMock.decodedTimestampsUs.push(chunk.timestamp);
		queueMicrotask(() => {
			this.callbacks.output({
				close: vi.fn(),
				displayHeight: 2160,
				displayWidth: 3840,
				timestamp: chunk.timestamp,
			} as unknown as VideoFrame);
			this.dispatchEvent(new Event("dequeue"));
		});
	}

	async flush() {
		await Promise.resolve();
	}
}

import {
	createMediabunnyScrubFrameProvider,
	resolveScrubFrameDimensions,
} from "../scrub/mediabunny-scrub-frame-provider";

beforeEach(() => {
	mediabunnyMock.decodedTimestampsUs = [];
	mediabunnyMock.decoderCloses = [];
	mediabunnyMock.decoderResets = [];
	mediabunnyMock.inputDisposals = [];
	mediabunnyMock.packetIteratorStarts = [];
	mediabunnyMock.primaryVideoTrack = {};
	vi.stubGlobal("OffscreenCanvas", MockOffscreenCanvas);
	vi.stubGlobal("VideoDecoder", MockVideoDecoder);
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("Mediabunny scrub frame provider", () => {
	it("warms the packet index and decoder without presenting a frame", async () => {
		const onFrame = vi.fn();
		const provider = createProvider(onFrame);

		provider.warm();
		await waitForCondition(() => mediabunnyMock.decoderCloses.length === 1);

		expect(mediabunnyMock.decodedTimestampsUs).toEqual([]);
		expect(onFrame).not.toHaveBeenCalled();
		provider.dispose();
	});

	it("shows a preview-resolution keyframe during interaction and resolves the exact frame after settling", async () => {
		const onFrame = vi.fn();
		const provider = createProvider(onFrame);
		provider.warm();
		await waitForCondition(() => mediabunnyMock.decoderCloses.length === 1);
		vi.useFakeTimers();

		provider.requestFrame(8_000_000, { priority: "interactive" });
		await flushMicrotasksUntil(() => onFrame.mock.calls.length === 1);

		expect(onFrame).toHaveBeenLastCalledWith(
			expect.objectContaining({
				accuracy: "keyframe",
				actualTimestampUs: 0,
				requestId: 1,
				timestampUs: 8_000_000,
			}),
		);
		expect(onFrame.mock.calls[0]?.[0].canvas).toMatchObject({
			height: 720,
			width: 1280,
		});

		vi.advanceTimersByTime(119);
		await flushMicrotasks();
		expect(onFrame).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(1);
		await flushMicrotasksUntil(() =>
			onFrame.mock.calls.some(([frame]) => frame.accuracy === "exact"),
		);
		expect(onFrame).toHaveBeenLastCalledWith(
			expect.objectContaining({
				accuracy: "exact",
				actualTimestampUs: 8_000_000,
				timestampUs: 8_000_000,
			}),
		);

		provider.dispose();
	});

	it("starts exact resolution immediately for a committed target", async () => {
		const onFrame = vi.fn();
		const provider = createProvider(onFrame);

		provider.requestFrame(8_000_000, { priority: "final" });
		await waitForCondition(() =>
			onFrame.mock.calls.some(([frame]) => frame.accuracy === "exact"),
		);

		expect(onFrame.mock.calls.map(([frame]) => frame.accuracy)).toEqual([
			"keyframe",
			"exact",
		]);
		provider.dispose();
	});

	it("reuses a decoded keyframe for repeated targets in the same GOP", async () => {
		const onFrame = vi.fn();
		const provider = createProvider(onFrame);
		provider.warm();
		await waitForCondition(() => mediabunnyMock.decoderCloses.length === 1);
		vi.useFakeTimers();

		provider.requestFrame(8_000_000, { priority: "interactive" });
		await flushMicrotasksUntil(() => onFrame.mock.calls.length === 1);
		provider.requestFrame(9_000_000, { priority: "interactive" });
		await flushMicrotasksUntil(() => onFrame.mock.calls.length === 2);

		expect(
			mediabunnyMock.decodedTimestampsUs.filter((value) => value === 0),
		).toHaveLength(1);
		expect(onFrame.mock.calls[1]?.[0]).toMatchObject({
			accuracy: "keyframe",
			actualTimestampUs: 0,
			requestId: 2,
			timestampUs: 9_000_000,
		});
		provider.dispose();
	});

	it("shows a cached exact frame without replacing it with its keyframe", async () => {
		const onFrame = vi.fn();
		const provider = createProvider(onFrame);

		provider.requestFrame(8_000_000, { priority: "final" });
		await waitForCondition(() =>
			onFrame.mock.calls.some(([frame]) => frame.accuracy === "exact"),
		);
		onFrame.mockClear();

		provider.requestFrame(8_000_000, { priority: "interactive" });
		await waitForCondition(() => onFrame.mock.calls.length === 1);

		expect(onFrame).toHaveBeenCalledWith(
			expect.objectContaining({
				accuracy: "exact",
				actualTimestampUs: 8_000_000,
				requestId: 2,
			}),
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
