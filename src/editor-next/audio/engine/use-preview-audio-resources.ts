import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ReadyMediaAsset } from "@/editor-core/model";
import type {
	PreviewAudioResource,
	PreviewAudioResourceFailure,
} from "../types/preview-audio-resources.types";
import type {
	PreviewAudioResourcesLifecycle,
	PreviewAudioResourcesState,
	UsePreviewAudioResourcesOptions,
} from "../types/use-preview-audio-resources.types";
import {
	preparePreviewAudioResources,
	revokePreviewAudioResources,
} from "./preview-audio-resources";

type PreviewAudioResourcePreparation = {
	cancel: () => void;
	finish: () => void;
	isCancelled: () => boolean;
};

type PreviewAudioResourceOwnership = {
	assetId: string | null;
	failuresByTrackId: Map<string, PreviewAudioResourceFailure>;
	preparation: PreviewAudioResourcePreparation | null;
	requestVersion: number;
	resourcesByTrackId: Map<string, PreviewAudioResource>;
	source: Blob | null;
};

type PreviewAudioResourceRetryRequest = {
	assetId: string;
	requestId: number;
	source: Blob;
	trackId: string;
};

export function usePreviewAudioResources({
	activeMediaAssetCleanupScope,
	asset,
	enabled,
	source,
}: UsePreviewAudioResourcesOptions): PreviewAudioResourcesLifecycle {
	const ownershipRef = useRef<PreviewAudioResourceOwnership | null>(null);
	const [retryRequest, setRetryRequest] =
		useState<PreviewAudioResourceRetryRequest | null>(null);
	const [state, setState] = useState<PreviewAudioResourcesState>({
		status: "disabled",
	});

	if (!ownershipRef.current) {
		ownershipRef.current = createPreviewAudioResourceOwnership();
	}

	const retryTrack = useCallback(
		(trackId: string) => {
			setRetryRequest((currentRequest) => ({
				assetId: asset.id,
				requestId: (currentRequest?.requestId ?? 0) + 1,
				source,
				trackId,
			}));
		},
		[asset.id, source],
	);

	useEffect(() => {
		return () => {
			releasePreviewAudioResourceOwnership(ownershipRef.current);
		};
	}, []);

	useEffect(() => {
		const ownership = ownershipRef.current;

		if (!ownership || !activeMediaAssetCleanupScope) {
			return;
		}

		const cleanupRegistration = activeMediaAssetCleanupScope.registerCleanup(
			() => {
				releasePreviewAudioResourceOwnership(ownership);
			},
		);

		return () => {
			cleanupRegistration.dispose();
		};
	}, [activeMediaAssetCleanupScope]);

	useEffect(() => {
		const ownership = ownershipRef.current;

		if (!enabled) {
			releasePreviewAudioResourceOwnership(ownership);
			setRetryRequest(null);
			setState({ status: "disabled" });
			return;
		}

		if (!ownership) {
			setState({
				failures: [],
				reason: "Preview audio resource ownership is unavailable.",
				status: "failed",
			});
			return;
		}

		resetPreviewAudioResourceOwnershipForAsset(ownership, { asset, source });

		const requestedRetryTrackId =
			retryRequest?.assetId === asset.id && retryRequest.source === source
				? retryRequest.trackId
				: null;
		const requestedRetryId = requestedRetryTrackId
			? retryRequest?.requestId
			: null;
		const finishRetryRequest = () => {
			if (requestedRetryId === null) {
				return;
			}

			setRetryRequest((currentRequest) =>
				currentRequest?.requestId === requestedRetryId ? null : currentRequest,
			);
		};
		const trackIdsToPrepare = requestedRetryTrackId
			? createRetryTrackIds({ asset, retryTrackId: requestedRetryTrackId })
			: collectMissingTrackIds({ asset, ownership });
		const cachedResources = collectOwnedResources({ asset, ownership });

		if (trackIdsToPrepare.size === 0) {
			finishRetryRequest();
			setState({
				failures: collectOwnedFailures({ asset, ownership }),
				resources: cachedResources,
				status: "ready",
			});
			return;
		}

		const abortController = new AbortController();
		const preparation = beginPreviewAudioResourcePreparation({
			abortController,
			ownership,
		});

		setState({
			preparingTrackIds: trackIdsToPrepare,
			resources: cachedResources,
			status: "loading",
		});

		void preparePreviewAudioResources({
			asset,
			signal: abortController.signal,
			source,
			trackIds: trackIdsToPrepare,
		})
			.then((result) => {
				if (
					preparation.isCancelled() ||
					(activeMediaAssetCleanupScope !== undefined &&
						!activeMediaAssetCleanupScope.isCurrent()) ||
					!previewAudioResourceOwnershipMatches(ownership, { asset, source })
				) {
					revokePreviewAudioResources({ resources: result.resources });
					return;
				}

				preparation.finish();
				finishRetryRequest();
				storeOwnedPreviewAudioResourceResult({
					asset,
					failures: result.failures,
					ownership,
					requestedTrackIds: trackIdsToPrepare,
					resources: result.resources,
				});
				const resources = collectOwnedResources({ asset, ownership });
				const failures = collectOwnedFailures({ asset, ownership });

				if (resources.length > 0) {
					setState({
						failures,
						resources,
						status: "ready",
					});
					return;
				}

				setState({
					failures,
					reason:
						failures[0]?.reason ?? "No audio preview tracks could be prepared.",
					status: "failed",
				});
			})
			.catch((error: unknown) => {
				if (preparation.isCancelled() || isAbortError(error)) {
					return;
				}

				preparation.finish();
				finishRetryRequest();
				storePreparationFailureForTracks({
					asset,
					ownership,
					reason: errorToMessage(error),
					trackIds: trackIdsToPrepare,
				});
				const resources = collectOwnedResources({ asset, ownership });
				const failures = collectOwnedFailures({ asset, ownership });

				setState(
					resources.length > 0
						? {
								failures,
								resources,
								status: "ready",
							}
						: {
								failures,
								reason: failures[0]?.reason ?? errorToMessage(error),
								status: "failed",
							},
				);
			});

		return preparation.cancel;
	}, [activeMediaAssetCleanupScope, asset, enabled, retryRequest, source]);

	return useMemo(
		() => ({
			...state,
			retryTrack,
		}),
		[state, retryTrack],
	);
}

