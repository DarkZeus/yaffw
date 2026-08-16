import { describe, expect, it, vi } from "vitest";

import type {
	MediaWindowProvider,
	MediaWindowPullResult,
} from "../prototype/playhead-window/media-window-provider";
import {
	type PlayheadWindowPrototypeAudioContextFactory,
	createPlayheadWindowPrototype,
} from "../prototype/playhead-window/playhead-window-prototype";

describe("createPlayheadWindowPrototype", () => {
	it("blocks playback on the all-track readiness barrier", async () => {
		const context = createAudioContextSpy();
		const initialPull = createDeferred<MediaWindowPullResult>();
		const provider = createProviderSpy({
			pull: () => initialPull.promise,
		});
		const prototype = createPlayheadWindowPrototype({
			createAudioContext: () => context,
			horizonSeconds: 2,
			lowWaterSeconds: 0.5,
			provider,
		});

		const preparation = prototype.prepare(4);
		const playback = prototype.play();
		expect(prototype.getStatus()).toBe("preparing");
		expect(context.resume).not.toHaveBeenCalled();

		initialPull.resolve({
			endSeconds: 6,
			generationId: 1,
			startSeconds: 4,
			tracks: [
				playable("audio-1", 4, 6),
				{
					kind: "silence",
					trackId: "audio-2",
					startSeconds: 4,
					endSeconds: 6,
					state: "silence",
				},
			],
		});
		await preparation;
		await playback;

		expect(prototype.getStatus()).toBe("ready");
		expect(context.resume).toHaveBeenCalledOnce();
		expect(context.createdSources).toHaveLength(1);
	});

	it("invalidates generations for seek, rate changes, routing rebuild, and selection looping", async () => {
		const context = createAudioContextSpy();
		const provider = createProviderSpy();
		const prototype = createPlayheadWindowPrototype({
			createAudioContext: () => context,
			horizonSeconds: 2,
			lowWaterSeconds: 0.5,
			provider,
		});
		await prototype.prepare(0);
		await prototype.play();

		context.currentTime = 0.5;
		await prototype.seek(8);
		expect(provider.openCalls.map((call) => call.startSeconds)).toEqual([0, 8]);
		expect(provider.generations[0]?.cancel).toHaveBeenCalledOnce();
		expect(prototype.getCurrentTime()).toBe(8);

		await prototype.setPlaybackRate(2);
		expect(provider.openCalls.at(-1)?.startSeconds).toBe(8);

		await prototype.rebuildTrackRouting("audio-1");
		expect(provider.openCalls.at(-1)?.startSeconds).toBe(8);

		prototype.setLoop({ startSeconds: 3, endSeconds: 4 });
		context.currentTime = 1;
		const { tick } = prototype;
		await tick();
		expect(provider.openCalls.at(-1)?.startSeconds).toBe(3);
		expect(prototype.getCurrentTime()).toBe(3);
		expect(prototype.getMetrics().generationsCancelled).toBeGreaterThanOrEqual(
			4,
		);

		await prototype.seek(30);
		expect(prototype.getCurrentTime()).toBe(30);
		expect(prototype.getStatus()).toBe("ready");
	});

	it("does not let an obsolete lookahead pull suppress the next generation", async () => {
		const context = createAudioContextSpy();
		const staleLookahead = createDeferred<MediaWindowPullResult>();
		let firstGenerationPulls = 0;
		const provider = createProviderSpy({
			pull: ({ generationId, startSeconds, trackIds }) => {
				if (generationId === 1 && firstGenerationPulls++ > 0) {
					return staleLookahead.promise;
				}
				return Promise.resolve({
					endSeconds: startSeconds + 2,
					generationId,
					startSeconds,
					tracks: trackIds.map((trackId) =>
						playable(trackId, startSeconds, startSeconds + 2),
					),
				});
			},
		});
		const prototype = createPlayheadWindowPrototype({
			createAudioContext: () => context,
			horizonSeconds: 2,
			lowWaterSeconds: 0.5,
			provider,
		});
		await prototype.prepare(0);
		await prototype.play();

		context.currentTime = 1.6;
		const obsoleteTick = prototype.tick();
		await prototype.seek(4);
		context.currentTime = 3.2;
		await prototype.tick();

		expect(provider.generations[1]?.pullThrough).toHaveBeenCalledTimes(2);
		staleLookahead.resolve({
			endSeconds: 3.6,
			generationId: 1,
			startSeconds: 2,
			tracks: [playable("audio-1", 2, 3.6), playable("audio-2", 2, 3.6)],
		});
		await obsoleteTick;
	});

	it("drops stale pulls and retries only the failed track", async () => {
		const context = createAudioContextSpy();
		const stalePull = createDeferred<MediaWindowPullResult>();
		const provider = createProviderSpy({
			pull: ({ generationId, startSeconds, trackIds }) => {
				if (generationId === 1) {
					return stalePull.promise;
				}

				if (trackIds.length === 1) {
					return Promise.resolve({
						endSeconds: startSeconds + 2,
						generationId,
						startSeconds,
						tracks: [
							playable(
								trackIds[0] ?? "audio-2",
								startSeconds,
								startSeconds + 2,
							),
						],
					});
				}

				return Promise.resolve({
					endSeconds: startSeconds + 2,
					generationId,
					startSeconds,
					tracks: [
						playable("audio-1", startSeconds, startSeconds + 2),
						{
							kind: "failure",
							trackId: "audio-2",
							startSeconds,
							endSeconds: startSeconds + 2,
							reason: "decode failed",
							state: "failure",
						},
					],
				});
			},
		});
		const prototype = createPlayheadWindowPrototype({
			createAudioContext: () => context,
			horizonSeconds: 2,
			lowWaterSeconds: 0.5,
			provider,
		});

		const obsoletePreparation = prototype.prepare(0);
		await prototype.seek(5);
		stalePull.resolve({
			endSeconds: 2,
			generationId: 1,
			startSeconds: 0,
			tracks: [playable("audio-1", 0, 2), playable("audio-2", 0, 2)],
		});
		await obsoletePreparation;

		expect(prototype.getCurrentTime()).toBe(5);
		expect(prototype.getStatus()).toBe("degraded");
		expect(prototype.getMetrics().stalePullResults).toBe(1);

		await prototype.retryTrack("audio-2");
		expect(provider.openCalls.at(-1)?.trackIds).toEqual(["audio-2"]);
		expect(prototype.getStatus()).toBe("ready");
		expect(prototype.getMetrics().trackRetries).toBe(1);
	});

	it("replaces Media ownership and tears down every retained resource idempotently", async () => {
		const firstContext = createAudioContextSpy();
		const secondContext = createAudioContextSpy();
		const contexts = [firstContext, secondContext];
		const createAudioContext = vi.fn(
			() => contexts.shift() ?? createAudioContextSpy(),
		) satisfies PlayheadWindowPrototypeAudioContextFactory;
		const firstProvider = createProviderSpy();
		const secondProvider = createProviderSpy({
			trackIds: ["replacement-audio"],
		});
		const prototype = createPlayheadWindowPrototype({
			createAudioContext,
			horizonSeconds: 2,
			lowWaterSeconds: 0.5,
			provider: firstProvider,
		});
		await prototype.prepare(0);

		await prototype.replaceProvider(secondProvider, 7);
		expect(firstProvider.dispose).toHaveBeenCalledOnce();
		expect(firstContext.close).toHaveBeenCalledOnce();
		expect(prototype.getCurrentTime()).toBe(7);

		await prototype.destroy();
		await prototype.destroy();
		expect(secondProvider.dispose).toHaveBeenCalledOnce();
		expect(secondContext.close).toHaveBeenCalledOnce();
		expect(prototype.getMetrics().cleanupCount).toBe(1);
		expect(prototype.getMetrics().engine.retainedPcmBytes).toBe(0);
	});
});

