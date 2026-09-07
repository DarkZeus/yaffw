import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import type { ReadyMediaAsset } from "@/editor-core/model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveChannelTransform } from "../engine/browser-audio-mix";
import type {
	MediaWindowProvider,
	MediaWindowTrackState,
	OpenMediaWindowGenerationOptions,
} from "../engine/media-window-provider";
import {
	type PreviewAudioEngine,
	type PreviewAudioEngineMeterSnapshot,
	createPreviewAudioEngine,
	previewOutputGainForAudioMonitoring,
	previewTrackMonitorGainForAudioTrackResource,
	previewTrackVolumeGainForAudioTrackResource,
} from "../engine/preview-audio-engine";
import type { PreviewAudioResource } from "../types/preview-audio-resources.types";

const engines: PreviewAudioEngine[] = [];
afterEach(() => {
	for (const engine of engines) engine.destroy();
	engines.length = 0;
	vi.useRealTimers();
});
async function setup(
	provider = createProvider(),
	options: Partial<Parameters<typeof createPreviewAudioEngine>[0]> = {},
) {
	const context = createAudioContextSpy();
	const engine = await createPreviewAudioEngine({
		createAudioContext: () => context,
		provider,
		resources: provider.trackIds.map(createResource),
		outputChannels: 2,
		...options,
	});
	engines.push(engine);
	return { engine, context, provider };
}
describe("bounded production Preview audio engine", () => {
	it("primes only the current two-second window and shares one clock across distinct tracks", async () => {
		const { engine, context, provider } = await setup(createProvider(), {
			initialTimeSeconds: 5,
			initialPlaybackRate: 1.5,
		});
		expect(provider.pulls).toEqual([
			{ start: 5, end: 7, trackIds: ["audio-1", "audio-2"] },
		]);
		expect(engine.getStatus()).toBe("ready");
		expect(context.createdSources).toHaveLength(0);
		engine.setTrackMonitorGain(0, 1);
		engine.setTrackVolumeGain(0, 0.5);
		engine.setOutputGain(0.6);
		await engine.play();
		expect(context.createdSources).toHaveLength(20);
		expect(context.createdSources[0]?.start).toHaveBeenCalledWith(0, 0);
		expect(context.createdSources[10]?.start).toHaveBeenCalledWith(0, 0);
		expect(context.createdSources[0]?.buffer?.getChannelData(0)[0]).toBeCloseTo(
			0.25,
		);
		expect(
			context.createdSources[10]?.buffer?.getChannelData(0)[0],
		).toBeCloseTo(0.5);
		expect(context.createdGains[2]?.gain.value).toBe(0.5);
		expect(context.createdGains[0]?.gain.value).toBe(0.6);
		context.currentTime = 1;
		expect(engine.getCurrentTime()).toBe(6.5);
		await engine.setPlaybackRate(2);
		context.currentTime = 2;
		expect(engine.getCurrentTime()).toBe(8.5);
	});
	it("retains a bounded pause cache, suspends pulls, and resumes without a decoder generation", async () => {
		vi.useFakeTimers();
		const { engine, context, provider } = await setup();
		await engine.play();
		context.currentTime = 0.4;
		engine.pause();
		const count = provider.pulls.length;
		await vi.advanceTimersByTimeAsync(5000);
		expect(provider.pulls).toHaveLength(count);
		expect(engine.getMetrics().activeTimers).toBe(0);
		expect(engine.getCurrentTime()).toBe(0.4);
		await engine.setTime(0.4);
		await engine.play();
		expect(provider.openGeneration).toHaveBeenCalledTimes(1);
		expect(engine.getMetrics().engine.retainedPcmBytes).toBeLessThanOrEqual(
			1_536_000,
		);
	});
	it("replenishes below low water and releases ended PCM sources", async () => {
		vi.useFakeTimers();
		const { engine, context, provider } = await setup();
		await engine.play();
		context.currentTime = 0.6;
		for (const source of context.createdSources) {
			if (source.start.mock.calls[0]?.[0] < 0.6) source.onended?.();
		}
		await vi.advanceTimersByTimeAsync(50);
		expect(provider.pulls[1]?.end).toBe(2.6);
		expect(engine.getMetrics().engine.underruns).toBe(0);
	});
	it("rejects stale seek publication and never resumes a seek cancelled by pause", async () => {
		const late = deferred<MediaWindowTrackState[]>();
		const provider = createProvider((options, end) =>
			options.startSeconds === 4
				? late.promise
				: states(
						options.startSeconds,
						end,
						Array.from(options.trackIds ?? ["audio-1", "audio-2"]),
					),
		);
		const { engine, context } = await setup(provider);
		await engine.play();
		const old = engine.setTime(4);
		const latest = engine.setTime(8);
		engine.pause();
		await latest;
		late.resolve(states(4, 6, ["audio-1", "audio-2"]));
		await old;
		expect(engine.getCurrentTime()).toBe(8);
		expect(engine.getMetrics().activeTimers).toBe(0);
		expect(
			context.createdSources.every((source) => source.buffer === null),
		).toBe(true);
		expect(engine.getMetrics().stalePullResults).toBe(1);
	});
	it("cancels a pending AudioContext resume when paused", async () => {
		const { engine, context } = await setup();
		const pending = deferred<void>();
		context.resume.mockImplementation(() => pending.promise);
		const playing = engine.play();
		await Promise.resolve();
		engine.pause();
		pending.resolve();
		await playing;
		expect(context.createdSources).toHaveLength(0);
		expect(engine.getMetrics().activeTimers).toBe(0);
	});
	it("stops nodes and closes context immediately when aborting pending preparation", async () => {
		const pending = deferred<MediaWindowTrackState[]>();
		const provider = createProvider(() => pending.promise);
		const context = createAudioContextSpy();
		const abort = new AbortController();
		const preparation = createPreviewAudioEngine({
			createAudioContext: () => context,
			provider,
			resources: provider.trackIds.map(createResource),
			outputChannels: 2,
			signal: abort.signal,
		});
		abort.abort();
		expect(context.close).toHaveBeenCalledTimes(1);
		expect(provider.dispose).not.toHaveBeenCalled();
		pending.resolve(states(0, 2, provider.trackIds));
		await expect(preparation).rejects.toThrow("aborted");
	});
	it("reports partial monitored failures and retries only the failed track without stopping healthy nodes", async () => {
		const provider = createProvider((options, end) =>
			states(
				options.startSeconds,
				end,
				Array.from(options.trackIds ?? ["audio-1", "audio-2"]),
			).map((state) =>
				state.trackId === "audio-2" && !options.retryTrackIds
					? {
							...state,
							kind: "failure",
							state: "failure",
							reason: "Desktop decode failed",
						}
					: state,
			),
		);
		const { engine, context } = await setup(provider);
		engine.setTrackMonitorGain(1, 1);
		expect(engine.getStatus()).toBe("degraded");
		expect(engine.readMeterSnapshot().combinedState).toMatchObject({
			partial: true,
		});
		await engine.play();
		const healthy = context.createdSources.slice();
		const changed = vi.fn();
		engine.subscribe(changed);
		await engine.retryTrack("audio-2");
		expect(provider.openGeneration.mock.calls.at(-1)?.[0]).toMatchObject({
			trackIds: ["audio-2"],
			retryTrackIds: ["audio-2"],
		});
		expect(engine.getStatus()).toBe("ready");
		expect(changed).toHaveBeenCalled();
		expect(healthy.every((source) => source.stop.mock.calls.length === 0)).toBe(
			true,
		);
	});
	it("keeps an isolated retry playable across subsequent lookahead pulls", async () => {
		vi.useFakeTimers();
		const provider = createProvider((options, end) =>
			states(
				options.startSeconds,
				end,
				Array.from(options.trackIds ?? ["audio-1", "audio-2"]),
			).map((state) =>
				state.trackId === "audio-2" && !options.retryTrackIds
					? {
							...state,
							kind: "failure",
							state: "failure",
							reason: "Decode failed",
						}
					: state,
			),
		);
		const { engine, context } = await setup(provider);
		await engine.play();
		context.currentTime = 0.3;
		await engine.retryTrack("audio-2");
		for (const time of [0.6, 1.2, 1.8, 2.4]) {
			context.currentTime = time;
			await vi.advanceTimersByTimeAsync(50);
			expect(engine.getStatus()).toBe("ready");
		}
		expect(engine.getMetrics().trackRetries).toBe(1);
		expect(provider.openGeneration).toHaveBeenCalledTimes(2);
		expect(
			provider.pulls.filter((pull) => pull.trackIds.length === 1).length,
		).toBeGreaterThanOrEqual(4);
	});
	it("keeps total failures retryable and rejects playback until a track recovers", async () => {
		const provider = createProvider((options, end) =>
			states(
				options.startSeconds,
				end,
				Array.from(options.trackIds ?? ["audio-1", "audio-2"]),
			).map((state) =>
				options.retryTrackIds
					? state
					: {
							...state,
							kind: "failure",
							state: "failure",
							reason: "Decode failed",
						},
			),
		);
		const { engine } = await setup(provider);
		expect(engine.getStatus()).toBe("failed");
		await expect(engine.play()).rejects.toThrow("Every required");
		await engine.retryTrack("audio-1");
		expect(engine.getStatus()).toBe("degraded");
		await engine.play();
	});
	it("clips scheduled sources exactly at the Selection boundary", async () => {
		const { engine, context } = await setup();
		engine.setPlaybackEnd(0.35);
		await engine.play();
		expect(context.createdSources).toHaveLength(4);
		expect(context.createdSources[1]?.start.mock.calls[0]?.[2]).toBeCloseTo(
			0.15,
		);
	});
	it("routes left, right, duplicate, average and auto channel handling through bounded graph paths", async () => {
		const { engine, context } = await setup();
		for (const mode of [
			"use-left-as-mono",
			"use-right-as-mono",
			"duplicate-left-to-stereo",
			"duplicate-right-to-stereo",
			"average-to-mono",
			"auto-one-sided-stereo",
		] as const) {
			engine.setTrackChannelMode(0, mode);
			await engine.play();
			expect(context.createdSources.at(-20)?.connect).toHaveBeenCalled();
			const track = engine.readMeterSnapshot().trackStates["audio-1"];
			expect(track?.status).toBe("ready");
			if (track?.status === "ready")
				expect(track.channels).toHaveLength(
					mode.includes("as-mono") || mode === "average-to-mono" ? 1 : 2,
				);
		}
		expect(context.createdMergers.length).toBeGreaterThanOrEqual(2);
	});
	it("centers alternating one-sided passages independently in automatic Preview while whole-Selection classification preserves stereo", async () => {
		const provider = createProvider((options, end) =>
			states(options.startSeconds, end, ["audio-1", "audio-2"]).map((state) =>
				state.kind === "playable"
					? {
							...state,
							chunks: state.chunks.map((chunk, index) => {
								const audioBuffer = createAudioBufferStub();
								audioBuffer.getChannelData(index % 2).fill(0.5);
								return { ...chunk, audioBuffer };
							}),
						}
					: state,
			),
		);
		const { engine, context } = await setup(provider);
		engine.setTrackChannelMode(0, "auto-one-sided-stereo");
		await engine.play();
		const [leftSource, rightSource] = context.createdSources;
		const leftRoute = leftSource.connect.mock.calls[0][0];
		const rightRoute = rightSource.connect.mock.calls[0][0];
		expect(leftRoute.connect).toHaveBeenCalledWith(
			context.createdGains[2],
			0,
			0,
		);
		expect(rightRoute.connect).toHaveBeenCalledWith(
			context.createdGains[2],
			1,
			0,
		);
		expect(leftRoute).not.toBe(rightRoute);

		const wholeSelection = createAudioBufferStub();
		wholeSelection.getChannelData(0).fill(0.5, 0, 4800);
		wholeSelection.getChannelData(1).fill(0.5, 4800);
		expect(
			resolveChannelTransform(wholeSelection, "auto-one-sided-stereo")
				.resolvedMode,
		).toBe("preserve");
		engine.setTrackChannelMode(0, "preserve");
		await engine.play();
		for (const source of context.createdSources.slice(-20, -10)) {
			expect(source.connect).toHaveBeenCalledWith(context.createdGains[2]);
		}
	});
	it("meters the post-decision graph before output gain and reads silence while paused", async () => {
		const { engine, context } = await setup();
		engine.setOutputGain(0);
		await engine.play();
		setAnalyserFrames(context, [[0.75], [0.25], [0.5], [0.125], [0.4], [0.2]]);
		expectMeterPeaksToBeCloseTo(
			readyTrackPeaks(engine.readMeterSnapshot(), "audio-1"),
			[0.5, 0.125],
		);
		expect(engine.readMeterSnapshot().combinedState).toMatchObject({
			channels: [{ peak: 0.75 }, { peak: 0.25 }],
		});
		await engine.setTime(5);
		await engine.setPlaybackRate(1.75);
		expectMeterPeaksToBeCloseTo(
			readyTrackPeaks(engine.readMeterSnapshot(), "audio-1"),
			[0.5, 0.125],
		);
		engine.pause();
		expect(readyTrackPeaks(engine.readMeterSnapshot(), "audio-1")).toEqual([
			0, 0,
		]);
		engine.destroy();
		engine.destroy();
		expect(context.close).toHaveBeenCalledTimes(1);
		expect(engine.getMetrics().engine.retainedPcmBytes).toBe(0);
		for (const source of context.createdSources) {
			expect(source.disconnect).toHaveBeenCalledTimes(1);
			expect(source.buffer).toBe(null);
		}
	});
	it("preserves wider per-track channel labels and meter taps", async () => {
		const provider = createProvider((options, end) =>
			states(options.startSeconds, end, ["audio-1", "audio-2"]).map((state) =>
				state.kind === "playable"
					? {
							...state,
							chunks: state.chunks.map((chunk) => ({
								...chunk,
								audioBuffer: createAudioBufferStub({
									channels: [[], [], [], [], [], []],
								}),
							})),
						}
					: state,
			),
		);
		const { engine, context } = await setup(provider, {
			resources: provider.trackIds.map((trackId) => ({
				...createResource(trackId),
				numberOfChannels: 6,
			})),
		});
		await engine.play();
		engine.setTrackChannelMode(0, "auto-one-sided-stereo");
		expect(context.createdGains[2]).toMatchObject({ channelCount: 6 });
		const state = engine.readMeterSnapshot().trackStates["audio-1"];
		expect(state).toMatchObject({
			status: "ready",
			channels: [
				{ label: "Ch 1" },
				{ label: "Ch 2" },
				{ label: "Ch 3" },
				{ label: "Ch 4" },
				{ label: "Ch 5" },
				{ label: "Ch 6" },
			],
		});
	});
	it("keeps playback ready when analyser creation is unavailable", async () => {
		const context = createAudioContextSpy();
		context.createAnalyser.mockImplementation(() => {
			throw new Error("Analyser disabled");
		});
		const { engine } = await setup(createProvider(), {
			createAudioContext: () => context,
		});
		await engine.play();
		expect(engine.getStatus()).toBe("ready");
		expect(context.createdSources.length).toBeGreaterThan(0);
		expect(engine.readMeterSnapshot().trackStates["audio-1"]).toMatchObject({
			status: "unavailable",
			reason: "Preview audio engine meter tap unavailable: Analyser disabled",
		});
	});
	it("closes a newly created context if constructing its audio graph fails", async () => {
		const context = createAudioContextSpy();
		context.createGain.mockImplementation(() => {
			throw new Error("Graph allocation failed");
		});
		await expect(
			setup(createProvider(), { createAudioContext: () => context }),
		).rejects.toThrow("Graph allocation failed");
		expect(context.close).toHaveBeenCalledTimes(1);
	});
	it("reuses paused PCM when transport synchronizes the same integer media microsecond", async () => {
		const { engine, context, provider } = await setup();
		await engine.play();
		context.currentTime = 0.4000003;
		engine.pause();
		await engine.setTime(0.4);
		await engine.play();
		expect(provider.openGeneration).toHaveBeenCalledTimes(1);
	});
	it("resolves Track volume, monitored-mix, and output gains independently", () => {
		const resource = createResource("audio-1");
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
				resource: createResource("audio-2"),
			}),
		).toBe(0);
	});
});