function createPreviewAudioResourceOwnership(): PreviewAudioResourceOwnership {
	return {
		assetId: null,
		failuresByTrackId: new Map(),
		preparation: null,
		requestVersion: 0,
		resourcesByTrackId: new Map(),
		source: null,
	};
}

function resetPreviewAudioResourceOwnershipForAsset(
	ownership: PreviewAudioResourceOwnership,
	{
		asset,
		source,
	}: {
		asset: ReadyMediaAsset;
		source: Blob;
	},
) {
	if (previewAudioResourceOwnershipMatches(ownership, { asset, source })) {
		return;
	}

	releasePreviewAudioResourceOwnership(ownership);
	ownership.assetId = asset.id;
	ownership.source = source;
}

function releasePreviewAudioResourceOwnership(
	ownership: PreviewAudioResourceOwnership | null,
) {
	if (!ownership) {
		return;
	}

	ownership.preparation?.cancel();
	ownership.preparation = null;
	ownership.requestVersion += 1;
	ownership.failuresByTrackId.clear();
	const resources = Array.from(ownership.resourcesByTrackId.values());
	ownership.resourcesByTrackId.clear();
	ownership.assetId = null;
	ownership.source = null;

	if (resources.length > 0) {
		revokePreviewAudioResources({
			resources,
		});
	}
}

