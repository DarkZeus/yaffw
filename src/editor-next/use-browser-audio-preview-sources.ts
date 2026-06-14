import { useEffect, useRef, useState } from "react";

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
	BrowserAudioPreviewSourcesState,
	UseBrowserAudioPreviewSourcesOptions,
} from "./use-browser-audio-preview-sources.types";

export function useBrowserAudioPreviewSources({
	audioMix,
	asset,
	enabled,
	source,
}: UseBrowserAudioPreviewSourcesOptions): BrowserAudioPreviewSourcesState {
	const sourceCacheRef = useRef<BrowserAudioPreviewSourceCache | null>(null);
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

	useEffect(() => {
		return () => {
			sourceCacheRef.current?.dispose();
		};
	}, []);

	useEffect(() => {
		const sourceCache = sourceCacheRef.current;

		if (!enabled) {
			sourceCache?.dispose();
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

		if (plan.missingTrackIds.size === 0) {
			setState({
				failures: [],
				sources: plan.cachedSources,
				status: "ready",
			});
			return;
		}

		setState({
			preparingTrackIds: plan.missingTrackIds,
			sources: plan.cachedSources,
			status: "loading",
		});

		void prepareBrowserAudioPreviewSources({
			audioMix: plan.audioMix,
			asset,
			signal: abortController.signal,
			source,
			trackIds: plan.missingTrackIds,
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
	}, [asset, enabled, source, sourcePlanKey]);

	return state;
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
