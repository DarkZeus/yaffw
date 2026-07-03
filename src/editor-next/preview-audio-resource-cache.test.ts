import { describe, expect, it, vi } from "vitest";

import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import type {
	AudioTrackChannelMode,
	ReadyMediaAsset,
} from "@/editor-core/model";

import {
	createPreviewAudioResourceCache,
	createPreviewAudioResourcePlanKey,
} from "./preview-audio-resource-cache";
import type { PreviewAudioResource } from "./preview-audio-resources.types";

describe("PreviewAudioResourceCache", () => {
	it("plans only missing audio tracks and reuses cached resources across channel decisions", () => {
		const revokeResources = vi.fn();
		const cache = createPreviewAudioResourceCache({ revokeResources });
		const resourcePlanKey = createPreviewAudioResourcePlanKey({
			asset: readyAsset,
			audioMix: createAudioMix(),
		});

		cache.resetForMediaAssetSource({ asset: readyAsset, source });

		const preservePlan = cache.plan({
			asset: readyAsset,
			planKey: resourcePlanKey,
		});

		expect(Array.from(preservePlan.missingTrackIds)).toEqual([
			"audio-1",
			"audio-2",
		]);
		expect(preservePlan.cachedResources).toEqual([]);
		expect(preservePlan.audioMix.tracks["audio-1"]?.channelMode).toBe(
			"preserve",
		);
		expect(preservePlan.audioMix.tracks["audio-1"]?.include).toBe(true);
		expect(preservePlan.audioMix.tracks["audio-1"]?.volumePercent).toBe(100);

		cache.storePreparedResources({
			plan: preservePlan,
			resources: [
				createPreviewResource("audio-1"),
				createPreviewResource("audio-2"),
			],
		});

		expect(
			cache
				.plan({ asset: readyAsset, planKey: resourcePlanKey })
				.cachedResources.map((resource) => resource.url),
		).toEqual(["blob:audio-1:resource", "blob:audio-2:resource"]);

		const fixedVoicePlan = cache.plan({
			asset: readyAsset,
			planKey: createPreviewAudioResourcePlanKey({
				asset: readyAsset,
				audioMix: createAudioMix({ "audio-1": "use-left-as-mono" }),
			}),
		});

		expect(Array.from(fixedVoicePlan.missingTrackIds)).toEqual([]);
		expect(fixedVoicePlan.cachedResources.map((resource) => resource.url)).toEqual([
			"blob:audio-1:resource",
			"blob:audio-2:resource",
		]);

		expect(
			cache
				.plan({ asset: readyAsset, planKey: resourcePlanKey })
				.cachedResources.map((resource) => resource.url),
		).toEqual(["blob:audio-1:resource", "blob:audio-2:resource"]);
		expect(revokeResources).not.toHaveBeenCalled();
	});

	it("disposes cached preview resources when the media asset source changes", () => {
		const revokeResources = vi.fn();
		const cache = createPreviewAudioResourceCache({ revokeResources });
		const resourcePlanKey = createPreviewAudioResourcePlanKey({
			asset: readyAsset,
			audioMix: createAudioMix(),
		});
		const preservePlan = cache.plan({
			asset: readyAsset,
			planKey: resourcePlanKey,
		});

		cache.resetForMediaAssetSource({ asset: readyAsset, source });
		cache.storePreparedResources({
			plan: preservePlan,
			resources: [
				createPreviewResource("audio-1"),
				createPreviewResource("audio-2"),
			],
		});

		cache.resetForMediaAssetSource({
			asset: {
				...readyAsset,
				id: "asset-2",
			},
			source,
		});

		expect(revokeResources).toHaveBeenCalledWith({
			resources: [
				expect.objectContaining({ url: "blob:audio-1:resource" }),
				expect.objectContaining({ url: "blob:audio-2:resource" }),
			],
		});
		expect(
			cache
				.plan({ asset: readyAsset, planKey: resourcePlanKey })
				.cachedResources.map((resource) => resource.url),
		).toEqual([]);
	});

	it("revokes only the superseded resource when replacing a prepared resource", () => {
		const revokeResources = vi.fn();
		const cache = createPreviewAudioResourceCache({ revokeResources });
		const resourcePlanKey = createPreviewAudioResourcePlanKey({
			asset: readyAsset,
			audioMix: createAudioMix(),
		});
		const preservePlan = cache.plan({
			asset: readyAsset,
			planKey: resourcePlanKey,
		});

		cache.resetForMediaAssetSource({ asset: readyAsset, source });
		cache.storePreparedResources({
			plan: preservePlan,
			resources: [
				createPreviewResource("audio-1"),
				createPreviewResource("audio-2"),
			],
		});

		const replacement = {
			...createPreviewResource("audio-1"),
			url: "blob:audio-1:resource:replacement",
		};

		cache.storePreparedResources({
			plan: preservePlan,
			resources: [replacement],
		});

		expect(revokeResources).toHaveBeenCalledWith({
			resources: [expect.objectContaining({ url: "blob:audio-1:resource" })],
		});
		expect(
			cache
				.plan({ asset: readyAsset, planKey: resourcePlanKey })
				.cachedResources.map((resource) => resource.url),
		).toEqual(["blob:audio-1:resource:replacement", "blob:audio-2:resource"]);
	});
});

function createPreviewResource(trackId: string): PreviewAudioResource {
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
		url: `blob:${trackId}:resource`,
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
