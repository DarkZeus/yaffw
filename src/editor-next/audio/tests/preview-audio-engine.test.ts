import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import type { ReadyMediaAsset } from "@/editor-core/model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveChannelTransform } from "../engine/browser-audio-mix";
import type {
	MediaWindowProvider,
	MediaWindowTrackState,
	OpenMediaWindowGenerationOptions,
} from "../engine/media-window-provider";
import type { PreviewAudioContextState } from "../engine/preview-audio-context-lifecycle";
import {
	type PreviewAudioEngine,
	type PreviewAudioEngineMeterSnapshot,
	applyPreviewAudioEngineMix,
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
	it("publishes the new seek epoch before notifying buffering observers", async () => {
		const { engine, context } = await setup();
		await engine.play();
		context.currentTime = 8;
		const observed: number[] = [];
		engine.subscribe(() => {
			if (engine.getPlaybackState() === "buffering")
				observed.push(engine.getCurrentTime());
		});
		await engine.setTime(2);
		expect(observed.length).toBeGreaterThan(0);
		expect(observed.every((time) => time === 2)).toBe(true);
	});

	it("holds the latest seek during buffering and discards the previous presentation epoch", async () => {
		vi.useFakeTimers();
		vi.advanceTimersByTime(1000);
		const late = deferred<MediaWindowTrackState[]>();
		const provider = createProvider((options, end) =>
			options.startSeconds === 4
				? late.promise
				: states(options.startSeconds, end, ["audio-1", "audio-2"]),
		);
		const context = Object.assign(createLifecycleContext(), {
			getOutputTimestamp: () => ({
				contextTime: context.currentTime - 0.1,
				performanceTime: performance.now(),
			}),
		});
		const { engine } = await setup(provider, {
			createAudioContext: () => context,
			outputTimingEnabled: true,
		});
		await engine.play();
		context.currentTime = 0.5;
		expect(engine.getPresentationTime()).toBeCloseTo(0.4);
		const seek = engine.setTime(4);
		expect(engine.getPlaybackState()).toBe("buffering");
		context.currentTime = 1;
		expect(engine.getPresentationTime()).toBe(4);
		late.resolve(states(4, 6, ["audio-1", "audio-2"]));
		await seek;
		expect(engine.getPresentationTime()).toBe(4);
		vi.advanceTimersByTime(200);
		context.currentTime = 1.2;
		expect(engine.getPresentationTime()).toBeCloseTo(4.1);
	});

	it("keeps scheduling, clipping, rates, seeks, and cleanup identical to baseline", async () => {
		vi.useFakeTimers();
		vi.advanceTimersByTime(1000);
		const run = async (outputTimingEnabled: boolean) => {
			const context = {
				...createAudioContextSpy(),
				getOutputTimestamp: vi.fn(() => ({
					contextTime: context.currentTime - 0.1,
					performanceTime: performance.now(),
				})),
			};
			const { engine, provider } = await setup(undefined, {
				createAudioContext: () => context,
				outputTimingEnabled,
			});
			await engine.play();
			context.currentTime = 0.5;
			const rendering = engine.getCurrentTime();
			const presentation = engine.getPresentationTime();
			engine.setPlaybackEnd(1.5);
			await engine.setPlaybackRate(2);
			context.currentTime = 0.75;
			engine.getPresentationTime();
			await engine.setTime(1);
			engine.getPresentationTime();
			context.currentTime = 1;
			engine.getPresentationTime();
			engine.pause();
			expect(engine.getPresentationTime()).toBe(engine.getCurrentTime());
			await engine.play();
			context.currentTime = 1.1;
			engine.getPresentationTime();
			const schedule = context.createdSources.map((source) => ({
				start: source.start.mock.calls,
				stop: source.stop.mock.calls,
				rate: source.playbackRate.value,
			}));
			const metrics = engine.getMetrics();
			engine.destroy();
			expect(engine.getMetrics().activeTimers).toBe(0);
			return {
				rendering,
				presentation,
				schedule,
				metrics,
				pulls: provider.pulls,
			};
		};
		const baseline = await run(false);
		const candidate = await run(true);
		expect(candidate.rendering).toBe(baseline.rendering);
		expect(candidate.presentation).toBeCloseTo(0.4);
		expect(baseline.presentation).toBe(0.5);
		expect(candidate.schedule).toEqual(baseline.schedule);
		expect(candidate.metrics).toEqual(baseline.metrics);
		expect(candidate.pulls).toEqual(baseline.pulls);
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

describe("Preview audio context interruptions", () => {
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

	it("invokes gesture resume synchronously and does not retry alternating unavailable reports", async () => {
		const context = createLifecycleContext();
		context.state = "suspended";
		context.resume.mockRejectedValue(new Error("Gesture required"));
		const { engine } = await setup(undefined, {
			createAudioContext: () => context,
		});
		const play = engine.play();
		expect(context.resume).toHaveBeenCalledTimes(1);
		await play;
		expect(engine.getPlaybackState()).toBe("recovery-required");
		context.changeState("interrupted");
		await flushMicrotasks();
		const attempts = context.resume.mock.calls.length;
		context.changeState("suspended");
		context.changeState("interrupted");
		await flushMicrotasks();
		expect(context.resume).toHaveBeenCalledTimes(attempts);
		expect(context.createdSources).toHaveLength(0);
	});

	it("keeps pause authoritative while recovery's replacement window is decoding", async () => {
		const context = createLifecycleContext();
		const late = deferred<MediaWindowTrackState[]>();
		let recovering = false;
		const provider = createProvider((options, end) =>
			recovering
				? late.promise
				: states(options.startSeconds, end, ["audio-1", "audio-2"]),
		);
		const { engine } = await setup(provider, {
			createAudioContext: () => context,
		});
		await engine.play();
		context.currentTime = 0.5;
		context.resume.mockRejectedValue(new Error("Gesture required"));
		context.changeState("suspended");
		await flushMicrotasks();
		recovering = true;
		context.changeState("running");
		expect(engine.getPlaybackState()).toBe("buffering");
		engine.pause();
		const created = context.createdSources.length;
		late.resolve(states(0.5, 2.5, ["audio-1", "audio-2"]));
		await flushMicrotasks();
		expect(engine.getPlaybackState()).toBe("paused");
		expect(context.createdSources).toHaveLength(created);
		expect(engine.getCurrentTime()).toBe(0.5);
	});

	it("freezes audio time, stops sources and pulls, and recovers a fresh bounded window on running", async () => {
		vi.useFakeTimers();
		const context = createLifecycleContext();
		const { engine, provider } = await setup(undefined, {
			createAudioContext: () => context,
		});
		await engine.play();
		context.currentTime = 0.7;
		context.resume.mockRejectedValue(new Error("Gesture required"));
		context.changeState("interrupted");
		await flushMicrotasks();
		expect(engine.getPlaybackState()).toBe("recovery-required");
		expect(engine.getStatus()).toBe("ready");
		expect(engine.getCurrentTime()).toBeCloseTo(0.7);
		expect(
			context.createdSources.every(
				(source) => source.stop.mock.calls.length === 1,
			),
		).toBe(true);
		const pulls = provider.pulls.length;
		context.currentTime = 50;
		await vi.advanceTimersByTimeAsync(5_000);
		expect(provider.pulls).toHaveLength(pulls);
		expect(engine.getCurrentTime()).toBeCloseTo(0.7);
		expect(context.resume).toHaveBeenCalledTimes(1);
		context.changeState("running");
		await flushMicrotasks();
		expect(engine.getPlaybackState()).toBe("playing");
		expect(provider.openGeneration).toHaveBeenLastCalledWith(
			expect.objectContaining({ startSeconds: 0.7 }),
		);
		context.currentTime = 50.2;
		expect(engine.getCurrentTime()).toBeCloseTo(0.9);
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
		expect(engine.getPlaybackState()).toBe("recovery-required");
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

	it("cancels deferred recovery on pause without allowing a later running event to restart playback", async () => {
		const context = createLifecycleContext();
		const { engine } = await setup(undefined, {
			createAudioContext: () => context,
		});
		await engine.play();
		const pending = deferred<void>();
		context.resume.mockImplementation(() => pending.promise);
		context.changeState("suspended");
		engine.pause();
		expect(engine.getPlaybackState()).toBe("paused");
		context.changeState("running");
		pending.resolve();
		await flushMicrotasks();
		expect(engine.getPlaybackState()).toBe("paused");
		expect(engine.getMetrics().activeTimers).toBe(0);
		expect(
			context.createdSources.every(
				(source) => source.stop.mock.calls.length === 1,
			),
		).toBe(true);
	});

	it("publishes a closed context terminal state and never attempts to resume it", async () => {
		const context = createLifecycleContext();
		const { engine } = await setup(undefined, {
			createAudioContext: () => context,
		});
		const observed: string[] = [];
		engine.subscribe(() => observed.push(engine.getPlaybackState()));
		await engine.play();
		context.changeState("closed");
		await engine.play();
		await engine.setTime(4);
		engine.pause();
		expect(engine.getPlaybackState()).toBe("closed");
		expect(engine.getStatus()).toBe("ready");
		expect(context.resume).not.toHaveBeenCalled();
		expect(observed).toContain("closed");
		expect(engine.getMetrics().activeTimers).toBe(0);
	});

	it("disposes externally closed contexts without closing them a second time", async () => {
		const context = createLifecycleContext();
		const { engine } = await setup(undefined, {
			createAudioContext: () => context,
		});
		await engine.play();
		context.changeState("closed");
		context.close.mockImplementation(() =>
			Promise.reject(new DOMException("Already closed", "InvalidStateError")),
		);
		engine.destroy();
		await flushMicrotasks();
		expect(context.close).not.toHaveBeenCalled();
		expect(context.listeners.size).toBe(0);
		expect(engine.getPlaybackState()).toBe("closed");
		expect(engine.getMetrics().engine.cleanupCount).toBe(1);
		expect(engine.getMetrics().engine.retainedPcmBytes).toBe(0);
	});

	it("reports disposed playback as closed even if disposal began while playing", async () => {
		const { engine } = await setup();
		await engine.play();
		engine.destroy();
		expect(engine.getPlaybackState()).toBe("closed");
		await engine.play();
		expect(engine.getPlaybackState()).toBe("closed");
	});

	it("removes listeners and invalidates pending recovery on asset disposal", async () => {
		const context = createLifecycleContext();
		const { engine } = await setup(undefined, {
			createAudioContext: () => context,
		});
		await engine.play();
		const pending = deferred<void>();
		context.resume.mockImplementation(() => pending.promise);
		context.changeState("suspended");
		const created = context.createdSources.length;
		engine.destroy();
		expect(context.listeners.size).toBe(0);
		context.changeState("running");
		pending.resolve();
		await flushMicrotasks();
		expect(context.createdSources).toHaveLength(created);
		expect(context.close).toHaveBeenCalledTimes(1);
		expect(engine.getMetrics().engine.retainedPcmBytes).toBe(0);
		expect(engine.getMetrics().activeTimers).toBe(0);
	});

	it("recovers using suspended reporting when the browser has no interrupted state", async () => {
		const context = createLifecycleContext();
		const { engine } = await setup(undefined, {
			createAudioContext: () => context,
		});
		await engine.play();
		context.resume.mockImplementation(async () =>
			context.changeState("running"),
		);
		context.changeState("suspended");
		await flushMicrotasks();
		expect(context.resume).toHaveBeenCalledTimes(1);
		expect(engine.getPlaybackState()).toBe("playing");
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
	it("smooths only playing output changes and settles automation before paused resume or routing rebuild", async () => {
		const { engine, context } = await setup();
		const output = context.createdGains[0].gain;
		engine.setOutputGain(0.5);
		expect(output.value).toBe(0.5);
		expect(output.linearRampToValueAtTime).not.toHaveBeenCalled();
		await engine.play();
		context.currentTime = 1;
		engine.setOutputGain(0);
		expect(output.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 1.008);
		context.currentTime = 1.004;
		engine.setOutputGain(1);
		expect(output.setValueAtTime.mock.calls.at(-1)?.[0]).toBeCloseTo(0.25);
		expect(output.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, 1.012);
		engine.pause();
		expect(output.value).toBe(1);
		expect(output.cancelScheduledValues).toHaveBeenLastCalledWith(1.004);
		const ramps = output.linearRampToValueAtTime.mock.calls.length;
		await engine.play();
		expect(output.linearRampToValueAtTime).toHaveBeenCalledTimes(ramps);
		engine.setOutputGain(0);
		engine.setTrackChannelMode(0, "use-left-as-mono");
		expect(output.value).toBe(0);
		await engine.play();
		expect(output.linearRampToValueAtTime).toHaveBeenCalledTimes(ramps + 1);
	});
	it("settles pending output automation across seek and rate changes and isolates destroyed assets", async () => {
		const { engine, context } = await setup();
		const output = context.createdGains[0].gain;
		await engine.play();
		context.currentTime = 0.1;
		engine.setOutputGain(0);
		await engine.setTime(4);
		expect(output.value).toBe(0);
		engine.setOutputGain(0.5);
		await engine.setPlaybackRate(2);
		expect(output.value).toBe(0.5);
		engine.setOutputGain(1);
		engine.destroy();
		expect(output.value).toBe(0);
		const rampCount = output.linearRampToValueAtTime.mock.calls.length;
		engine.setOutputGain(0.75);
		expect(output.linearRampToValueAtTime).toHaveBeenCalledTimes(rampCount);
		const replacement = await setup();
		replacement.engine.setOutputGain(0.25);
		expect(replacement.context.createdGains[0].gain.value).toBe(0.25);
		expect(
			replacement.context.createdGains[0].gain.linearRampToValueAtTime,
		).not.toHaveBeenCalled();
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
		engine.setTrackMonitorGain(0, 1);
		engine.setTrackVolumeGain(0, 0.5);
		expect(track.value).toBe(0.5);
		await engine.play();
		for (const reset of [
			async () => engine.pause(),
			async () => engine.setTime(4),
			async () => engine.setPlaybackRate(2),
			async () => engine.setTrackChannelMode(0, "use-left-as-mono"),
		]) {
			context.currentTime += 0.01;
			engine.setTrackMonitorGain(0, 0);
			expect(track.linearRampToValueAtTime.mock.calls.at(-1)?.[0]).toBe(0);
			await reset();
			expect(track.value).toBe(0);
			expect(track.cancelScheduledValues).toHaveBeenLastCalledWith(
				context.currentTime,
			);
			engine.pause();
			const count = track.linearRampToValueAtTime.mock.calls.length;
			engine.setTrackMonitorGain(0, 1);
			expect(track.value).toBe(0.5);
			await engine.play();
			expect(track.linearRampToValueAtTime).toHaveBeenCalledTimes(count);
		}
		engine.setTrackVolumeGain(0, 0.75);
		engine.destroy();
		expect(track.value).toBe(0);
		const calls = track.setValueAtTime.mock.calls.length;
		engine.setTrackVolumeGain(0, 1);
		engine.setTrackMonitorGain(0, 1);
		expect(track.setValueAtTime).toHaveBeenCalledTimes(calls);
		const replacement = await setup();
		replacement.engine.setTrackMonitorGain(0, 1);
		expect(replacement.context.createdGains[2].gain.value).toBe(1);
		expect(
			replacement.context.createdGains[2].gain.linearRampToValueAtTime,
		).not.toHaveBeenCalled();
	});
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
		expect(context.createdGains[0]?.gain.value).toBeCloseTo(0.6);
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
