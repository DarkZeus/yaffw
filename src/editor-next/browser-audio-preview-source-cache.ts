import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import type { AudioMix, ReadyMediaAsset } from "@/editor-core/model";

import type {
	BrowserAudioPreviewSourceCacheOptions,
	BrowserAudioPreviewSourceCacheOwner,
	BrowserAudioPreviewSourcePlan,
	BrowserAudioPreviewSourcePlanData,
	BrowserAudioPreviewSourcePlanInput,
	BrowserAudioPreviewSourcePlanKey,
	BrowserAudioPreviewSourceRequest,
} from "./browser-audio-preview-source-cache.types";
import { revokeBrowserAudioPreviewSources } from "./browser-audio-preview-sources";
import type { BrowserAudioPreviewSource } from "./browser-audio-preview-sources.types";

export function createBrowserAudioPreviewSourcePlanKey({
	asset,
}: {
	asset: ReadyMediaAsset;
	audioMix: AudioMix;
}): BrowserAudioPreviewSourcePlanKey {
	return JSON.stringify({
		tracks: asset.tracks.audio.map((track) => track.id),
	} satisfies BrowserAudioPreviewSourcePlanData);
}

export function createBrowserAudioPreviewSourceCache({
	revokeSources = revokeBrowserAudioPreviewSources,
}: BrowserAudioPreviewSourceCacheOptions = {}) {
	const sourceCache = new Map<string, BrowserAudioPreviewSource>();
	let owner: BrowserAudioPreviewSourceCacheOwner | null = null;

	const dispose = () => {
		if (sourceCache.size > 0) {
			revokeSources({ sources: Array.from(sourceCache.values()) });
			sourceCache.clear();
		}

		owner = null;
	};

	return {
		collectSources(plan: BrowserAudioPreviewSourcePlan) {
			return collectCachedAudioPreviewSources({
				sourceCache,
				sourceRequests: plan.sourceRequests,
			});
		},

		dispose,

		plan({
			asset,
			planKey,
		}: BrowserAudioPreviewSourcePlanInput): BrowserAudioPreviewSourcePlan {
			const sourceRequests = createAudioPreviewSourceRequests({
				asset,
				planKey,
			});
			const missingSourceRequests = sourceRequests.filter(
				(request) => !sourceCache.has(request.cacheKey),
			);

			return {
				audioMix: createAudioPreviewMixSnapshot({
					asset,
					planKey,
				}),
				cachedSources: collectCachedAudioPreviewSources({
					sourceCache,
					sourceRequests,
				}),
				missingTrackIds: new Set(
					missingSourceRequests.map((request) => request.trackId),
				),
				sourceRequests,
			};
		},

		resetForMediaAssetSource({
			asset,
			source,
		}: {
			asset: ReadyMediaAsset;
			source: Blob;
		}) {
			if (owner?.assetId === asset.id && owner.source === source) {
				return;
			}

			dispose();
			owner = {
				assetId: asset.id,
				source,
			};
		},

		storePreparedSources({
			plan,
			sources,
		}: {
			plan: BrowserAudioPreviewSourcePlan;
			sources: BrowserAudioPreviewSource[];
		}) {
			const sourceRequestsByTrackId = new Map(
				plan.sourceRequests.map((request) => [request.trackId, request]),
			);

			for (const source of sources) {
				const request = sourceRequestsByTrackId.get(source.trackId);

				if (!request) {
					revokeSources({ sources: [source] });
					continue;
				}

				const currentSource = sourceCache.get(request.cacheKey);

				if (currentSource && currentSource !== source) {
					revokeSources({ sources: [currentSource] });
				}

				sourceCache.set(request.cacheKey, source);
			}
		},
	};
}

function createAudioPreviewSourceRequests({
	asset,
	planKey,
}: {
	asset: ReadyMediaAsset;
	planKey: BrowserAudioPreviewSourcePlanKey;
}): BrowserAudioPreviewSourceRequest[] {
	const planData = parseBrowserAudioPreviewSourcePlanKey(planKey);
	const plannedTrackIds = new Set(planData.tracks);

	return asset.tracks.audio
		.filter((track) => plannedTrackIds.has(track.id))
		.map((track) => ({
			cacheKey: `${track.id}:source`,
			trackId: track.id,
		}));
}

function collectCachedAudioPreviewSources({
	sourceCache,
	sourceRequests,
}: {
	sourceCache: ReadonlyMap<string, BrowserAudioPreviewSource>;
	sourceRequests: BrowserAudioPreviewSourceRequest[];
}) {
	return sourceRequests.flatMap((request) => {
		const source = sourceCache.get(request.cacheKey);

		return source ? [source] : [];
	});
}

function createAudioPreviewMixSnapshot({
	asset,
	planKey,
}: {
	asset: ReadyMediaAsset;
	planKey: BrowserAudioPreviewSourcePlanKey;
}): AudioMix {
	parseBrowserAudioPreviewSourcePlanKey(planKey);

	return createDefaultAudioMix(asset);
}

function parseBrowserAudioPreviewSourcePlanKey(
	planKey: BrowserAudioPreviewSourcePlanKey,
): BrowserAudioPreviewSourcePlanData {
	return JSON.parse(planKey) as BrowserAudioPreviewSourcePlanData;
}
