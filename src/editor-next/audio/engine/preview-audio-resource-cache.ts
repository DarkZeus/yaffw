import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import type { AudioMix, ReadyMediaAsset } from "@/editor-core/model";

import type {
	PreviewAudioResourceCacheOptions,
	PreviewAudioResourceCacheOwner,
	PreviewAudioResourcePlan,
	PreviewAudioResourcePlanData,
	PreviewAudioResourcePlanInput,
	PreviewAudioResourcePlanKey,
	PreviewAudioResourceRequest,
} from "../types/preview-audio-resource-cache.types";
import type { PreviewAudioResource } from "../types/preview-audio-resources.types";
import { revokePreviewAudioResources } from "./preview-audio-resources";

export function createPreviewAudioResourcePlanKey({
	asset,
}: {
	asset: ReadyMediaAsset;
	audioMix: AudioMix;
}): PreviewAudioResourcePlanKey {
	return JSON.stringify({
		tracks: asset.tracks.audio.map((track) => track.id),
	} satisfies PreviewAudioResourcePlanData);
}

export function createPreviewAudioResourceCache({
	revokeResources = revokePreviewAudioResources,
}: PreviewAudioResourceCacheOptions = {}) {
	const resourceCache = new Map<string, PreviewAudioResource>();
	let owner: PreviewAudioResourceCacheOwner | null = null;

	const dispose = () => {
		if (resourceCache.size > 0) {
			revokeResources({ resources: Array.from(resourceCache.values()) });
			resourceCache.clear();
		}

		owner = null;
	};

	return {
		collectResources(plan: PreviewAudioResourcePlan) {
			return collectCachedPreviewAudioResources({
				resourceCache,
				resourceRequests: plan.resourceRequests,
			});
		},

		dispose,

		plan({
			asset,
			planKey,
		}: PreviewAudioResourcePlanInput): PreviewAudioResourcePlan {
			const resourceRequests = createPreviewAudioResourceRequests({
				asset,
				planKey,
			});
			const missingResourceRequests = resourceRequests.filter(
				(request) => !resourceCache.has(request.cacheKey),
			);

			return {
				audioMix: createAudioPreviewMixSnapshot({
					asset,
					planKey,
				}),
				cachedResources: collectCachedPreviewAudioResources({
					resourceCache,
					resourceRequests,
				}),
				missingTrackIds: new Set(
					missingResourceRequests.map((request) => request.trackId),
				),
				resourceRequests,
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

		storePreparedResources({
			plan,
			resources,
		}: {
			plan: PreviewAudioResourcePlan;
			resources: PreviewAudioResource[];
		}) {
			const resourceRequestsByTrackId = new Map(
				plan.resourceRequests.map((request) => [request.trackId, request]),
			);

			for (const resource of resources) {
				const request = resourceRequestsByTrackId.get(resource.trackId);

				if (!request) {
					revokeResources({ resources: [resource] });
					continue;
				}

				const currentResource = resourceCache.get(request.cacheKey);

				if (currentResource && currentResource !== resource) {
					revokeResources({ resources: [currentResource] });
				}

				resourceCache.set(request.cacheKey, resource);
			}
		},
	};
}

function createPreviewAudioResourceRequests({
	asset,
	planKey,
}: {
	asset: ReadyMediaAsset;
	planKey: PreviewAudioResourcePlanKey;
}): PreviewAudioResourceRequest[] {
	const planData = parsePreviewAudioResourcePlanKey(planKey);
	const plannedTrackIds = new Set(planData.tracks);

	return asset.tracks.audio
		.filter((track) => plannedTrackIds.has(track.id))
		.map((track) => ({
			cacheKey: `${track.id}:resource`,
			trackId: track.id,
		}));
}

function collectCachedPreviewAudioResources({
	resourceCache,
	resourceRequests,
}: {
	resourceCache: ReadonlyMap<string, PreviewAudioResource>;
	resourceRequests: PreviewAudioResourceRequest[];
}) {
	return resourceRequests.flatMap((request) => {
		const resource = resourceCache.get(request.cacheKey);

		return resource ? [resource] : [];
	});
}

function createAudioPreviewMixSnapshot({
	asset,
	planKey,
}: {
	asset: ReadyMediaAsset;
	planKey: PreviewAudioResourcePlanKey;
}): AudioMix {
	parsePreviewAudioResourcePlanKey(planKey);

	return createDefaultAudioMix(asset);
}

function parsePreviewAudioResourcePlanKey(
	planKey: PreviewAudioResourcePlanKey,
): PreviewAudioResourcePlanData {
	return JSON.parse(planKey) as PreviewAudioResourcePlanData;
}
