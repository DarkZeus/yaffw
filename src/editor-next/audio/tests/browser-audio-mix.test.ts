import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AudioMix } from "@/editor-core/model";

const mediabunnyMock = vi.hoisted(() => ({
	inputInstances: [] as Array<{ dispose: ReturnType<typeof vi.fn> }>,
	tracks: [] as MockAudioTrack[],
}));

vi.mock("mediabunny", () => {
	class Input {
		dispose = vi.fn();

		constructor() {
			mediabunnyMock.inputInstances.push(this);
		}

		async getAudioTracks() {
			return mediabunnyMock.tracks;
		}
	}

	class AudioSampleSink {
		constructor(private readonly track: MockAudioTrack) {}

		async *samples() {
			if (this.track.sample) yield this.track.sample;
		}
	}

	class EncodedPacketSink {
		constructor(private readonly track: MockAudioTrack) {}
		async *packets() {
			yield* this.track.packets;
		}
	}

	return {
		ALL_FORMATS: [],
		AudioSampleSink,
		BlobSource: class BlobSource {},
		EncodedPacketSink,
		Input,
	};
});

import { renderBrowserAudioMix } from "../engine/browser-audio-mix";

beforeEach(() => {
	mediabunnyMock.inputInstances = [];
	mediabunnyMock.tracks = [];
	vi.stubGlobal("AudioBuffer", FakeAudioBuffer);
	vi.stubGlobal("OfflineAudioContext", FakeOfflineAudioContext);
});

describe("renderBrowserAudioMix", () => {
	it.each([2])(
		"retains %s included silent tracks in the generated mix",
		async (count) => {
			const tracks = Array.from({ length: count }, (_, index) =>
				createAudioTrack(`audio-${index}`, {
					numberOfChannels: index + 1,
					sampleRate: index === 0 ? 44_100 : 48_000,
				}),
			);
			for (const track of tracks) {
				track.sample = null;
				track.packets = [{ timestamp: 2, duration: 1 }];
			}
			mediabunnyMock.tracks = tracks;
			const audioMix = createIncludedAudioMix(tracks.map((track) => track.id));
			for (const decision of Object.values(audioMix.tracks))
				decision.channelMode = "average-to-mono";
			const result = await renderBrowserAudioMix({
				audioMix,
				selection: { startUs: 0, endUs: 1_000_000 },
				signal: new AbortController().signal,
				source: new Blob(["media"]),
			});
			expect(result?.length).toBe(44_100);
			expect(result?.numberOfChannels).toBe(2);
			expect(result?.getChannelData(0).every((sample) => sample === 0)).toBe(
				true,
			);
			expect(mediabunnyMock.inputInstances[0]?.dispose).toHaveBeenCalledOnce();
		},
	);
});

type MockAudioTrack = {
	getNumberOfChannels: ReturnType<typeof vi.fn>;
	getSampleRate: ReturnType<typeof vi.fn>;
	id: string;
	getCodec: () => Promise<string>;
	getPreRollDuration: () => Promise<number>;
	sample: ReturnType<typeof createDecodedSample> | null;
	packets: Array<{ timestamp: number; duration: number }>;
};

function createAudioTrack(
	id: string,
	{
		numberOfChannels,
		sampleRate,
	}: { numberOfChannels: number; sampleRate: number },
): MockAudioTrack {
	return {
		packets: [],
		getNumberOfChannels: vi.fn(async () => numberOfChannels),
		getSampleRate: vi.fn(async () => sampleRate),
		id,
		getCodec: async () => "aac",
		getPreRollDuration: async () => 0,
		sample: createDecodedSample({ numberOfChannels, sampleRate }),
	};
}

function createDecodedSample({
	numberOfChannels,
	sampleRate,
}: {
	numberOfChannels: number;
	sampleRate: number;
}) {
	return {
		close: vi.fn(),
		copyTo: vi.fn(),
		numberOfChannels,
		numberOfFrames: sampleRate,
		sampleRate,
		timestamp: 0,
	};
}

function createIncludedAudioMix(trackIds: string[]): AudioMix {
	return {
		finalPeakGuardDb: -1,
		outputChannels: 2,
		tracks: Object.fromEntries(
			trackIds.map((trackId) => [
				trackId,
				{
					channelMode: "preserve" as const,
					include: true,
					trackId,
					volumePercent: 100,
				},
			]),
		),
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

	copyFromChannel(
		destination: Float32Array,
		channelNumber: number,
		startInChannel = 0,
	) {
		destination.set(
			this.channels[channelNumber]?.subarray(
				startInChannel,
				startInChannel + destination.length,
			),
		);
	}

	copyToChannel(
		source: Float32Array,
		channelNumber: number,
		startInChannel = 0,
	) {
		this.channels[channelNumber]?.set(source, startInChannel);
	}

	getChannelData(channel: number) {
		return this.channels[channel] ?? new Float32Array();
	}
}

class FakeOfflineAudioContext {
	readonly destination = {};
	private readonly rendered: FakeAudioBuffer;

	constructor(numberOfChannels: number, length: number, sampleRate: number) {
		this.rendered = new FakeAudioBuffer({
			length,
			numberOfChannels,
			sampleRate,
		});
	}

	createBufferSource() {
		return {
			buffer: null,
			connect: vi.fn(),
			start: vi.fn(),
		};
	}

	async startRendering() {
		return this.rendered;
	}
}
