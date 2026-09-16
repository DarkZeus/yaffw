import { beforeEach, describe, expect, it, vi } from "vitest";

const mediabunnyMock = vi.hoisted(() => ({
	packets: [] as Array<{ duration: number; timestamp: number }>,
	samples: [] as MockAudioSample[],
	samplesArguments: [] as Array<[number | undefined, number | undefined]>,
}));

vi.mock("mediabunny", () => ({
	AudioSampleSink: class AudioSampleSink {
		async *samples(startSeconds?: number, endSeconds?: number) {
			mediabunnyMock.samplesArguments.push([startSeconds, endSeconds]);

			for (const sample of mediabunnyMock.samples) {
				yield sample;
			}
		}
	},
	EncodedPacketSink: class EncodedPacketSink {
		async *packets() {
			for (const packet of mediabunnyMock.packets) {
				yield packet;
			}
		}
	},
}));

import { decodeMediabunnyAudioTrackRange } from "../adapters/mediabunny-audio-buffer";

beforeEach(() => {
	mediabunnyMock.samples = [];
	mediabunnyMock.packets = [];
	mediabunnyMock.samplesArguments = [];
	vi.stubGlobal("AudioBuffer", FakeAudioBuffer);
});

describe("decodeMediabunnyAudioTrackRange", () => {
	it("preserves media-time gaps and clips decoded samples to the requested range", async () => {
		const leadingOverlap = createAudioSample({
			channels: [
				[9, 9, 1, 2],
				[8, 8, 3, 4],
			],
			sampleRate: 10,
			timestamp: 0.8,
		});
		const afterGap = createAudioSample({
			channels: [
				[5, 6],
				[7, 8],
			],
			sampleRate: 10,
			timestamp: 1.4,
		});
		const clippedEnd = createAudioSample({
			channels: [
				[10, 11, 12],
				[20, 21, 22],
			],
			sampleRate: 10,
			timestamp: 1.9,
		});
		mediabunnyMock.samples = [leadingOverlap, afterGap, clippedEnd];

		const decoded = await decodeMediabunnyAudioTrackRange({
			endSeconds: 2,
			format: { numberOfChannels: 2, sampleRate: 10 },
			signal: new AbortController().signal,
			startSeconds: 1,
			track: {} as never,
		});

		expect(mediabunnyMock.samplesArguments).toEqual([[1, 2]]);
		expect(Array.from(decoded.getChannelData(0))).toEqual([
			1, 2, 0, 0, 5, 6, 0, 0, 0, 10,
		]);
		expect(Array.from(decoded.getChannelData(1))).toEqual([
			3, 4, 0, 0, 7, 8, 0, 0, 0, 20,
		]);
		expect(leadingOverlap.close).toHaveBeenCalledOnce();
		expect(afterGap.close).toHaveBeenCalledOnce();
		expect(clippedEnd.close).toHaveBeenCalledOnce();
	});

	it("restores packet-timeline gaps collapsed by the browser decoder", async () => {
		mediabunnyMock.packets = [
			{ duration: 0.2, timestamp: 0 },
			{ duration: 0.2, timestamp: 0.6 },
		];
		mediabunnyMock.samples = [
			createAudioSample({ channels: [[1, 2]], sampleRate: 10, timestamp: 0 }),
			createAudioSample({ channels: [[3, 4]], sampleRate: 10, timestamp: 0.2 }),
		];

		const decoded = await decodeMediabunnyAudioTrackRange({
			endSeconds: 0.8,
			format: { numberOfChannels: 1, sampleRate: 10 },
			signal: new AbortController().signal,
			startSeconds: 0,
			track: {} as never,
		});

		expect(Array.from(decoded.getChannelData(0))).toEqual([
			1, 2, 0, 0, 0, 0, 3, 4,
		]);
	});

	it("rejects a decoded format change and closes the offending sample", async () => {
		const changedFormat = createAudioSample({
			channels: [[1], [2]],
			sampleRate: 44_100,
			timestamp: 0,
		});
		mediabunnyMock.samples = [changedFormat];

		await expect(
			decodeMediabunnyAudioTrackRange({
				endSeconds: 1,
				format: { numberOfChannels: 2, sampleRate: 48_000 },
				signal: new AbortController().signal,
				startSeconds: 0,
				track: {} as never,
			}),
		).rejects.toThrow("Decoded audio format changed");
		expect(changedFormat.close).toHaveBeenCalledOnce();
	});

	it("closes the current sample and stops publication when cancelled", async () => {
		const controller = new AbortController();
		const sample = createAudioSample({
			channels: [[1], [2]],
			onCopy: () => controller.abort(),
			sampleRate: 48_000,
			timestamp: 0,
		});
		mediabunnyMock.samples = [sample];

		await expect(
			decodeMediabunnyAudioTrackRange({
				endSeconds: 1,
				format: { numberOfChannels: 2, sampleRate: 48_000 },
				signal: controller.signal,
				startSeconds: 0,
				track: {} as never,
			}),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(sample.close).toHaveBeenCalledOnce();
	});
});

type MockAudioSample = {
	close: ReturnType<typeof vi.fn>;
	copyTo: (
		destination: Float32Array,
		options: {
			format: string;
			frameCount: number;
			frameOffset: number;
			planeIndex: number;
		},
	) => void;
	numberOfChannels: number;
	numberOfFrames: number;
	sampleRate: number;
	timestamp: number;
};

function createAudioSample({
	channels,
	onCopy,
	sampleRate,
	timestamp,
}: {
	channels: number[][];
	onCopy?: () => void;
	sampleRate: number;
	timestamp: number;
}): MockAudioSample {
	return {
		close: vi.fn(),
		copyTo(destination, options) {
			const source = channels[options.planeIndex] ?? [];
			destination.set(
				source.slice(
					options.frameOffset,
					options.frameOffset + options.frameCount,
				),
			);
			onCopy?.();
		},
		numberOfChannels: channels.length,
		numberOfFrames: channels[0]?.length ?? 0,
		sampleRate,
		timestamp,
	};
}

class FakeAudioBuffer {
	readonly duration: number;
	readonly length: number;
	readonly numberOfChannels: number;
	readonly sampleRate: number;
	private readonly channels: Float32Array[];

	constructor({
		length,
		numberOfChannels,
		sampleRate,
	}: {
		length: number;
		numberOfChannels: number;
		sampleRate: number;
	}) {
		this.duration = length / sampleRate;
		this.length = length;
		this.numberOfChannels = numberOfChannels;
		this.sampleRate = sampleRate;
		this.channels = Array.from(
			{ length: numberOfChannels },
			() => new Float32Array(length),
		);
	}

	getChannelData(channel: number) {
		return this.channels[channel] ?? new Float32Array();
	}
}
