import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import type { ReadyMediaAsset } from "@/editor-core/model";
import { resolveChannelTransform } from "../engine/audio-channel-analysis";
import type {
	MediaWindowProvider,
	MediaWindowTrackState,
	OpenMediaWindowGenerationOptions,
} from "../engine/media-window-provider";
import type { PreviewAudioContextState } from "../engine/preview-audio-context-lifecycle";
import {
	applyPreviewAudioEngineMix,
	createPreviewAudioEngine,
} from "../engine/preview-audio-engine";
import type { PreviewAudioEngine } from "../types/preview-audio-engine.types";
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

describe("Preview presentation timing candidate", () => {
	it("resets output mapping through seek, rate, interruption recovery and disposal", async () => {
		vi.useFakeTimers();
		vi.advanceTimersByTime(1000);
		const context = Object.assign(createLifecycleContext(), {
			getOutputTimestamp: () => ({
				contextTime: context.currentTime - 0.1,
				performanceTime: performance.now(),
			}),
		});
		const { engine } = await setup(undefined, {
			createAudioContext: () => context,
			outputTimingEnabled: true,
		});
		await engine.play();
		context.currentTime = 0.5;
		expect(engine.getPresentationTime()).toBeCloseTo(0.4);
		await engine.setTime(5);
		expect(engine.getPresentationTime()).toBe(5);
		vi.advanceTimersByTime(200);
		context.currentTime = 0.7;
		expect(engine.getPresentationTime()).toBeCloseTo(5.1);
		await engine.setPlaybackRate(2);
		context.currentTime = 0.9;
		expect(engine.getPresentationTime()).toBeCloseTo(5.4);
		context.resume.mockRejectedValue(new Error("Gesture required"));
		context.changeState("interrupted");
		await flushMicrotasks();
		expect(engine.getPresentationTime()).toBeCloseTo(5.6);
		context.currentTime = 10;
		expect(engine.getPresentationTime()).toBeCloseTo(5.6);
		context.changeState("running");
		await flushMicrotasks();
		context.currentTime = 10.2;
		expect(engine.getPresentationTime()).toBeCloseTo(5.8);
		engine.destroy();
		expect(engine.getPresentationTime()).toBe(engine.getCurrentTime());
	});
	it("defaults to rendering time and tolerates an unsupported or throwing browser timestamp", async () => {
		const context = {
			...createAudioContextSpy(),
			getOutputTimestamp: vi.fn(() => {
				throw new Error("unavailable");
			}),
		};
		const baseline = await setup(undefined, {
			createAudioContext: () => context,
		});
		await baseline.engine.play();
		context.currentTime = 0.5;
		expect(baseline.engine.getPresentationTime()).toBe(0.5);
		expect(context.getOutputTimestamp).not.toHaveBeenCalled();
		const candidate = await setup(undefined, {
			createAudioContext: () => context,
			outputTimingEnabled: true,
		});
		await candidate.engine.play();
		context.currentTime = 1;
		expect(candidate.engine.getPresentationTime()).toBe(0.5);
		expect(context.getOutputTimestamp).toHaveBeenCalledOnce();
		const unsupported = await setup(undefined, { outputTimingEnabled: true });
		await unsupported.engine.play();
		unsupported.context.currentTime = 0.5;
		expect(unsupported.engine.getPresentationTime()).toBe(0.5);
	});
});

describe("Preview audio with a pending video fragment", () => {
	it("keeps the audio clock at the seek target until the fragment is ready", async () => {
		const { context, engine } = await setup();
		const fragment = deferred<void>();
		await engine.setTime(5);
		const playing = engine.play(fragment.promise);
		await flushMicrotasks();

		context.currentTime = 1;
		expect(engine.getPlaybackState()).toBe("buffering");
		expect(engine.getCurrentTime()).toBe(5);

		fragment.resolve();
		await playing;
		context.currentTime = 1.25;
		expect(engine.getPlaybackState()).toBe("playing");
		expect(engine.getCurrentTime()).toBeCloseTo(5.25);
	});

	it("ignores a finished fragment after Pause cancels playback", async () => {
		const { engine } = await setup();
		const fragment = deferred<void>();
		const playing = engine.play(fragment.promise);
		await flushMicrotasks();

		engine.pause();
		fragment.resolve();
		await playing;

		expect(engine.getPlaybackState()).toBe("paused");
		expect(engine.getMetrics().activeTimers).toBe(0);
	});
});