function beginPreviewAudioResourcePreparation({
	abortController,
	ownership,
}: {
	abortController: AbortController;
	ownership: PreviewAudioResourceOwnership;
}): PreviewAudioResourcePreparation {
	ownership.preparation?.cancel();
	const version = ownership.requestVersion + 1;
	ownership.requestVersion = version;
	let cancelled = false;
	let finished = false;

	const preparation: PreviewAudioResourcePreparation = {
		cancel() {
			if (cancelled || finished) {
				return;
			}

			cancelled = true;
			abortController.abort();

			if (ownership.preparation === preparation) {
				ownership.preparation = null;
			}

			if (ownership.requestVersion === version) {
				ownership.requestVersion += 1;
			}
		},
		finish() {
			if (cancelled || finished) {
				return;
			}

			finished = true;

			if (ownership.preparation === preparation) {
				ownership.preparation = null;
			}
		},
		isCancelled() {
			return (
				cancelled ||
				ownership.requestVersion !== version ||
				ownership.preparation !== preparation
			);
		},
	};

	ownership.preparation = preparation;

	return preparation;
}

function collectMissingTrackIds({
	asset,
	ownership,
}: {
	asset: ReadyMediaAsset;
	ownership: PreviewAudioResourceOwnership;
}) {
	return new Set(
		asset.tracks.audio
			.filter(
				(track) =>
					!ownership.resourcesByTrackId.has(track.id) &&
					!ownership.failuresByTrackId.has(track.id),
			)
			.map((track) => track.id),
	);
}

function collectOwnedResources({
	asset,
	ownership,
}: {
	asset: ReadyMediaAsset;
	ownership: PreviewAudioResourceOwnership;
}) {
	return asset.tracks.audio.flatMap((track) => {
		const resource = ownership.resourcesByTrackId.get(track.id);

		return resource ? [resource] : [];
	});
}

function collectOwnedFailures({
	asset,
	ownership,
}: {
	asset: ReadyMediaAsset;
	ownership: PreviewAudioResourceOwnership;
}) {
	return asset.tracks.audio.flatMap((track) => {
		const failure = ownership.failuresByTrackId.get(track.id);

		return failure ? [failure] : [];
	});
}

function storeOwnedPreviewAudioResourceResult({
	asset,
	failures,
	ownership,
	requestedTrackIds,
	resources,
}: {
	asset: ReadyMediaAsset;
	failures: PreviewAudioResourceFailure[];
	ownership: PreviewAudioResourceOwnership;
	requestedTrackIds: ReadonlySet<string>;
	resources: PreviewAudioResource[];
}) {
	const assetTrackIds = new Set(asset.tracks.audio.map((track) => track.id));

	for (const trackId of requestedTrackIds) {
		ownership.failuresByTrackId.delete(trackId);
	}

	for (const failure of failures) {
		if (
			requestedTrackIds.has(failure.trackId) &&
			assetTrackIds.has(failure.trackId)
		) {
			ownership.failuresByTrackId.set(failure.trackId, failure);
		}
	}

	for (const resource of resources) {
		if (
			!requestedTrackIds.has(resource.trackId) ||
			!assetTrackIds.has(resource.trackId)
		) {
			revokePreviewAudioResources({ resources: [resource] });
			continue;
		}

		const currentResource = ownership.resourcesByTrackId.get(resource.trackId);
		ownership.failuresByTrackId.delete(resource.trackId);
		ownership.resourcesByTrackId.set(resource.trackId, resource);

		if (currentResource && currentResource !== resource) {
			revokePreviewAudioResources({ resources: [currentResource] });
		}
	}
}

function storePreparationFailureForTracks({
	asset,
	ownership,
	reason,
	trackIds,
}: {
	asset: ReadyMediaAsset;
	ownership: PreviewAudioResourceOwnership;
	reason: string;
	trackIds: ReadonlySet<string>;
}) {
	for (const [trackIndex, track] of asset.tracks.audio.entries()) {
		if (!trackIds.has(track.id)) {
			continue;
		}

		ownership.failuresByTrackId.set(track.id, {
			reason,
			track,
			trackId: track.id,
			trackIndex,
		});
	}
}

function previewAudioResourceOwnershipMatches(
	ownership: PreviewAudioResourceOwnership,
	{
		asset,
		source,
	}: {
		asset: ReadyMediaAsset;
		source: Blob;
	},
) {
	return ownership.assetId === asset.id && ownership.source === source;
}

function createRetryTrackIds({
	asset,
	retryTrackId,
}: {
	asset: ReadyMediaAsset;
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
