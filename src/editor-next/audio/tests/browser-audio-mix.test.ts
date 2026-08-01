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
		async *samples() {}
	}

	return {
		ALL_FORMATS: [],
		AudioSampleSink,
		BlobSource: class BlobSource {},
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
	it("resolves each included audio track format once before mixing", async () => {
		const firstTrack = createAudioTrack("audio-1", {
			numberOfChannels: 2,
			sampleRate: 44_100,
		});
		const secondTrack = createAudioTrack("audio-2", {
			numberOfChannels: 1,
			sampleRate: 48_000,
		});
		mediabunnyMock.tracks = [firstTrack, secondTrack];

		const result = await renderBrowserAudioMix({
			audioMix: createIncludedAudioMix(["audio-1", "audio-2"]),
			selection: { endUs: 1_000_000, startUs: 0 },
			signal: new AbortController().signal,
			source: new Blob(["media"], { type: "video/mp4" }),
		});

		expect(result?.includedTrackCount).toBe(2);
		expect(result?.audioBuffer.sampleRate).toBe(44_100);
		expect(firstTrack.getNumberOfChannels).toHaveBeenCalledOnce();
		expect(firstTrack.getSampleRate).toHaveBeenCalledOnce();
		expect(secondTrack.getNumberOfChannels).toHaveBeenCalledOnce();
		expect(secondTrack.getSampleRate).toHaveBeenCalledOnce();
		expect(mediabunnyMock.inputInstances[0]?.dispose).toHaveBeenCalledOnce();
	});

	it("rejects and disposes when an included audio track format cannot be read", async () => {
		const failure = new Error("Audio sample rate is malformed.");
		const track = createAudioTrack("audio-1", {
			numberOfChannels: 2,
			sampleRate: 48_000,
		});
		track.getSampleRate.mockRejectedValueOnce(failure);
		mediabunnyMock.tracks = [track];

		await expect(
			renderBrowserAudioMix({
				audioMix: createIncludedAudioMix(["audio-1"]),
				selection: { endUs: 1_000_000, startUs: 0 },
				signal: new AbortController().signal,
				source: new Blob(["media"], { type: "video/mp4" }),
			}),
		).rejects.toBe(failure);
		expect(mediabunnyMock.inputInstances[0]?.dispose).toHaveBeenCalledOnce();
	});
});

type MockAudioTrack = {
	getNumberOfChannels: ReturnType<typeof vi.fn>;
	getSampleRate: ReturnType<typeof vi.fn>;
	id: string;
};

function createAudioTrack(
	id: string,
	{
		numberOfChannels,
		sampleRate,
	}: { numberOfChannels: number; sampleRate: number },
): MockAudioTrack {
	return {
		getNumberOfChannels: vi.fn(async () => numberOfChannels),
		getSampleRate: vi.fn(async () => sampleRate),
		id,
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
