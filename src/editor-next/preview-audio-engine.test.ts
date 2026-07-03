import { describe, expect, it, vi } from "vitest";

import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import type { ReadyMediaAsset } from "@/editor-core/model";

import type { BrowserAudioPreviewSource } from "./browser-audio-preview-sources.types";
import {
	createPreviewAudioEngine,
	previewOutputGainForAudioMonitoring,
	previewTrackMonitorGainForAudioTrackSource,
	previewTrackVolumeGainForAudioTrackSource,
} from "./preview-audio-engine";

describe("createPreviewAudioEngine", () => {
	it("decodes every prepared audio resource before first playback and schedules all tracks", async () => {
		const context = createAudioContextSpy();
		const engine = await createPreviewAudioEngine({
			createAudioContext: () => context,
			sources: [
				createAudioPreviewSource("audio-1", 0),
				createAudioPreviewSource("audio-2", 1.25),
			],
		});

		expect(context.decodeAudioData).toHaveBeenCalledTimes(2);

		engine.setTrackVolumeGain(0, 0.5);
		engine.setTrackMonitorGain(0, 1);
		engine.setTrackVolumeGain(1, 0.25);
		engine.setTrackMonitorGain(1, 1);
		engine.setOutputGain(0.6);
		engine.setPlaybackRate(1.5);
		engine.setTime(0.5);
		await engine.play();

		expect(context.resume).toHaveBeenCalledTimes(1);
		expect(context.createdSources).toHaveLength(2);
		expect(context.createdSources[0]?.playbackRate.value).toBe(1.5);
		expect(context.createdSources[0]?.start).toHaveBeenCalledWith(0, 0.5);
		expect(context.createdSources[1]?.start).toHaveBeenCalledWith(0.5, 0);
		expect(context.createdGains[0]?.gain.value).toBe(0.6);
		expect(context.createdGains[1]?.gain.value).toBe(0.5);
		expect(context.createdGains[2]?.gain.value).toBe(0.25);

		context.currentTime = 2;
		expect(engine.getCurrentTime()).toBe(3.5);

		engine.setPlaybackRate(2);
		expect(engine.getCurrentTime()).toBe(3.5);
		context.currentTime = 3;
		expect(engine.getCurrentTime()).toBe(5.5);

		engine.destroy();

		expect(context.createdSources[0]?.stop).toHaveBeenCalledTimes(1);
		expect(context.createdSources[1]?.stop).toHaveBeenCalledTimes(1);
		expect(context.close).toHaveBeenCalledTimes(1);
	});

	it("routes channel handling through the graph without decoding another preview resource", async () => {
		const context = createAudioContextSpy();
		const engine = await createPreviewAudioEngine({
			createAudioContext: () => context,
			sources: [createAudioPreviewSource("audio-1", 0)],
		});

		expect(context.decodeAudioData).toHaveBeenCalledTimes(1);

		engine.setTrackChannelMode(0, "use-left-as-mono");
		await engine.play();

		expect(context.decodeAudioData).toHaveBeenCalledTimes(1);
		expect(context.createdSplitters).toHaveLength(1);
		expect(context.createdSources[0]?.connect).toHaveBeenCalledWith(
			context.createdSplitters[0],
		);
		expect(context.createdSplitters[0]?.connect).toHaveBeenCalledWith(
			context.createdGains[1],
			0,
			0,
		);

		engine.setTrackChannelMode(0, "duplicate-right-to-stereo");

		expect(context.decodeAudioData).toHaveBeenCalledTimes(1);
		expect(context.createdSources[0]?.stop).toHaveBeenCalledTimes(1);
		expect(context.createdSplitters).toHaveLength(2);
		expect(context.createdMergers).toHaveLength(1);
		expect(context.createdSplitters[1]?.connect).toHaveBeenCalledWith(
			context.createdMergers[0],
			1,
			0,
		);
		expect(context.createdSplitters[1]?.connect).toHaveBeenCalledWith(
			context.createdMergers[0],
			1,
			1,
		);
		expect(context.createdMergers[0]?.connect).toHaveBeenCalledWith(
			context.createdGains[1],
		);
	});

	it("reads meter taps after channel handling and Track volume but before output gain", async () => {
		const context = createAudioContextSpy({
			audioBuffers: [
				createAudioBufferStub({
					channels: [[[4_800, 1]], [[4_800, 0.25]]],
				}),
				createAudioBufferStub({
					channels: [[[4_800, 0.5]], [[4_800, 0.25]]],
				}),
			],
		});
		const engine = await createPreviewAudioEngine({
			createAudioContext: () => context,
			sources: [
				createAudioPreviewSource("audio-1", 0),
				createAudioPreviewSource("audio-2", 0),
			],
		});

		engine.setTime(0.1);
		engine.setTrackChannelMode(0, "use-left-as-mono");
		engine.setTrackVolumeGain(0, 0.25);
		engine.setTrackMonitorGain(0, 1);
		engine.setTrackVolumeGain(1, 0.5);
		engine.setTrackMonitorGain(1, 1);
		engine.setOutputGain(0);
		await engine.play();

		const snapshot = engine.readMeterSnapshot({ outputChannels: 2 });
		const voiceState = snapshot.trackStates["audio-1"];
		const desktopState = snapshot.trackStates["audio-2"];

		expect(voiceState?.status).toBe("ready");
		expect(desktopState?.status).toBe("ready");
		if (voiceState?.status !== "ready" || desktopState?.status !== "ready") {
			throw new Error("Expected ready engine meter taps.");
		}
		expect(voiceState.channels.map((channel) => channel.peak)).toEqual([
			0.25, 0.25,
		]);
		expect(desktopState.channels.map((channel) => channel.peak)).toEqual([
			0.25, 0.125,
		]);
		expect(snapshot.combinedState.status).toBe("ready");
		if (snapshot.combinedState.status !== "ready") {
			throw new Error("Expected ready combined engine meter tap.");
		}
		expect(
			snapshot.combinedState.channels.map((channel) => channel.peak),
		).toEqual([0.5, 0.375]);
	});

	it("resolves Track volume, monitored-mix, and output gains independently", () => {
		const source = createAudioPreviewSource("audio-1", 1.25);
		const audioMix = createDefaultAudioMix(readyAssetWithAudio);
		const audioDecision = audioMix.tracks["audio-1"];

		if (!audioDecision) {
			throw new Error("Expected audio-1 default mix decision.");
		}

		audioDecision.volumePercent = 50;

		expect(
			previewTrackVolumeGainForAudioTrackSource({
				audioMix,
				source,
			}),
		).toBeCloseTo(0.25);
		expect(
			previewTrackMonitorGainForAudioTrackSource({
				audioMix,
				soloedAudioTrackId: null,
				source,
			}),
		).toBe(1);

		expect(
			previewOutputGainForAudioMonitoring({
				muted: false,
				volume: 0.8,
			}),
		).toBeCloseTo(0.8);
		expect(
			previewOutputGainForAudioMonitoring({
				muted: true,
				volume: 0.8,
			}),
		).toBe(0);

		audioDecision.include = false;

		expect(
			previewTrackVolumeGainForAudioTrackSource({
				audioMix,
				source,
			}),
		).toBeCloseTo(0.25);
		expect(
			previewTrackMonitorGainForAudioTrackSource({
				audioMix,
				soloedAudioTrackId: null,
				source,
			}),
		).toBe(0);

		expect(
			previewTrackMonitorGainForAudioTrackSource({
				audioMix,
				soloedAudioTrackId: "audio-1",
				source,
			}),
		).toBe(1);
		expect(
			previewTrackMonitorGainForAudioTrackSource({
				audioMix,
				soloedAudioTrackId: "audio-1",
				source: createAudioPreviewSource("audio-2", 1.25),
			}),
		).toBe(0);
	});
});

