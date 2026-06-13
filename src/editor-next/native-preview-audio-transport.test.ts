import { describe, expect, it } from "vitest";

import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import type { ReadyMediaAsset } from "@/editor-core/model";

import type { BrowserAudioPreviewSource } from "./browser-audio-preview-sources";
import {
	createMultitrackPreviewTracks,
	previewVolumeForAudioTrackSource,
} from "./native-preview-audio-transport";

describe("native preview audio transport", () => {
	it("builds multitrack preview inputs from prepared track sources and audio mix decisions", () => {
		const source = createAudioPreviewSource("audio-1", 1.25);

		expect(createMultitrackPreviewTracks([source])).toEqual([
			{
				id: "audio-1",
				options: {
					barGap: 0,
					barWidth: 1,
					height: 0,
					progressColor: "transparent",
					waveColor: "transparent",
				},
				startPosition: 1.25,
				url: "blob:audio-1",
				volume: 0,
			},
		]);

		const audioMix = createDefaultAudioMix(readyAssetWithAudio);
		const audioDecision = audioMix.tracks["audio-1"];

		if (!audioDecision) {
			throw new Error("Expected audio-1 default mix decision.");
		}

		audioDecision.volumePercent = 50;

		expect(
			previewVolumeForAudioTrackSource({
				audioMix,
				muted: false,
				soloedAudioTrackId: null,
				source,
				volume: 0.8,
			}),
		).toBeCloseTo(0.2);

		audioDecision.include = false;

		expect(
			previewVolumeForAudioTrackSource({
				audioMix,
				muted: false,
				soloedAudioTrackId: null,
				source,
				volume: 0.8,
			}),
		).toBe(0);

		expect(
			previewVolumeForAudioTrackSource({
				audioMix,
				muted: false,
				soloedAudioTrackId: "audio-1",
				source,
				volume: 0.8,
			}),
		).toBeCloseTo(0.2);
		expect(
			previewVolumeForAudioTrackSource({
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
		blob: new Blob(["audio"], { type: "audio/mp4" }),
		byteLength: 5,
		downloadName: `${trackId}.m4a`,
		mimeType: "audio/mp4",
		startPositionSeconds,
		strategy: "same-codec-remux",
		track: {
			id: trackId,
			kind: "audio",
		},
		trackId,
		trackIndex: 0,
		url: `blob:${trackId}`,
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
