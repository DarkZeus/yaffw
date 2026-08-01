import { describe, expect, it, vi } from "vitest";

import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import type { ReadyMediaAsset } from "@/editor-core/model";

import {
	createPreviewAudioEngine,
	previewOutputGainForAudioMonitoring,
	previewTrackMonitorGainForAudioTrackResource,
	previewTrackVolumeGainForAudioTrackResource,
} from "../engine/preview-audio-engine";
import type { PreviewAudioEngineMeterSnapshot } from "../engine/preview-audio-engine";
import type { PreviewAudioResource } from "../types/preview-audio-resources.types";

describe("createPreviewAudioEngine", () => {
	it("decodes every prepared audio resource before first playback and schedules all tracks", async () => {
		const context = createAudioContextSpy();
		const engine = await createPreviewAudioEngine({
			createAudioContext: () => context,
			outputChannels: 2,
			resources: [
				createPreviewAudioResource("audio-1", 0),
				createPreviewAudioResource("audio-2", 1.25),
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
		expect(context.createdGains[1]?.gain.value).toBe(1);
		expect(context.createdGains[2]?.gain.value).toBe(0.5);
		expect(context.createdGains[3]?.gain.value).toBe(0.25);

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
			outputChannels: 2,
			resources: [createPreviewAudioResource("audio-1", 0)],
		});

		expect(context.decodeAudioData).toHaveBeenCalledTimes(1);

		engine.setTrackChannelMode(0, "use-left-as-mono");
		await engine.play();

		expect(context.decodeAudioData).toHaveBeenCalledTimes(1);
		expect(context.createdSplitters).toHaveLength(4);
		expect(context.createdSources[0]?.connect).toHaveBeenCalledWith(
			context.createdSplitters[2],
		);
		expect(context.createdSplitters[2]?.connect).toHaveBeenCalledWith(
			context.createdGains[2],
			0,
			0,
		);

		engine.setTrackChannelMode(0, "duplicate-right-to-stereo");

		expect(context.decodeAudioData).toHaveBeenCalledTimes(1);
		expect(context.createdSources[0]?.stop).toHaveBeenCalledTimes(1);
		expect(context.createdSplitters).toHaveLength(6);
		expect(context.createdMergers).toHaveLength(1);
		expect(context.createdSplitters[4]?.connect).toHaveBeenCalledWith(
			context.createdMergers[0],
			1,
			0,
		);
		expect(context.createdSplitters[4]?.connect).toHaveBeenCalledWith(
			context.createdMergers[0],
			1,
			1,
		);
		expect(context.createdMergers[0]?.connect).toHaveBeenCalledWith(
			context.createdGains[2],
		);
	});

	it("reads silent per-channel analyser branches after track decisions and before output gain", async () => {
		const context = createAudioContextSpy({
			audioBuffers: [createAudioBufferStub(), createAudioBufferStub()],
		});
		const engine = await createPreviewAudioEngine({
			createAudioContext: () => context,
			outputChannels: 2,
			resources: [
				createPreviewAudioResource("audio-1", 0),
				createPreviewAudioResource("audio-2", 0),
			],
		});

		engine.setTrackVolumeGain(0, 0.25);
		engine.setTrackMonitorGain(0, 1);
		engine.setTrackVolumeGain(1, 0.5);
		engine.setTrackMonitorGain(1, 1);
		engine.setOutputGain(0);
		await engine.play();
		setAnalyserFrames(context, [
			[0.5, -0.75],
			[0.25, -1.25],
			[0.1, -0.25],
			[0.05, -0.125],
			[0.2, -0.5],
			[0.1, -0.25],
		]);

		const snapshot = engine.readMeterSnapshot();
		const voiceState = snapshot.trackStates["audio-1"];
		const desktopState = snapshot.trackStates["audio-2"];

		expect(voiceState?.status).toBe("ready");
		expect(desktopState?.status).toBe("ready");
		if (voiceState?.status !== "ready" || desktopState?.status !== "ready") {
			throw new Error("Expected ready engine meter taps.");
		}
		expect(voiceState.channels.map((channel) => channel.peak)).toEqual([
			0.25, 0.125,
		]);
		expect(desktopState.channels.map((channel) => channel.peak)).toEqual([
			0.5, 0.25,
		]);
		expect(snapshot.combinedState.status).toBe("ready");
		if (snapshot.combinedState.status !== "ready") {
			throw new Error("Expected ready combined engine meter tap.");
		}
		expect(
			snapshot.combinedState.channels.map((channel) => channel.peak),
		).toEqual([0.75, 1.25]);
		expect(context.createdGains[2]?.connect).toHaveBeenCalledWith(
			context.createdGains[1],
		);
		expect(context.createdGains[2]?.connect).toHaveBeenCalledWith(
			context.createdSplitters[1],
		);
		expect(context.createdGains[3]?.connect).toHaveBeenCalledWith(
			context.createdGains[1],
		);
		expect(context.createdGains[3]?.connect).toHaveBeenCalledWith(
			context.createdSplitters[2],
		);
		expect(context.createdGains[1]?.connect).toHaveBeenCalledWith(
			context.createdGains[0],
		);
		expect(context.createdGains[1]?.connect).toHaveBeenCalledWith(
			context.createdSplitters[0],
		);
		for (const analyser of context.createdAnalysers) {
			expect(analyser.connect).not.toHaveBeenCalled();
		}
	});

	it("rebuilds analyser channels for automatic one-sided and duplicated stereo handling", async () => {
		const channelSampleIteration = vi.fn();
		const context = createAudioContextSpy({
			audioBuffers: [
				createIterableAudioBufferStub({
					channels: [
						[0.25, 0.25, 0.25, 0.25],
						[0, 0, 0, 0],
					],
					onSampleIterated: channelSampleIteration,
				}),
			],
		});
		const engine = await createPreviewAudioEngine({
			createAudioContext: () => context,
			outputChannels: 2,
			resources: [createPreviewAudioResource("audio-1", 0)],
		});

		engine.setTrackChannelMode(0, "auto-one-sided-stereo");
		channelSampleIteration.mockClear();
		setAnalyserFrames(context, [[0.4], [0.2], [], [], [0.3]]);
		await engine.play();

		const autoTrack = engine.readMeterSnapshot().trackStates["audio-1"];
		expect(autoTrack?.status).toBe("ready");
		if (autoTrack?.status !== "ready") {
			throw new Error("Expected a ready auto-one-sided meter.");
		}
		expect(autoTrack.channels[0]?.label).toBe("Mono");
		expect(autoTrack.channels[0]?.peak).toBeCloseTo(0.3);
		expect(channelSampleIteration).not.toHaveBeenCalled();

		engine.setTrackChannelMode(0, "duplicate-left-to-stereo");
		setAnalyserFrames(context, [[0.4], [0.2], [], [], [], [0.6], [0.6]]);
		const duplicatedTrack = engine.readMeterSnapshot().trackStates["audio-1"];
		expect(duplicatedTrack?.status).toBe("ready");
		if (duplicatedTrack?.status !== "ready") {
			throw new Error("Expected a ready duplicated stereo meter.");
		}
		expect(duplicatedTrack.channels.map((channel) => channel.label)).toEqual([
			"Left",
			"Right",
		]);
		expect(duplicatedTrack.channels[0]?.peak).toBeCloseTo(0.6);
		expect(duplicatedTrack.channels[1]?.peak).toBeCloseTo(0.6);
	});

	it("preserves wider custom per-track channel layouts", async () => {
		const context = createAudioContextSpy({
			audioBuffers: [
				createAudioBufferStub({ channels: [[], [], [], [], [], []] }),
			],
		});
		const engine = await createPreviewAudioEngine({
			createAudioContext: () => context,
			outputChannels: 2,
			resources: [createPreviewAudioResource("audio-1", 0)],
		});

		setAnalyserFrames(context, [
			[0.4],
			[0.2],
			[0.1],
			[0.2],
			[0.3],
			[0.4],
			[0.5],
			[0.6],
		]);
		await engine.play();
		const track = engine.readMeterSnapshot().trackStates["audio-1"];

		expect(track?.status).toBe("ready");
		if (track?.status !== "ready") {
			throw new Error("Expected a ready wider-layout meter.");
		}
		expect(track.channels.map((channel) => channel.label)).toEqual([
			"Ch 1",
			"Ch 2",
			"Ch 3",
			"Ch 4",
			"Ch 5",
			"Ch 6",
		]);
		for (const [index, expectedPeak] of [
			0.1, 0.2, 0.3, 0.4, 0.5, 0.6,
		].entries()) {
			expect(track.channels[index]?.peak).toBeCloseTo(expectedPeak);
		}
	});

	it("keeps graph metering live through seeks and speed changes, then reports silence while paused or stopped", async () => {
		const context = createAudioContextSpy();
		const engine = await createPreviewAudioEngine({
			createAudioContext: () => context,
			outputChannels: 2,
			resources: [createPreviewAudioResource("audio-1", 0)],
		});
		setAnalyserFrames(context, [[0.8], [0.4], [0.6], [0.2]]);

		await engine.play();
		expectMeterPeaksToBeCloseTo(
			readyTrackPeaks(engine.readMeterSnapshot(), "audio-1"),
			[0.6, 0.2],
		);

		engine.setTime(5);
		engine.setPlaybackRate(1.75);
		expectMeterPeaksToBeCloseTo(
			readyTrackPeaks(engine.readMeterSnapshot(), "audio-1"),
			[0.6, 0.2],
		);

		engine.pause();
		engine.setTime(0);
		expect(readyTrackPeaks(engine.readMeterSnapshot(), "audio-1")).toEqual([
			0, 0,
		]);
		expect(engine.readMeterSnapshot().combinedState).toEqual({
			channels: [
				{ label: "Left", peak: 0 },
				{ label: "Right", peak: 0 },
			],
			partial: false,
			reason: undefined,
			status: "ready",
		});

		engine.destroy();
		for (const analyser of context.createdAnalysers) {
			expect(analyser.disconnect).toHaveBeenCalledTimes(1);
		}
	});

	it("keeps Preview playback ready while analyser creation is explicitly unavailable", async () => {
		const context = createAudioContextSpy();
		context.createAnalyser.mockImplementation(() => {
			throw new Error("Analyser disabled");
		});
		const engine = await createPreviewAudioEngine({
			createAudioContext: () => context,
			outputChannels: 2,
			resources: [createPreviewAudioResource("audio-1", 0)],
		});

		expect(engine.getStatus()).toBe("ready");
		expect(engine.readMeterSnapshot()).toEqual({
			combinedState: {
				reason: "Preview audio engine meter tap unavailable: Analyser disabled",
				status: "unavailable",
			},
			trackStates: {
				"audio-1": {
					reason:
						"Preview audio engine meter tap unavailable: Analyser disabled",
					status: "unavailable",
					trackId: "audio-1",
				},
			},
		});
	});

	it("keeps prepared tracks active in degraded mode when one Preview audio resource fails", async () => {
		const context = createAudioContextSpy({
			audioBuffers: [
				createAudioBufferStub({
					channels: [[[4_800, 0.5]], [[4_800, 0.25]]],
				}),
			],
			decodeFailures: [null, new Error("Desktop decode failed")],
		});
		const engine = await createPreviewAudioEngine({
			createAudioContext: () => context,
			outputChannels: 2,
			resources: [
				createPreviewAudioResource("audio-1", 0),
				createPreviewAudioResource("audio-2", 0),
			],
		});

		expect(context.decodeAudioData).toHaveBeenCalledTimes(2);
		expect(engine.getStatus()).toBe("degraded");

		engine.setTrackVolumeGain(0, 0.5);
		engine.setTrackMonitorGain(0, 1);
		engine.setTrackVolumeGain(1, 0.25);
		engine.setTrackMonitorGain(1, 1);
		engine.setTime(0.1);
		await engine.play();

		expect(context.createdSources).toHaveLength(1);
		expect(context.createdSources[0]?.start).toHaveBeenCalledWith(0, 0.1);

		const snapshot = engine.readMeterSnapshot();
		const voiceState = snapshot.trackStates["audio-1"];

		expect(voiceState?.status).toBe("ready");
		expect(snapshot.trackStates["audio-2"]).toEqual({
			reason: "Desktop decode failed",
			status: "unavailable",
			trackId: "audio-2",
		});
		expect(snapshot.combinedState.status).toBe("ready");
		if (snapshot.combinedState.status !== "ready") {
			throw new Error("Expected degraded combined meter state.");
		}
		expect(snapshot.combinedState.partial).toBe(true);
		expect(snapshot.combinedState.reason).toContain("Desktop decode failed");

		engine.setTrackMonitorGain(1, 0);
		const excludedSnapshot = engine.readMeterSnapshot();
		expect(excludedSnapshot.combinedState.status).toBe("ready");
		if (excludedSnapshot.combinedState.status !== "ready") {
			throw new Error("Expected a ready combined meter state.");
		}
		expect(excludedSnapshot.combinedState.partial).toBe(false);
	});

	it("retries only a failed Preview audio resource while preserving prepared resources", async () => {
		const context = createAudioContextSpy({
			audioBuffers: [
				createAudioBufferStub({
					channels: [[[4_800, 0.5]], [[4_800, 0.25]]],
				}),
				createAudioBufferStub({
					channels: [[[4_800, 0.75]], [[4_800, 0.5]]],
				}),
			],
			decodeFailures: [null, new Error("Desktop decode failed"), null],
		});
		const engine = await createPreviewAudioEngine({
			createAudioContext: () => context,
			outputChannels: 2,
			resources: [
				createPreviewAudioResource("audio-1", 0),
				createPreviewAudioResource("audio-2", 0),
			],
		});

		expect(engine.getStatus()).toBe("degraded");
		expect(context.decodeAudioData).toHaveBeenCalledTimes(2);

		engine.setTrackVolumeGain(0, 0.5);
		engine.setTrackMonitorGain(0, 1);
		engine.setTrackVolumeGain(1, 0.25);
		engine.setTrackMonitorGain(1, 1);
		await engine.play();

		expect(context.createdSources).toHaveLength(1);

		await expect(engine.retryTrackResource("audio-2")).resolves.toBe("ready");

		expect(context.decodeAudioData).toHaveBeenCalledTimes(3);
		expect(engine.getStatus()).toBe("ready");
		expect(context.createdSources).toHaveLength(3);
		expect(context.createdSources[0]?.stop).toHaveBeenCalledTimes(1);
		expect(context.createdSources[1]?.start).toHaveBeenCalled();
		expect(context.createdSources[2]?.start).toHaveBeenCalled();
		expect(context.createdGains[2]?.gain.value).toBe(0.5);
		expect(context.createdGains[3]?.gain.value).toBe(0.25);

		const snapshot = engine.readMeterSnapshot();
		expect(snapshot.trackStates["audio-2"]?.status).toBe("ready");
		expect(snapshot.combinedState.status).toBe("ready");
		if (snapshot.combinedState.status !== "ready") {
			throw new Error("Expected ready combined meter state.");
		}
		expect(snapshot.combinedState.partial).toBe(false);
	});

	it("ignores a retried Preview audio resource that resolves after engine cleanup", async () => {
		const context = createAudioContextSpy({
			audioBuffers: [
				createAudioBufferStub({
					channels: [[[4_800, 0.5]], [[4_800, 0.25]]],
				}),
				createAudioBufferStub({
					channels: [[[4_800, 0.75]], [[4_800, 0.5]]],
				}),
			],
			decodeFailures: [null, new Error("Desktop decode failed")],
		});
		const engine = await createPreviewAudioEngine({
			createAudioContext: () => context,
			outputChannels: 2,
			resources: [
				createPreviewAudioResource("audio-1", 0),
				createPreviewAudioResource("audio-2", 0),
			],
		});
		const retryDecode = createDeferred<AudioBuffer>();

		context.decodeAudioData.mockImplementationOnce(() => retryDecode.promise);

		const retry = engine.retryTrackResource("audio-2");
		await Promise.resolve();
		await Promise.resolve();

		expect(context.decodeAudioData).toHaveBeenCalledTimes(3);

		const gainCountBeforeCleanup = context.createdGains.length;
		engine.destroy();
		retryDecode.resolve(createAudioBufferStub());
		await retry;

		expect(context.createdGains).toHaveLength(gainCountBeforeCleanup);
		expect(context.createdSources).toHaveLength(0);
		expect(context.close).toHaveBeenCalledTimes(1);
	});

	it("rejects total Preview audio engine resource failure so native video can own preview", async () => {
		const context = createAudioContextSpy({
			decodeFailures: [
				new Error("Voice decode failed"),
				new Error("Desktop decode failed"),
			],
		});

		await expect(
			createPreviewAudioEngine({
				createAudioContext: () => context,
				outputChannels: 2,
				resources: [
					createPreviewAudioResource("audio-1", 0),
					createPreviewAudioResource("audio-2", 0),
				],
			}),
		).rejects.toThrow("No Preview audio resources could be prepared");
		expect(context.close).toHaveBeenCalledTimes(1);
	});

	it("resolves Track volume, monitored-mix, and output gains independently", () => {
		const resource = createPreviewAudioResource("audio-1", 1.25);
		const audioMix = createDefaultAudioMix(readyAssetWithAudio);
		const audioDecision = audioMix.tracks["audio-1"];

		if (!audioDecision) {
			throw new Error("Expected audio-1 default mix decision.");
		}

		audioDecision.volumePercent = 50;

		expect(
			previewTrackVolumeGainForAudioTrackResource({
				audioMix,
				resource,
			}),
		).toBeCloseTo(0.25);
		expect(
			previewTrackMonitorGainForAudioTrackResource({
				audioMix,
				soloedAudioTrackId: null,
				resource,
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
			previewTrackVolumeGainForAudioTrackResource({
				audioMix,
				resource,
			}),
		).toBeCloseTo(0.25);
		expect(
			previewTrackMonitorGainForAudioTrackResource({
				audioMix,
				soloedAudioTrackId: null,
				resource,
			}),
		).toBe(0);

		expect(
			previewTrackMonitorGainForAudioTrackResource({
				audioMix,
				soloedAudioTrackId: "audio-1",
				resource,
			}),
		).toBe(1);
		expect(
			previewTrackMonitorGainForAudioTrackResource({
				audioMix,
				soloedAudioTrackId: "audio-1",
				resource: createPreviewAudioResource("audio-2", 1.25),
			}),
		).toBe(0);
	});
});

function createPreviewAudioResource(
	trackId: string,
	startPositionSeconds: number,
): PreviewAudioResource {
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
	decodeFailures = [],
}: {
	audioBuffers?: AudioBuffer[];
	decodeFailures?: Array<Error | null>;
} = {}) {
	const destination = createAudioNodeSpy();
	const context = {
		close: vi.fn(),
		createAnalyser: vi.fn(() => {
			const analyser = {
				...createAudioNodeSpy(),
				fftSize: 32,
				getFloatTimeDomainData: vi.fn((destination: Float32Array) => {
					destination.fill(0);
					destination.set(analyser.samples.subarray(0, destination.length));
				}),
				samples: new Float32Array(),
			};
			context.createdAnalysers.push(analyser);

			return analyser;
		}),
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
		createdAnalysers: [] as Array<
			ReturnType<typeof createAudioNodeSpy> & {
				fftSize: number;
				getFloatTimeDomainData: ReturnType<typeof vi.fn>;
				samples: Float32Array;
			}
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
		decodeAudioData: vi.fn(async () => {
			const failure = decodeFailures.shift();

			if (failure) {
				throw failure;
			}

			return audioBuffers.shift() ?? createAudioBufferStub();
		}),
		destination,
		resume: vi.fn(),
		sampleRate: 48_000,
	};

	return context;
}

function setAnalyserFrames(
	context: ReturnType<typeof createAudioContextSpy>,
	frames: number[][],
) {
	for (const [index, samples] of frames.entries()) {
		const analyser = context.createdAnalysers[index];

		if (analyser) {
			analyser.samples = Float32Array.from(samples);
		}
	}
}

function readyTrackPeaks(
	snapshot: PreviewAudioEngineMeterSnapshot,
	trackId: string,
) {
	const track = snapshot.trackStates[trackId];

	if (track?.status !== "ready") {
		throw new Error(`Expected ready meter state for ${trackId}.`);
	}

	return track.channels.map((channel) => channel.peak);
}

function expectMeterPeaksToBeCloseTo(actual: number[], expected: number[]) {
	expect(actual).toHaveLength(expected.length);
	for (const [index, expectedPeak] of expected.entries()) {
		expect(actual[index]).toBeCloseTo(expectedPeak);
	}
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
		copyToChannel(resource, channelNumber, startInChannel = 0) {
			channelData[channelNumber]?.set(resource, startInChannel);
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

function createIterableAudioBufferStub({
	channels,
	onSampleIterated,
}: {
	channels: number[][];
	onSampleIterated: () => void;
}): AudioBuffer {
	const channelData = channels.map((samples) => {
		const data: {
			[index: number]: number;
			length: number;
			[Symbol.iterator]: () => IterableIterator<number>;
		} = {
			length: samples.length,
			*[Symbol.iterator]() {
				for (const sample of samples) {
					onSampleIterated();
					yield sample;
				}
			},
		};

		for (const [index, sample] of samples.entries()) {
			data[index] = sample;
		}

		return data as unknown as Float32Array;
	});

	return {
		copyFromChannel(destination, channelNumber, startInChannel = 0) {
			const source = channelData[channelNumber];

			for (let index = 0; index < destination.length; index += 1) {
				destination[index] = source?.[startInChannel + index] ?? 0;
			}
		},
		copyToChannel() {},
		duration: 10,
		getChannelData(channelNumber) {
			const data = channelData[channelNumber];

			if (!data) {
				throw new Error(`Missing channel ${channelNumber}.`);
			}

			return data;
		},
		length: Math.max(1, ...channels.map((channel) => channel.length)),
		numberOfChannels: channelData.length,
		sampleRate: 48_000,
	} as AudioBuffer;
}

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});

	return {
		promise,
		reject,
		resolve,
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