function createAudioPreviewSource(
	trackId: string,
	startPositionSeconds: number,
): BrowserAudioPreviewSource {
	return {
		blob: new Blob([trackId], { type: "audio/wav" }),
		byteLength: trackId.length,
		downloadName: `${trackId}.wav`,
		mimeType: "audio/wav",
		startPositionSeconds,
		strategy: "decoded-wav-fallback",
		track: {
			id: trackId,
			kind: "audio",
		},
		trackId,
		trackIndex: 0,
		url: `blob:${trackId}`,
	};
}

function createAudioContextSpy({
	audioBuffers = [createAudioBufferStub()],
}: {
	audioBuffers?: AudioBuffer[];
} = {}) {
	const destination = createAudioNodeSpy();
	const context = {
		close: vi.fn(),
		createBufferSource: vi.fn(() => {
			const source = {
				...createAudioNodeSpy(),
				buffer: null,
				playbackRate: { value: 1 },
				start: vi.fn(),
				stop: vi.fn(),
			};
			context.createdSources.push(source);

			return source;
		}),
		createChannelMerger: vi.fn(() => {
			const merger = createAudioNodeSpy();
			context.createdMergers.push(merger);

			return merger;
		}),
		createChannelSplitter: vi.fn(() => {
			const splitter = createAudioNodeSpy();
			context.createdSplitters.push(splitter);

			return splitter;
		}),
		createGain: vi.fn(() => {
			const gain = {
				...createAudioNodeSpy(),
				gain: { value: 1 },
			};
			context.createdGains.push(gain);

			return gain;
		}),
		createdGains: [] as Array<
			ReturnType<typeof createAudioNodeSpy> & { gain: { value: number } }
		>,
		createdMergers: [] as Array<ReturnType<typeof createAudioNodeSpy>>,
		createdSplitters: [] as Array<ReturnType<typeof createAudioNodeSpy>>,
		createdSources: [] as Array<
			ReturnType<typeof createAudioNodeSpy> & {
				buffer: AudioBuffer | null;
				playbackRate: { value: number };
				start: ReturnType<typeof vi.fn>;
				stop: ReturnType<typeof vi.fn>;
			}
		>,
		currentTime: 0,
		decodeAudioData: vi.fn(
			async () => audioBuffers.shift() ?? createAudioBufferStub(),
		),
		destination,
		resume: vi.fn(),
	};

	return context;
}

