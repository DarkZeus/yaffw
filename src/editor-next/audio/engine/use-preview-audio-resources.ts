import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PreviewAudioResourceCache } from "../types/preview-audio-resource-cache.types";
import type {
	PreviewAudioResourcesLifecycle,
	PreviewAudioResourcesState,
	UsePreviewAudioResourcesOptions,
} from "../types/use-preview-audio-resources.types";
import {
	createPreviewAudioResourceCache,
	createPreviewAudioResourcePlanKey,
} from "./preview-audio-resource-cache";
import {
	preparePreviewAudioResources,
	revokePreviewAudioResources,
} from "./preview-audio-resources";

export function usePreviewAudioResources({
	activeMediaAssetCleanupScope,
	audioMix,
	asset,
	enabled,
	source,
}: UsePreviewAudioResourcesOptions): PreviewAudioResourcesLifecycle {
	const resourceCacheRef = useRef<PreviewAudioResourceCache | null>(null);
	const [retryRequest, setRetryRequest] = useState<{
		requestId: number;
		trackId: string;
	} | null>(null);
	const [state, setState] = useState<PreviewAudioResourcesState>({
		status: "disabled",
	});
	const resourcePlanKey = createPreviewAudioResourcePlanKey({
		asset,
		audioMix,
	});

	if (!resourceCacheRef.current) {
		resourceCacheRef.current = createPreviewAudioResourceCache();
	}

	const retryTrack = useCallback((trackId: string) => {
		setRetryRequest((currentRequest) => ({
			requestId: (currentRequest?.requestId ?? 0) + 1,
			trackId,
		}));
	}, []);

	useEffect(() => {
		return () => {
			resourceCacheRef.current?.dispose();
		};
	}, []);

	useEffect(() => {
		const resourceCache = resourceCacheRef.current;

		if (!resourceCache || !activeMediaAssetCleanupScope) {
			return;
		}

		const cleanupRegistration = activeMediaAssetCleanupScope.registerCleanup(
			() => {
				resourceCache.dispose();
			},
		);

		return () => {
			cleanupRegistration.dispose();
		};
	}, [activeMediaAssetCleanupScope]);

	useEffect(() => {
		const resourceCache = resourceCacheRef.current;

		if (!enabled) {
			resourceCache?.dispose();
			setRetryRequest(null);
			setState({ status: "disabled" });
			return;
		}

		if (!resourceCache) {
			setState({
				failures: [],
				reason: "Preview audio resource cache is unavailable.",
				status: "failed",
			});
			return;
		}

		resourceCache.resetForMediaAssetSource({ asset, source });

		const abortController = new AbortController();
		let cancelled = false;
		const plan = resourceCache.plan({
			asset,
			planKey: resourcePlanKey,
		});
		const retryTrackIds = retryRequest
			? createRetryTrackIds({
					asset,
					retryTrackId: retryRequest.trackId,
				})
			: null;
		const trackIdsToPrepare = retryTrackIds ?? plan.missingTrackIds;

		if (trackIdsToPrepare.size === 0) {
			setState({
				failures: [],
				resources: plan.cachedResources,
				status: "ready",
			});
			return;
		}

		setState({
			preparingTrackIds: trackIdsToPrepare,
			resources: plan.cachedResources,
			status: "loading",
		});

		void preparePreviewAudioResources({
			audioMix: plan.audioMix,
			asset,
			signal: abortController.signal,
			source,
			trackIds: trackIdsToPrepare,
		})
			.then((result) => {
				if (cancelled) {
					revokePreviewAudioResources({ resources: result.resources });
					return;
				}

				resourceCache.storePreparedResources({
					plan,
					resources: result.resources,
				});
				const resources = resourceCache.collectResources(plan);

				if (resources.length > 0) {
					setState({
						failures: result.failures,
						resources,
						status: "ready",
					});
					return;
				}

				setState({
					failures: result.failures,
					reason:
						result.failures[0]?.reason ??
						"No audio preview tracks could be prepared.",
					status: "failed",
				});
			})
			.catch((error: unknown) => {
				if (cancelled || isAbortError(error)) {
					return;
				}

				setState({
					failures: [],
					reason: errorToMessage(error),
					status: "failed",
				});
			});

		return () => {
			cancelled = true;
			abortController.abort();
		};
	}, [asset, enabled, retryRequest, source, resourcePlanKey]);

	return useMemo(
		() => ({
			...state,
			retryTrack,
		}),
		[state, retryTrack],
	);
}

function createRetryTrackIds({
	asset,
	retryTrackId,
}: {
	asset: UsePreviewAudioResourcesOptions["asset"];
	retryTrackId: string;
}) {
	const trackIds = new Set<string>();

	if (asset.tracks.audio.some((track) => track.id === retryTrackId)) {
		trackIds.add(retryTrackId);
	}

	return trackIds;
}

function isAbortError(error: unknown) {
	return error instanceof DOMException && error.name === "AbortError";
}

function errorToMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}
