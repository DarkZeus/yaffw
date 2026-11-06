import { describe, expect, it, vi } from "vitest";

import {
	type ScheduledWindowAudioContextLike,
	createScheduledWindowEngine,
} from "../engine/scheduled-window-engine";

describe("createScheduledWindowEngine", () => {
	it("invalidates scheduled nodes across pause, speed, routing, and generation changes", async () => {
		const context = createAudioContextSpy();
		const engine = createScheduledWindowEngine({
			createAudioContext: () => context,
			durationSeconds: 30,
			horizonSeconds: 3,
			lowWaterSeconds: 1,
			trackIds: ["audio-1"],
		});
		engine.beginGeneration({ generationId: 1, startSeconds: 4 });
		engine.applyTrackStates({
			generationId: 1,
			tracks: [playableTrack("audio-1", 4, 7, [chunk(4, 7)])],
		});
		await engine.play();
		const firstSource = context.createdSources[0];

		context.currentTime = 0.5;
		engine.pause();
		expect(engine.getCurrentTime()).toBe(4.5);
		expect(firstSource?.stop).toHaveBeenCalledOnce();

		engine.setPlaybackRate(2);
		await engine.play();
		expect(context.createdSources[1]?.start).toHaveBeenCalledWith(0.5, 0.5);
		expect(context.createdSources[1]?.playbackRate.value).toBe(2);

		engine.rebuildTrackRouting("audio-1");
		expect(context.createdSources[1]?.stop).toHaveBeenCalledOnce();
		expect(context.createdSources).toHaveLength(3);

		engine.beginGeneration({ generationId: 2, startSeconds: 12 });
		expect(engine.applyTrackStates({ generationId: 1, tracks: [] })).toBe(
			false,
		);
		expect(engine.getMetrics().staleTrackStatePublications).toBe(1);
		expect(engine.getCurrentTime()).toBe(12);
	});

	it("records an underrun after scheduled coverage expires and releases PCM on teardown", async () => {
		const context = createAudioContextSpy();
		const engine = createScheduledWindowEngine({
			createAudioContext: () => context,
			durationSeconds: 30,
			horizonSeconds: 1,
			lowWaterSeconds: 0.25,
			trackIds: ["audio-1"],
		});
		engine.beginGeneration({ generationId: 1, startSeconds: 0 });
		engine.applyTrackStates({
			generationId: 1,
			tracks: [playableTrack("audio-1", 0, 1, [chunk(0, 1)])],
		});
		await engine.play();

		context.currentTime = 0.4;
		context.createdSources[0]?.emitEnded();
		engine.tick();
		expect(engine.getMetrics().underruns).toBe(1);
		context.currentTime = 0.6;
		engine.tick();
		expect(engine.getMetrics().totalUnderrunSeconds).toBeCloseTo(0.2);
		expect(engine.getMetrics().maxUnderrunSeconds).toBeCloseTo(0.2);
		context.currentTime = 1.1;
		engine.tick();
		expect(engine.getMetrics().retainedPcmBytes).toBe(0);

		await engine.destroy();
		await engine.destroy();
		expect(context.close).toHaveBeenCalledOnce();
		expect(engine.getMetrics().cleanupCount).toBe(1);
	});
});

function playableTrack(
	trackId: string,
	startSeconds: number,
	endSeconds: number,
	chunks: ReturnType<typeof chunk>[],
) {
	return {
		chunks,
		endSeconds,
		kind: "playable" as const,
		startSeconds,
		trackId,
	};
}

function chunk(startSeconds: number, endSeconds: number) {
	return {
		audioBuffer: createAudioBuffer(endSeconds - startSeconds),
		endSeconds,
		startSeconds,
	};
}

function createAudioBuffer(duration: number): AudioBuffer {
	const sampleRate = 48_000;
	const numberOfChannels = 2;
	return {
		duration,
		length: duration * sampleRate,
		numberOfChannels,
		sampleRate,
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
				emitEnded() {
					source.onended?.();
				},
				onended: null as (() => void) | null,
				playbackRate: { value: 1 },
				start: vi.fn(),
				stop: vi.fn(),
			};
			context.createdSources.push(source);
			return source;
		}),
		createGain: vi.fn(() => {
			const gain = {
				connect: vi.fn(),
				disconnect: vi.fn(),
				gain: { value: 1 },
			};
			context.createdGains.push(gain);
			return gain;
		}),
		createdGains: [] as Array<{
			connect: ReturnType<typeof vi.fn>;
			disconnect: ReturnType<typeof vi.fn>;
			gain: { value: number };
		}>,
		createdSources: [] as Array<{
			buffer: AudioBuffer | null;
			connect: ReturnType<typeof vi.fn>;
			disconnect: ReturnType<typeof vi.fn>;
			emitEnded: () => void;
			onended: (() => void) | null;
			playbackRate: { value: number };
			start: ReturnType<typeof vi.fn>;
			stop: ReturnType<typeof vi.fn>;
		}>,
		currentTime: 0,
		destination: { connect: vi.fn(), disconnect: vi.fn() },
		resume: vi.fn(),
	};

	return context satisfies ScheduledWindowAudioContextLike & typeof context;
}