function createAudioNodeSpy() {
	return {
		connect: vi.fn(),
		disconnect: vi.fn(),
	};
}

function createAudioBufferStub({
	channels = [[], []],
}: {
	channels?: Array<Array<[number, number]>>;
} = {}): AudioBuffer {
	const length = 480_000;
	const channelData = channels.map((peaks) => {
		const data = new Float32Array(length);

		for (const [frameIndex, value] of peaks) {
			data[frameIndex] = value;
		}

		return data;
	});

	return {
		copyFromChannel(destination, channelNumber, startInChannel = 0) {
			destination.set(
				channelData[channelNumber]?.subarray(
					startInChannel,
					startInChannel + destination.length,
				) ?? new Float32Array(destination.length),
			);
		},
		copyToChannel(source, channelNumber, startInChannel = 0) {
			channelData[channelNumber]?.set(source, startInChannel);
		},
		duration: 10,
		getChannelData(channelNumber) {
			const data = channelData[channelNumber];

			if (!data) {
				throw new Error(`Missing channel ${channelNumber}.`);
			}

			return data;
		},
		length,
		numberOfChannels: channelData.length,
		sampleRate: 48_000,
	} as AudioBuffer;
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
		audio: [],
		video: [
			{
				id: "video-1",
				kind: "video",
			},
		],
	},
} satisfies ReadyMediaAsset;

const readyAssetWithAudio = {
	...readyAsset,
	tracks: {
		...readyAsset.tracks,
		audio: [
			{
				codec: "aac",
				id: "audio-1",
				kind: "audio",
				label: "Voice",
			},
		],
	},
} satisfies ReadyMediaAsset;
