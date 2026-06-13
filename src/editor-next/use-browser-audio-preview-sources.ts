import { useEffect, useRef, useState } from "react";

import type {
	AudioMix,
	AudioTrackChannelMode,
	ReadyMediaAsset,
} from "@/editor-core/model";
import {
	type BrowserAudioPreviewSource,
	type BrowserAudioPreviewSourceFailure,
	prepareBrowserAudioPreviewSources,
	revokeBrowserAudioPreviewSources,
} from "./browser-audio-preview-sources";

export type BrowserAudioPreviewSourcesState =
	| {
			status: "disabled";
	  }
	| {
			preparingTrackIds: ReadonlySet<string>;
			sources: BrowserAudioPreviewSource[];
			status: "loading";
	  }
	| {
			failures: BrowserAudioPreviewSourceFailure[];
			sources: BrowserAudioPreviewSource[];
			status: "ready";
	  }
	| {
			failures: BrowserAudioPreviewSourceFailure[];
			reason: string;
			status: "failed";
	  };

export function useBrowserAudioPreviewSources({
	audioMix,
	asset,
	enabled,
	source,
}: {
	audioMix: AudioMix;
	asset: ReadyMediaAsset;
	enabled: boolean;
	source: Blob;
}): BrowserAudioPreviewSourcesState {
	const sourceCacheRef = useRef(new Map<string, BrowserAudioPreviewSource>());
	const sourceCacheOwnerRef = useRef<{
		asset: ReadyMediaAsset;
		source: Blob;
	} | null>(null);
	const [state, setState] = useState<BrowserAudioPreviewSourcesState>({
		status: "disabled",
	});
	const channelModeKey = createAudioPreviewChannelModeKey(asset, audioMix);
	const finalPeakGuardDb = audioMix.finalPeakGuardDb;

	useEffect(() => {
		return () => {
			revokeAudioPreviewSourceCache(sourceCacheRef.current);
		};
	}, []);

	useEffect(() => {
		const sourceCache = sourceCacheRef.current;
		const cacheOwner = sourceCacheOwnerRef.current;

		if (cacheOwner?.asset !== asset || cacheOwner.source !== source) {
			revokeAudioPreviewSourceCache(sourceCache);
			sourceCacheOwnerRef.current = { asset, source };
		}

		if (!enabled) {
			revokeAudioPreviewSourceCache(sourceCache);
			sourceCacheOwnerRef.current = null;
			setState({ status: "disabled" });
			return;
		}

		const abortController = new AbortController();
		let cancelled = false;
		const sourceRequests = createAudioPreviewSourceRequests({
			asset,
			channelModeKey,
			finalPeakGuardDb,
		});
		const missingSourceRequests = sourceRequests.filter(
			(request) => !sourceCache.has(request.cacheKey),
		);
		const cachedSources = collectCachedAudioPreviewSources({
			sourceCache,
			sourceRequests,
		});

		if (missingSourceRequests.length === 0) {
			setState({
				failures: [],
				sources: cachedSources,
				status: "ready",
			});
			return;
		}

		const missingTrackIds = new Set(
			missingSourceRequests.map((request) => request.trackId),
		);

		setState({
			preparingTrackIds: missingTrackIds,
			sources: cachedSources,
			status: "loading",
		});

		void prepareBrowserAudioPreviewSources({
			audioMix: createAudioPreviewMixSnapshot({
				asset,
				channelModeKey,
				finalPeakGuardDb,
			}),
			asset,
			signal: abortController.signal,
			source,
			trackIds: missingTrackIds,
		})
			.then((result) => {
				if (cancelled) {
					revokeBrowserAudioPreviewSources({ sources: result.sources });
					return;
				}

				const sourceRequestsByTrackId = new Map(
					sourceRequests.map((request) => [request.trackId, request]),
				);

				for (const source of result.sources) {
					const request = sourceRequestsByTrackId.get(source.trackId);

					if (!request) {
						revokeBrowserAudioPreviewSources({ sources: [source] });
						continue;
					}

					const currentSource = sourceCache.get(request.cacheKey);

					if (currentSource && currentSource !== source) {
						revokeBrowserAudioPreviewSources({ sources: [currentSource] });
					}

					sourceCache.set(request.cacheKey, source);
				}

				const sources = collectCachedAudioPreviewSources({
					sourceCache,
					sourceRequests,
				});

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
	}, [asset, channelModeKey, enabled, finalPeakGuardDb, source]);

	return state;
}

type AudioPreviewSourceRequest = {
	cacheKey: string;
	trackId: string;
};

function revokeAudioPreviewSourceCache(
	sourceCache: Map<string, BrowserAudioPreviewSource>,
) {
	if (sourceCache.size === 0) {
		return;
	}

	revokeBrowserAudioPreviewSources({
		sources: Array.from(sourceCache.values()),
	});
	sourceCache.clear();
}

function createAudioPreviewSourceRequests({
	asset,
	channelModeKey,
	finalPeakGuardDb,
}: {
	asset: ReadyMediaAsset;
	channelModeKey: string;
	finalPeakGuardDb: number;
}): AudioPreviewSourceRequest[] {
	const channelModes = new Map(
		JSON.parse(channelModeKey) as Array<[string, AudioTrackChannelMode]>,
	);

	return asset.tracks.audio.map((track) => {
		const channelMode = channelModes.get(track.id) ?? "preserve";
		const peakGuardKey =
			channelMode === "preserve" ? "source" : String(finalPeakGuardDb);

		return {
			cacheKey: `${track.id}:${channelMode}:${peakGuardKey}`,
			trackId: track.id,
		};
	});
}

function collectCachedAudioPreviewSources({
	sourceCache,
	sourceRequests,
}: {
	sourceCache: ReadonlyMap<string, BrowserAudioPreviewSource>;
	sourceRequests: AudioPreviewSourceRequest[];
}) {
	return sourceRequests.flatMap((request) => {
		const source = sourceCache.get(request.cacheKey);

		return source ? [source] : [];
	});
}

function createAudioPreviewChannelModeKey(
	asset: ReadyMediaAsset,
	audioMix: AudioMix,
) {
	return JSON.stringify(
		asset.tracks.audio.map(
			(track) =>
				[
					track.id,
					audioMix.tracks[track.id]?.channelMode ?? "preserve",
				] satisfies [string, AudioTrackChannelMode],
		),
	);
}

function createAudioPreviewMixSnapshot({
	asset,
	channelModeKey,
	finalPeakGuardDb,
}: {
	asset: ReadyMediaAsset;
	channelModeKey: string;
	finalPeakGuardDb: number;
}): AudioMix {
	const channelModes = new Map(
		JSON.parse(channelModeKey) as Array<[string, AudioTrackChannelMode]>,
	);

	return {
		finalPeakGuardDb,
		outputChannels: 2,
		tracks: Object.fromEntries(
			asset.tracks.audio.map((track) => [
				track.id,
				{
					channelMode: channelModes.get(track.id) ?? "preserve",
					include: true,
					trackId: track.id,
					volumePercent: 100,
				},
			]),
		),
	};
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