function createResource(trackId: string): PreviewAudioResource {
	return {
		trackId,
		trackIndex: trackId === "audio-1" ? 0 : 1,
		track: { id: trackId, kind: "audio" },
		numberOfChannels: 2,
		sampleRate: 48000,
	};
}
function createProvider(
	handler?: (
		options: OpenMediaWindowGenerationOptions,
		end: number,
	) => MediaWindowTrackState[] | Promise<MediaWindowTrackState[]>,
) {
	let id = 0;
	const pulls: Array<{ start: number; end: number; trackIds: string[] }> = [];
	return {
		durationSeconds: 120,
		trackIds: ["audio-1", "audio-2"],
		dispose: vi.fn(async () => {}),
		getTrackMetadata: () => ({
			numberOfChannels: 2,
			sampleRate: 48000,
			failureReason: null,
		}),
		pulls,
		openGeneration: vi.fn((options: OpenMediaWindowGenerationOptions) => {
			let cursor = options.startSeconds;
			const selected = Array.from(options.trackIds ?? ["audio-1", "audio-2"]);
			return {
				id: ++id,
				startSeconds: options.startSeconds,
				trackIds: selected,
				cancel: vi.fn(async () => {}),
				async pullThrough(end: number) {
					if (end <= cursor) throw new Error("Expected advancing window");
					const start = cursor;
					cursor = end;
					pulls.push({ start, end, trackIds: selected });
					return {
						generationId: id,
						startSeconds: start,
						endSeconds: end,
						tracks: handler
							? await handler({ ...options, startSeconds: start }, end)
							: states(start, end, selected),
					};
				},
			};
		}),
	} satisfies MediaWindowProvider & { pulls: typeof pulls };
}
function states(
	start: number,
	end: number,
	trackIds: readonly string[],
): MediaWindowTrackState[] {
	return trackIds.map((trackId) => ({
		trackId,
		startSeconds: start,
		endSeconds: end,
		kind: "playable",
		state: "playable",
		chunks: Array.from({ length: Math.round((end - start) / 0.2) }, (_, i) => ({
			trackId,
			startSeconds: start + i * 0.2,
			endSeconds: Math.min(end, start + (i + 1) * 0.2),
			audioBuffer: createAudioBufferStub({
				channels: [[[0, trackId === "audio-1" ? 0.25 : 0.5]], []],
			}),
		})),
	}));
}
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}
function createAudioContextSpy() {
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
				buffer: null as AudioBuffer | null,
				onended: null as (() => void) | null,
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
				onended: (() => void) | null;
				playbackRate: { value: number };
				start: ReturnType<typeof vi.fn>;
				stop: ReturnType<typeof vi.fn>;
			}
		>,
		currentTime: 0,
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
	const length = 9_600;
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
		duration: 0.2,
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
