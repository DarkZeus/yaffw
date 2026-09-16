import { describe, expect, it, vi } from "vitest";

import {
	type ScheduledWindowAudioContextLike,
	createScheduledWindowEngine,
} from "../engine/scheduled-window-engine";

describe("createScheduledWindowEngine", () => {
	it("waits for every track outcome and schedules playable chunks from one AudioContext epoch", async () => {
		const context = createAudioContextSpy();
		context.currentTime = 5;
		const engine = createScheduledWindowEngine({
			createAudioContext: () => context,
			durationSeconds: 30,
			horizonSeconds: 2,
			lowWaterSeconds: 0.75,
			trackIds: ["audio-1", "audio-2"],
		});

		engine.beginGeneration({ generationId: 1, startSeconds: 10 });
		engine.applyTrackStates({
			generationId: 1,
			tracks: [playableTrack("audio-1", 10, 12, [chunk("audio-1", 10, 11)])],
		});
		expect(engine.getStatus()).toBe("preparing");

		engine.applyTrackStates({
			generationId: 1,
			tracks: [
				playableTrack("audio-2", 10, 12, [chunk("audio-2", 10.5, 11.5)]),
			],
		});
		expect(engine.getStatus()).toBe("ready");

		engine.setTrackGain("audio-1", 0.5);
		await engine.play();

		expect(context.createdSources).toHaveLength(2);
		expect(context.createdSources[0]?.start).toHaveBeenCalledWith(5, 0);
		expect(context.createdSources[1]?.start).toHaveBeenCalledWith(5.5, 0);
		expect(context.createdGains[0]?.gain.value).toBe(0.5);
		expect(context.createdGains[1]?.gain.value).toBe(1);
		expect(engine.getMetrics().retainedPcmBytes).toBe(768_000);
		expect(engine.getMetrics().sourceNodesCreated).toBe(2);
		expect(engine.getMetrics().peakLiveSourceNodes).toBe(2);
	});

	it("preserves known silence, isolates failure, and requests lookahead only at low water", async () => {
		const context = createAudioContextSpy();
		const engine = createScheduledWindowEngine({
			createAudioContext: () => context,
			durationSeconds: 20,
			horizonSeconds: 2,
			lowWaterSeconds: 0.5,
			trackIds: ["audio-1", "audio-2"],
		});

		engine.beginGeneration({ generationId: 4, startSeconds: 0 });
		engine.applyTrackStates({
			generationId: 4,
			tracks: [
				{
					kind: "silence",
					trackId: "audio-1",
					startSeconds: 0,
					endSeconds: 2,
					state: "silence",
				},
				{
					kind: "failure",
					trackId: "audio-2",
					startSeconds: 0,
					endSeconds: 2,
					reason: "decoder unavailable",
					state: "failure",
				},
			],
		});

		expect(engine.getStatus()).toBe("degraded");
		await engine.play();
		expect(context.createdSources).toHaveLength(0);

		context.currentTime = 1.25;
		expect(engine.tick()).toEqual({
			needsLookahead: false,
			throughSeconds: 3.25,
		});
		context.currentTime = 1.6;
		expect(engine.tick()).toEqual({
			needsLookahead: true,
			throughSeconds: 3.6,
		});
	});

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
			tracks: [playableTrack("audio-1", 4, 7, [chunk("audio-1", 4, 7)])],
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
			tracks: [playableTrack("audio-1", 0, 1, [chunk("audio-1", 0, 1)])],
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

	it("preserves sample-rounded PCM tails across adjacent refill publications", async () => {
		const context = createAudioContextSpy();
		const engine = createScheduledWindowEngine({
			createAudioContext: () => context,
			durationSeconds: 30,
			horizonSeconds: 2,
			lowWaterSeconds: 1.5,
			trackIds: ["audio-1"],
		});
		const publicationBoundary = 2.500011;
		const sampleBoundary = Math.round(publicationBoundary * 48_000) / 48_000;
		const previousChunk = chunk("audio-1", 2.4, sampleBoundary);
		engine.beginGeneration({ generationId: 1, startSeconds: 0 });
		engine.applyTrackStates({
			generationId: 1,
			tracks: [
				playableTrack("audio-1", 0, publicationBoundary, [previousChunk]),
			],
		});
		await engine.play();
		const previousSource = context.createdSources[0];

		context.currentTime = 1.05;
		engine.applyTrackStates({
			generationId: 1,
			tracks: [
				playableTrack("audio-1", publicationBoundary, 3.05, [
					chunk("audio-1", sampleBoundary, 2.7),
				]),
			],
		});

		expect(previousSource?.stop).not.toHaveBeenCalled();
		expect(previousSource?.buffer).toBe(previousChunk.audioBuffer);
		expect(context.createdSources[1]?.start).toHaveBeenCalledWith(
			sampleBoundary,
			0,
		);

		// A replacement inside existing coverage must still stop the old source.
		engine.applyTrackStates({
			generationId: 1,
			tracks: [
				playableTrack("audio-1", 2.4, 2.5, [chunk("audio-1", 2.4, 2.5)]),
			],
		});
		expect(previousSource?.stop).toHaveBeenCalledOnce();
		expect(previousSource?.buffer).toBeNull();
		expect(context.createdSources[1]?.stop).not.toHaveBeenCalled();
		await engine.destroy();
	});

	it("clips scheduled chunks at the selection-loop boundary", async () => {
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
			tracks: [playableTrack("audio-1", 4, 7, [chunk("audio-1", 4, 7)])],
		});
		engine.setPlaybackEnd(6);

		await engine.play();

		expect(context.createdSources[0]?.start).toHaveBeenCalledWith(0, 0, 2);
		context.currentTime = 2.1;
		expect(engine.tick()).toEqual({ needsLookahead: false, throughSeconds: 6 });
		expect(engine.getMetrics().underruns).toBe(0);
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
		state: "playable" as const,
		trackId,
	};
}

function chunk(trackId: string, startSeconds: number, endSeconds: number) {
	return {
		audioBuffer: createAudioBuffer(endSeconds - startSeconds),
		endSeconds,
		startSeconds,
		trackId,
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
