import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
	createBrowserAudioPreviewSourceCache,
	createBrowserAudioPreviewSourcePlanKey,
} from "./browser-audio-preview-source-cache";
import type { BrowserAudioPreviewSourceCache } from "./browser-audio-preview-source-cache.types";
import {
	prepareBrowserAudioPreviewSources,
	revokeBrowserAudioPreviewSources,
} from "./browser-audio-preview-sources";
import type {
	BrowserAudioPreviewSourcesLifecycle,
	BrowserAudioPreviewSourcesState,
	UseBrowserAudioPreviewSourcesOptions,
} from "./use-browser-audio-preview-sources.types";

export function useBrowserAudioPreviewSources({
	activeMediaAssetCleanupScope,
	audioMix,
	asset,
	enabled,
	source,
}: UseBrowserAudioPreviewSourcesOptions): BrowserAudioPreviewSourcesLifecycle {
	const sourceCacheRef = useRef<BrowserAudioPreviewSourceCache | null>(null);
	const [retryRequest, setRetryRequest] = useState<{
		requestId: number;
		trackId: string;
	} | null>(null);
	const [state, setState] = useState<BrowserAudioPreviewSourcesState>({
		status: "disabled",
	});
	const sourcePlanKey = createBrowserAudioPreviewSourcePlanKey({
		asset,
		audioMix,
	});

	if (!sourceCacheRef.current) {
		sourceCacheRef.current = createBrowserAudioPreviewSourceCache();
	}

	const retryTrack = useCallback((trackId: string) => {
		setRetryRequest((currentRequest) => ({
			requestId: (currentRequest?.requestId ?? 0) + 1,
			trackId,
		}));
	}, []);

	useEffect(() => {
		return () => {
			sourceCacheRef.current?.dispose();
		};
	}, []);

	useEffect(() => {
		const sourceCache = sourceCacheRef.current;

		if (!sourceCache || !activeMediaAssetCleanupScope) {
			return;
		}

		const cleanupRegistration = activeMediaAssetCleanupScope.registerCleanup(
			() => {
				sourceCache.dispose();
			},
		);

		return () => {
			cleanupRegistration.dispose();
		};
	}, [activeMediaAssetCleanupScope]);

	useEffect(() => {
		const sourceCache = sourceCacheRef.current;

		if (!enabled) {
			sourceCache?.dispose();
			setRetryRequest(null);
			setState({ status: "disabled" });
			return;
		}

		if (!sourceCache) {
			setState({
				failures: [],
				reason: "Audio preview source cache is unavailable.",
				status: "failed",
			});
			return;
		}

		sourceCache.resetForMediaAssetSource({ asset, source });

		const abortController = new AbortController();
		let cancelled = false;
		const plan = sourceCache.plan({
			asset,
			planKey: sourcePlanKey,
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
				sources: plan.cachedSources,
				status: "ready",
			});
			return;
		}

		setState({
			preparingTrackIds: trackIdsToPrepare,
			sources: plan.cachedSources,
			status: "loading",
		});

		void prepareBrowserAudioPreviewSources({
			audioMix: plan.audioMix,
			asset,
			signal: abortController.signal,
			source,
			trackIds: trackIdsToPrepare,
		})
			.then((result) => {
				if (cancelled) {
					revokeBrowserAudioPreviewSources({ sources: result.sources });
					return;
				}

				sourceCache.storePreparedSources({
					plan,
					sources: result.sources,
				});
				const sources = sourceCache.collectSources(plan);

				if (sources.length > 0) {
					setState({
						failures: result.failures,
						sources,
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
	}, [asset, enabled, retryRequest, source, sourcePlanKey]);

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
	asset: UseBrowserAudioPreviewSourcesOptions["asset"];
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
