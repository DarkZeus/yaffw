import { describe, expect, it, vi } from "vitest";

import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import type { ReadyMediaAsset } from "@/editor-core/model";

import type { BrowserAudioPreviewSource } from "./browser-audio-preview-sources.types";
import {
	createPreviewAudioEngine,
	previewGainForAudioTrackSource,
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

		engine.setTrackGain(0, 0.5);
		engine.setTrackGain(1, 0.25);
		engine.setPlaybackRate(1.5);
		engine.setTime(0.5);
		await engine.play();

		expect(context.resume).toHaveBeenCalledTimes(1);
		expect(context.createdSources).toHaveLength(2);
		expect(context.createdSources[0]?.playbackRate.value).toBe(1.5);
		expect(context.createdSources[0]?.start).toHaveBeenCalledWith(0, 0.5);
		expect(context.createdSources[1]?.start).toHaveBeenCalledWith(0.5, 0);
		expect(context.createdGains[0]?.gain.value).toBe(0.5);
		expect(context.createdGains[1]?.gain.value).toBe(0.25);

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

	it("resolves preview gains from audio mix decisions and preview-only monitoring state", () => {
		const source = createAudioPreviewSource("audio-1", 1.25);
		const audioMix = createDefaultAudioMix(readyAssetWithAudio);
		const audioDecision = audioMix.tracks["audio-1"];

		if (!audioDecision) {
			throw new Error("Expected audio-1 default mix decision.");
		}

		audioDecision.volumePercent = 50;

		expect(
			previewGainForAudioTrackSource({
				audioMix,
				muted: false,
				soloedAudioTrackId: null,
				source,
				volume: 0.8,
			}),
		).toBeCloseTo(0.2);

		audioDecision.include = false;

		expect(
			previewGainForAudioTrackSource({
				audioMix,
				muted: false,
				soloedAudioTrackId: null,
				source,
				volume: 0.8,
			}),
		).toBe(0);

		expect(
			previewGainForAudioTrackSource({
				audioMix,
				muted: false,
				soloedAudioTrackId: "audio-1",
				source,
				volume: 0.8,
			}),
		).toBeCloseTo(0.2);
		expect(
			previewGainForAudioTrackSource({
				audioMix,
				muted: false,
				soloedAudioTrackId: "audio-1",
				source: createAudioPreviewSource("audio-2", 1.25),
				volume: 0.8,
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

function createAudioContextSpy() {
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
		createdSources: [] as Array<
			ReturnType<typeof createAudioNodeSpy> & {
				buffer: AudioBuffer | null;
				playbackRate: { value: number };
				start: ReturnType<typeof vi.fn>;
				stop: ReturnType<typeof vi.fn>;
			}
		>,
		currentTime: 0,
		decodeAudioData: vi.fn(async () => createAudioBufferStub()),
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

function createAudioBufferStub(): AudioBuffer {
	return {
		duration: 10,
		length: 480_000,
		numberOfChannels: 2,
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