describe("Preview audio context interruptions", () => {
	it.each(["promise-first", "event-first"])(
		"re-primes once at the latest position and rate with %s recovery",
		async (order) => {
			const context = createLifecycleContext();
			const { engine, provider } = await setup(undefined, {
				createAudioContext: () => context,
			});
			await engine.play();
			context.currentTime = 0.4;
			const pending = deferred<void>();
			context.resume.mockReturnValue(pending.promise);
			context.changeState("suspended");
			context.changeState("interrupted");
			expect(context.resume).toHaveBeenCalledOnce();
			expect(engine.getPlaybackState()).toBe("resuming");
			expect(engine.getCurrentTime()).toBe(0.4);
			expect(engine.getMetrics().activeTimers).toBe(0);

			const generations = provider.openGeneration.mock.calls.length;
			await engine.setTime(6);
			await engine.setPlaybackRate(1.5);
			expect(engine.getCurrentTime()).toBe(6);
			expect(engine.getStatus()).toBe("ready");
			expect(provider.openGeneration).toHaveBeenCalledTimes(generations);

			if (order === "promise-first") {
				context.state = "running";
				pending.resolve();
			} else {
				context.changeState("running");
			}
			await vi.waitFor(() => expect(engine.getPlaybackState()).toBe("playing"));
			const sources = context.createdSources.length;
			expect(provider.openGeneration).toHaveBeenCalledTimes(generations + 1);
			expect(provider.openGeneration).toHaveBeenLastCalledWith(
				expect.objectContaining({ startSeconds: 6 }),
			);
			expect(context.createdSources.at(-1)?.playbackRate.value).toBe(1.5);

			if (order === "promise-first") context.changeState("running");
			else pending.reject(new Error("Obsolete resume rejection"));
			await flushMicrotasks();
			expect(engine.getPlaybackState()).toBe("playing");
			expect(provider.openGeneration).toHaveBeenCalledTimes(generations + 1);
			expect(context.createdSources).toHaveLength(sources);
		},
	);

	it("keeps duplicate Play idempotent while running", async () => {
		const context = createLifecycleContext();
		const { engine } = await setup(undefined, {
			createAudioContext: () => context,
		});
		await engine.play();
		const created = context.createdSources.length;
		await Promise.all([engine.play(), engine.play()]);
		expect(engine.getPlaybackState()).toBe("playing");
		expect(context.createdSources).toHaveLength(created);
		expect(engine.getMetrics().activeTimers).toBe(1);
	});

	it("allows a gesture retry to supersede a resume that never settles, applying the latest seek and rate", async () => {
		const context = createLifecycleContext();
		const { engine, provider } = await setup(undefined, {
			createAudioContext: () => context,
		});
		await engine.play();
		const pending = deferred<void>();
		context.resume.mockImplementation(() => pending.promise);
		context.changeState("suspended");
		expect(engine.getPlaybackState()).toBe("resuming");
		await engine.setTime(7);
		await engine.setPlaybackRate(2);
		context.resume.mockImplementation(async () =>
			context.changeState("running"),
		);
		await engine.play();
		expect(engine.getPlaybackState()).toBe("playing");
		expect(provider.openGeneration).toHaveBeenLastCalledWith(
			expect.objectContaining({ startSeconds: 7 }),
		);
		expect(context.createdSources.at(-1)?.playbackRate.value).toBe(2);
		const created = context.createdSources.length;
		pending.resolve();
		await flushMicrotasks();
		expect(context.createdSources).toHaveLength(created);
		context.currentTime = 0.5;
		expect(engine.getCurrentTime()).toBe(8);
	});

	it("publishes a closed context terminal state and never attempts to resume it", async () => {
		const context = createLifecycleContext();
		const { engine, provider } = await setup(undefined, {
			createAudioContext: () => context,
		});
		const observed: string[] = [];
		engine.subscribe(() => observed.push(engine.getPlaybackState()));
		await engine.play();
		context.changeState("closed");
		const generationCount = provider.openGeneration.mock.calls.length;
		await engine.play();
		await engine.setTime(4);
		await engine.setPlaybackRate(2);
		engine.pause();
		expect(engine.getPlaybackState()).toBe("closed");
		expect(engine.getStatus()).toBe("ready");
		expect(context.resume).not.toHaveBeenCalled();
		expect(observed).toContain("closed");
		expect(engine.getMetrics().activeTimers).toBe(0);
		expect(provider.openGeneration).toHaveBeenCalledTimes(generationCount);
	});

	it("publishes context closure even while the initial decode is pending", async () => {
		const first = deferred<MediaWindowTrackState[]>();
		const provider = createProvider(() => first.promise);
		const context = createLifecycleContext();
		const preparation = setup(provider, { createAudioContext: () => context });
		await vi.waitFor(() => expect(provider.pulls).toHaveLength(1));
		context.changeState("closed");
		const { engine } = await preparation;
		expect(engine.getPlaybackState()).toBe("closed");
		expect(engine.getStatus()).toBe("preparing");

		first.resolve(states(0, 2, provider.trackIds));
		await flushMicrotasks();
		await engine.play();
		expect(engine.getPlaybackState()).toBe("closed");
		expect(context.resume).not.toHaveBeenCalled();
		expect(context.createdSources).toHaveLength(0);
	});
});