function playable(trackId: string, startSeconds: number, endSeconds: number) {
	return {
		chunks: [
			{
				audioBuffer: createAudioBuffer(endSeconds - startSeconds),
				endSeconds,
				startSeconds,
				trackId,
			},
		],
		endSeconds,
		kind: "playable" as const,
		startSeconds,
		state: "playable" as const,
		trackId,
	};
}

function createProviderSpy({
	durationSeconds = 30,
	pull,
	trackIds = ["audio-1", "audio-2"],
}: {
	durationSeconds?: number;
	pull?: (request: {
		generationId: number;
		startSeconds: number;
		trackIds: readonly string[];
	}) => Promise<MediaWindowPullResult>;
	trackIds?: readonly string[];
} = {}) {
	let generationId = 0;
	const provider = {
		dispose: vi.fn(async () => {}),
		durationSeconds,
		generations: [] as Array<{
			cancel: ReturnType<typeof vi.fn>;
			id: number;
			pullThrough: ReturnType<typeof vi.fn>;
			startSeconds: number;
			trackIds: readonly string[];
		}>,
		openCalls: [] as Array<{
			startSeconds: number;
			trackIds: readonly string[];
		}>,
		openGeneration({
			startSeconds,
			trackIds: requestedTrackIds,
		}: Parameters<MediaWindowProvider["openGeneration"]>[0]) {
			generationId += 1;
			const selectedTrackIds = requestedTrackIds
				? Array.from(requestedTrackIds)
				: [...trackIds];
			provider.openCalls.push({ startSeconds, trackIds: selectedTrackIds });
			const generation = {
				cancel: vi.fn(async () => {}),
				id: generationId,
				pullThrough: vi.fn(async (endSeconds: number) => {
					if (pull) {
						return pull({
							generationId,
							startSeconds,
							trackIds: selectedTrackIds,
						});
					}

					return {
						endSeconds,
						generationId,
						startSeconds,
						tracks: selectedTrackIds.map((trackId) =>
							playable(trackId, startSeconds, endSeconds),
						),
					};
				}),
				startSeconds,
				trackIds: selectedTrackIds,
			};
			provider.generations.push(generation);
			return generation;
		},
		trackIds,
	};

	return provider satisfies MediaWindowProvider & typeof provider;
}

function createAudioBuffer(duration: number): AudioBuffer {
	return {
		duration,
		length: duration * 48_000,
		numberOfChannels: 2,
		sampleRate: 48_000,
	} as AudioBuffer;
}

function createAudioContextSpy() {
	const context = {
		close: vi.fn(),
		createBufferSource: vi.fn(() => {
			const source = {
				buffer: null as AudioBuffer | null,
				connect: vi.fn(),
				disconnect: vi.fn(),
				onended: null as (() => void) | null,
				playbackRate: { value: 1 },
				start: vi.fn(),
				stop: vi.fn(),
			};
			context.createdSources.push(source);
			return source;
		}),
		createGain: vi.fn(() => ({
			connect: vi.fn(),
			disconnect: vi.fn(),
			gain: { value: 1 },
		})),
		createdSources: [] as Array<{
			buffer: AudioBuffer | null;
			connect: ReturnType<typeof vi.fn>;
			disconnect: ReturnType<typeof vi.fn>;
			onended: (() => void) | null;
			playbackRate: { value: number };
			start: ReturnType<typeof vi.fn>;
			stop: ReturnType<typeof vi.fn>;
		}>,
		currentTime: 0,
		destination: { connect: vi.fn(), disconnect: vi.fn() },
		resume: vi.fn(),
	};

	return context;
}

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});

	return { promise, resolve };
}
