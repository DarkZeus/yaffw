import { describe, expect, it, vi } from "vitest";

import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import type {
	AudioTrackChannelMode,
	ReadyMediaAsset,
} from "@/editor-core/model";

import {
	createBrowserAudioPreviewSourceCache,
	createBrowserAudioPreviewSourcePlanKey,
} from "./browser-audio-preview-source-cache";
import type { BrowserAudioPreviewSource } from "./browser-audio-preview-sources.types";

describe("BrowserAudioPreviewSourceCache", () => {
	it("plans only missing track variants and reuses cached preserve sources", () => {
		const revokeSources = vi.fn();
		const cache = createBrowserAudioPreviewSourceCache({ revokeSources });
		const preservePlanKey = createBrowserAudioPreviewSourcePlanKey({
			asset: readyAsset,
			audioMix: createAudioMix(),
		});

		cache.resetForMediaAssetSource({ asset: readyAsset, source });

		const preservePlan = cache.plan({
			asset: readyAsset,
			planKey: preservePlanKey,
		});

		expect(Array.from(preservePlan.missingTrackIds)).toEqual([
			"audio-1",
			"audio-2",
		]);
		expect(preservePlan.cachedSources).toEqual([]);
		expect(preservePlan.audioMix.tracks["audio-1"]?.channelMode).toBe(
			"preserve",
		);
		expect(preservePlan.audioMix.tracks["audio-1"]?.include).toBe(true);
		expect(preservePlan.audioMix.tracks["audio-1"]?.volumePercent).toBe(100);

		cache.storePreparedSources({
			plan: preservePlan,
			sources: [
				createPreviewSource("audio-1", "preserve"),
				createPreviewSource("audio-2", "preserve"),
			],
		});

		expect(
			cache
				.plan({ asset: readyAsset, planKey: preservePlanKey })
				.cachedSources.map((source) => source.url),
		).toEqual(["blob:audio-1:preserve", "blob:audio-2:preserve"]);

		const fixedVoicePlan = cache.plan({
			asset: readyAsset,
			planKey: createBrowserAudioPreviewSourcePlanKey({
				asset: readyAsset,
				audioMix: createAudioMix({ "audio-1": "use-left-as-mono" }),
			}),
		});

		expect(Array.from(fixedVoicePlan.missingTrackIds)).toEqual(["audio-1"]);
		expect(fixedVoicePlan.cachedSources.map((source) => source.url)).toEqual([
			"blob:audio-2:preserve",
		]);

		cache.storePreparedSources({
			plan: fixedVoicePlan,
			sources: [createPreviewSource("audio-1", "use-left-as-mono")],
		});

		expect(
			cache
				.plan({ asset: readyAsset, planKey: preservePlanKey })
				.cachedSources.map((source) => source.url),
		).toEqual(["blob:audio-1:preserve", "blob:audio-2:preserve"]);
		expect(revokeSources).not.toHaveBeenCalled();
	});

	it("disposes cached preview resources when the media asset source changes", () => {
		const revokeSources = vi.fn();
		const cache = createBrowserAudioPreviewSourceCache({ revokeSources });
		const preservePlanKey = createBrowserAudioPreviewSourcePlanKey({
			asset: readyAsset,
			audioMix: createAudioMix(),
		});
		const preservePlan = cache.plan({
			asset: readyAsset,
			planKey: preservePlanKey,
		});

		cache.resetForMediaAssetSource({ asset: readyAsset, source });
		cache.storePreparedSources({
			plan: preservePlan,
			sources: [
				createPreviewSource("audio-1", "preserve"),
				createPreviewSource("audio-2", "preserve"),
			],
		});

		cache.resetForMediaAssetSource({
			asset: {
				...readyAsset,
				id: "asset-2",
			},
			source,
		});

		expect(revokeSources).toHaveBeenCalledWith({
			sources: [
				expect.objectContaining({ url: "blob:audio-1:preserve" }),
				expect.objectContaining({ url: "blob:audio-2:preserve" }),
			],
		});
		expect(
			cache
				.plan({ asset: readyAsset, planKey: preservePlanKey })
				.cachedSources.map((source) => source.url),
		).toEqual([]);
	});
});

function createPreviewSource(
	trackId: string,
	channelMode: AudioTrackChannelMode,
): BrowserAudioPreviewSource {
	return {
		blob: new Blob(["audio"], { type: "audio/mp4" }),
		byteLength: 5,
		downloadName: `${trackId}.m4a`,
		mimeType: "audio/mp4",
		startPositionSeconds: 0,
		strategy: "same-codec-remux",
		track: {
			id: trackId,
			kind: "audio",
		},
		trackId,
		trackIndex: trackId === "audio-1" ? 0 : 1,
		url: `blob:${trackId}:${channelMode}`,
	};
}

function createAudioMix(
	channelModes: Partial<Record<string, AudioTrackChannelMode>> = {},
) {
	const audioMix = createDefaultAudioMix(readyAsset);

	for (const [trackId, channelMode] of Object.entries(channelModes)) {
		const decision = audioMix.tracks[trackId];

		if (decision && channelMode) {
			decision.channelMode = channelMode;
		}
	}

	return audioMix;
}

const source = new File(["video"], "clip.mp4", { type: "video/mp4" });

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
		audio: [
			{
				codec: "aac",
				id: "audio-1",
				kind: "audio",
				label: "Voice",
			},
			{
				codec: "aac",
				id: "audio-2",
				kind: "audio",
				label: "Desktop",
			},
		],
		video: [
			{
				id: "video-1",
				kind: "video",
			},
		],
	},
} satisfies ReadyMediaAsset;