async function flushMicrotasks() {
	for (let index = 0; index < 15; index++) await Promise.resolve();
}

function createLifecycleContext() {
	const listeners = new Set<() => void>();
	const context = {
		...createAudioContextSpy(),
		state: "running" as PreviewAudioContextState,
		resume: vi.fn<() => Promise<void>>(async () => {}),
		listeners,
		addEventListener: vi.fn((_type: "statechange", listener: () => void) => {
			listeners.add(listener);
		}),
		removeEventListener: vi.fn((_type: "statechange", listener: () => void) => {
			listeners.delete(listener);
		}),
		changeState(state: PreviewAudioContextState) {
			context.state = state;
			for (const listener of listeners) listener();
		},
	};
	return context;
}
describe("bounded production Preview audio engine", () => {
	it("applies one effective gain target when a mix update changes volume and monitoring together", async () => {
		const { engine, context, provider } = await setup();
		const audioMix = createDefaultAudioMix(readyAssetWithAudio);
		const apply = () =>
			applyPreviewAudioEngineMix({
				audioMix,
				muted: false,
				previewAudioEngine: engine,
				resources: provider.trackIds.map(createResource),
				volume: 1,
			});
		apply();
		await engine.play();
		context.currentTime = 0.1;
		audioMix.tracks["audio-1"].volumePercent = 50;
		audioMix.tracks["audio-1"].include = false;
		apply();
		const track = context.createdGains[2].gain;
		expect(track.linearRampToValueAtTime).toHaveBeenCalledExactlyOnceWith(
			0,
			expect.closeTo(0.108, 8),
		);
	});

	it("settles master and track ramps once and leaves identical paused targets alone", async () => {
		const { engine, context } = await setup();
		await engine.play();
		const master = context.createdGains[0].gain;
		const track = context.createdGains[2].gain;
		context.currentTime = 0.1;
		engine.setOutputGain(0.5);
		engine.setTrackGain(0, { monitorGain: 1 });
		master.cancelScheduledValues.mockClear();
		track.cancelScheduledValues.mockClear();
		context.currentTime = 0.104;
		engine.pause();
		engine.pause();
		engine.setOutputGain(0.5);
		engine.setTrackGain(0, { monitorGain: 1 });
		expect(master.cancelScheduledValues).toHaveBeenCalledExactlyOnceWith(0.104);
		expect(track.cancelScheduledValues).toHaveBeenCalledExactlyOnceWith(0.104);
		expect(master.value).toBe(0.5);
		expect(track.value).toBe(1);
	});

	it("retargets the combined track gain without changing decisions or restarting sources", async () => {
		const { engine, context, provider } = await setup();
		const audioMix = createDefaultAudioMix(readyAssetWithAudio);
		const resources = provider.trackIds.map(createResource);
		const apply = (soloedAudioTrackId: string | null = null) =>
			applyPreviewAudioEngineMix({
				audioMix,
				resources,
				previewAudioEngine: engine,
				muted: false,
				volume: 1,
				soloedAudioTrackId,
			});
		apply();
		const track = context.createdGains[2].gain;
		expect(track.value).toBe(1);
		expect(track.linearRampToValueAtTime).not.toHaveBeenCalled();
		await engine.play();
		const sources = context.createdSources.slice();
		context.currentTime = 0.1;
		audioMix.tracks["audio-1"].volumePercent = 50;
		apply();
		expect(track.linearRampToValueAtTime.mock.calls.at(-1)?.[0]).toBe(0.25);
		expect(track.linearRampToValueAtTime.mock.calls.at(-1)?.[1]).toBeCloseTo(
			0.108,
		);
		context.currentTime = 0.104;
		audioMix.tracks["audio-1"].include = false;
		apply();
		expect(track.setValueAtTime.mock.calls.at(-1)?.[0]).toBeCloseTo(0.625);
		expect(track.linearRampToValueAtTime.mock.calls.at(-1)?.[0]).toBe(0);
		context.currentTime = 0.108;
		apply("audio-1");
		expect(track.setValueAtTime.mock.calls.at(-1)?.[0]).toBeCloseTo(0.3125);
		expect(track.linearRampToValueAtTime.mock.calls.at(-1)?.[0]).toBe(0.25);
		expect(audioMix.tracks["audio-1"]).toMatchObject({
			include: false,
			volumePercent: 50,
		});
		const ramps = track.linearRampToValueAtTime.mock.calls.length;
		apply("audio-1");
		expect(track.linearRampToValueAtTime).toHaveBeenCalledTimes(ramps);
		expect(provider.openGeneration).toHaveBeenCalledTimes(1);
		expect(context.createdSources).toEqual(sources);
		expect(sources.every((source) => source.stop.mock.calls.length === 0)).toBe(
			true,
		);
	});
	it("settles all track gains on pause, seek, speed and routing changes and cancels them on replacement", async () => {
		const { engine, context } = await setup();
		const track = context.createdGains[2].gain;
		engine.setTrackGain(0, { monitorGain: 1 });
		engine.setTrackGain(0, { volumeGain: 0.5 });
		expect(track.value).toBe(0.5);
		await engine.play();
		for (const reset of [
			async () => engine.pause(),
			async () => engine.setTime(4),
			async () => engine.setPlaybackRate(2),
			async () => engine.setTrackChannelMode(0, "use-left-as-mono"),
		]) {
			context.currentTime += 0.01;
			engine.setTrackGain(0, { monitorGain: 0 });
			expect(track.linearRampToValueAtTime.mock.calls.at(-1)?.[0]).toBe(0);
			await reset();
			expect(track.value).toBe(0);
			expect(track.cancelScheduledValues).toHaveBeenLastCalledWith(
				context.currentTime,
			);
			engine.pause();
			const count = track.linearRampToValueAtTime.mock.calls.length;
			engine.setTrackGain(0, { monitorGain: 1 });
			expect(track.value).toBe(0.5);
			await engine.play();
			expect(track.linearRampToValueAtTime).toHaveBeenCalledTimes(count);
		}
		engine.setTrackGain(0, { volumeGain: 0.75 });
		engine.destroy();
		expect(track.value).toBe(0);
		const calls = track.setValueAtTime.mock.calls.length;
		engine.setTrackGain(0, { volumeGain: 1 });
		engine.setTrackGain(0, { monitorGain: 1 });
		expect(track.setValueAtTime).toHaveBeenCalledTimes(calls);
		const replacement = await setup();
		replacement.engine.setTrackGain(0, { monitorGain: 1 });
		expect(replacement.context.createdGains[2].gain.value).toBe(1);
		expect(
			replacement.context.createdGains[2].gain.linearRampToValueAtTime,
		).not.toHaveBeenCalled();
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
		await vi.waitFor(() =>
			expect(provider.pulls.some((pull) => pull.start === 4)).toBe(true),
		);
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
	it("lets a pending Play use the current seek without waiting for an obsolete decode", async () => {
		const late = deferred<MediaWindowTrackState[]>();
		const provider = createProvider((options, end) =>
			options.startSeconds === 4
				? late.promise
				: states(options.startSeconds, end, ["audio-1", "audio-2"]),
		);
		const { engine } = await setup(provider);
		const obsolete = engine.setTime(4);
		await vi.waitFor(() =>
			expect(provider.pulls.some((pull) => pull.start === 4)).toBe(true),
		);
		const playing = vi.fn();
		const pendingPlay = engine.play().then(playing);
		await flushMicrotasks();
		await engine.setTime(8);
		await vi.waitFor(() => expect(playing).toHaveBeenCalledOnce());
		expect(engine.getPlaybackState()).toBe("playing");
		expect(engine.getCurrentTime()).toBe(8);
		late.resolve(states(4, 6, ["audio-1", "audio-2"]));
		await obsolete;
		await pendingPlay;
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
							reason: "Desktop decode failed",
						}
					: state,
			),
		);
		const { engine, context } = await setup(provider);
		engine.setTrackGain(1, { monitorGain: 1 });
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
	it("replenishes the healthy window while an isolated retry is still decoding", async () => {
		vi.useFakeTimers();
		const retry = deferred<MediaWindowTrackState[]>();
		const provider = createProvider((options, end) =>
			options.retryTrackIds
				? retry.promise
				: [
						...states(options.startSeconds, end, ["audio-1"]),
						{
							kind: "failure",
							reason: "Desktop decode failed",
							trackId: "audio-2",
							startSeconds: options.startSeconds,
							endSeconds: end,
						},
					],
		);
		const { engine, context } = await setup(provider);
		await engine.play();
		const recovering = engine.retryTrack("audio-2");
		await engine.retryTrack("audio-2");
		expect(engine.readMeterSnapshot().trackStates["audio-2"]).toMatchObject({
			status: "unavailable",
			retryStatus: "retrying",
			reason: "Desktop decode failed",
		});
		for (const time of [0.6, 1.2, 1.8, 2.4]) {
			context.currentTime = time;
			await vi.advanceTimersByTimeAsync(50);
		}
		expect(
			provider.pulls.filter((pull) => pull.trackIds.length === 2).length,
		).toBeGreaterThanOrEqual(4);
		expect(
			provider.pulls.filter((pull) => pull.trackIds.length === 1),
		).toHaveLength(1);
		retry.resolve(states(0, 2, ["audio-2"]));
		await recovering;
		expect(engine.getStatus()).toBe("ready");
		expect(engine.getMetrics().trackRetries).toBe(1);
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
});

function createResource(trackId: string): PreviewAudioResource {
	return {
		trackId,
		numberOfChannels: 2,
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
		}),
		pulls,
		openGeneration: vi.fn((options: OpenMediaWindowGenerationOptions) => {
			let cursor = options.startSeconds;
			const selected = Array.from(options.trackIds ?? ["audio-1", "audio-2"]);
			return {
				id: ++id,
				trackIds: selected,
				cancel: vi.fn(async () => {}),
				async pullThrough(end: number) {
					if (end <= cursor) throw new Error("Expected advancing window");
					const start = cursor;
					cursor = end;
					pulls.push({ start, end, trackIds: selected });
					return handler
						? await handler({ ...options, startSeconds: start }, end)
						: states(start, end, selected);
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
		chunks: Array.from({ length: Math.round((end - start) / 0.2) }, (_, i) => ({
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
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((r, fail) => {
		resolve = r;
		reject = fail;
	});
	return { promise, resolve, reject };
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
				gain: createGainParamSpy(),
			};
			context.createdGains.push(gain);

			return gain;
		}),
		createdGains: [] as Array<
			ReturnType<typeof createAudioNodeSpy> & {
				gain: ReturnType<typeof createGainParamSpy>;
			}
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

function createGainParamSpy() {
	const param = {
		value: 1,
		cancelAndHoldAtTime: vi.fn(),
		cancelScheduledValues: vi.fn(),
		linearRampToValueAtTime: vi.fn(),
		setValueAtTime: vi.fn((value: number, _time: number) => {
			param.value = value;
		}),
	};
	return param;
}
