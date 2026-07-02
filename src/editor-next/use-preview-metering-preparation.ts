import { useCallback, useEffect, useRef, useState } from "react";

import type { ReadyMediaAsset } from "@/editor-core/model";
import { preparePreviewMeteringData } from "./preview-metering-preparation";
import type {
	PreviewMeteringPreparationFailure,
	PreviewMeteringPreparationResult,
	PreviewMeteringTrackStates,
} from "./preview-metering-preparation.types";
import type {
	PreviewMeteringPreparation,
	UsePreviewMeteringPreparationOptions,
} from "./use-preview-metering-preparation.types";

type PreviewMeteringTarget = {
	asset: ReadyMediaAsset;
	generation: number;
	source: Blob;
};

type PreparationRun = PreviewMeteringTarget & {
	trackIds: ReadonlySet<string>;
};

export function usePreviewMeteringPreparation({
	activeMediaAssetCleanupScope,
	asset,
	enabled,
	prepare = preparePreviewMeteringData,
	source,
}: UsePreviewMeteringPreparationOptions): PreviewMeteringPreparation {
	const [trackStates, setTrackStates] = useState<PreviewMeteringTrackStates>(
		{},
	);
	const abortControllersRef = useRef(new Set<AbortController>());
	const generationRef = useRef(0);
	const prepareRef = useRef(prepare);
	const targetRef = useRef<PreviewMeteringTarget | null>(null);

	useEffect(() => {
		prepareRef.current = prepare;
	}, [prepare]);

	const cancelPendingPreparations = useCallback(() => {
		for (const abortController of abortControllersRef.current) {
			abortController.abort();
		}

		abortControllersRef.current.clear();
	}, []);

	const beginPreparation = useCallback(
		({ asset, generation, source, trackIds }: PreparationRun) => {
			if (trackIds.size === 0) {
				return;
			}

			const abortController = new AbortController();
			abortControllersRef.current.add(abortController);
			setTrackStates((currentStates) =>
				markTracksPreparing({
					currentStates,
					trackIds,
				}),
			);

			void prepareRef
				.current({
					asset,
					signal: abortController.signal,
					source,
					trackIds,
				})
				.then((result) => {
					if (
						abortController.signal.aborted ||
						generationRef.current !== generation
					) {
						return;
					}

					setTrackStates((currentStates) =>
						applyPreparationResult({
							currentStates,
							result,
							trackIds,
						}),
					);
				})
				.catch((error: unknown) => {
					if (
						isAbortError(error) ||
						abortController.signal.aborted ||
						generationRef.current !== generation
					) {
						return;
					}

					setTrackStates((currentStates) =>
						markTracksUnavailable({
							currentStates,
							reason: errorToMessage(error),
							trackIds,
						}),
					);
				})
				.finally(() => {
					abortControllersRef.current.delete(abortController);
				});
		},
		[],
	);

	useEffect(() => {
		cancelPendingPreparations();
		const generation = generationRef.current + 1;
		generationRef.current = generation;

		if (!enabled || !asset || !source) {
			targetRef.current = null;
			setTrackStates({});
			return;
		}

		const trackIds = new Set(asset.tracks.audio.map((track) => track.id));
		targetRef.current = {
			asset,
			generation,
			source,
		};
		setTrackStates(
			Object.fromEntries(
				asset.tracks.audio.map((track) => [
					track.id,
					{
						status: "preparing" as const,
						trackId: track.id,
					},
				]),
			),
		);
		beginPreparation({
			asset,
			generation,
			source,
			trackIds,
		});

		return () => {
			cancelPendingPreparations();
		};
	}, [asset, beginPreparation, cancelPendingPreparations, enabled, source]);

	useEffect(() => {
		if (!activeMediaAssetCleanupScope) {
			return;
		}

		const cleanupRegistration = activeMediaAssetCleanupScope.registerCleanup(
			() => {
				cancelPendingPreparations();
			},
		);

		return () => {
			cleanupRegistration.dispose();
		};
	}, [activeMediaAssetCleanupScope, cancelPendingPreparations]);

	const retryTrack = useCallback(
		(trackId: string) => {
			const target = targetRef.current;

			if (!target) {
				return;
			}

			if (!target.asset.tracks.audio.some((track) => track.id === trackId)) {
				return;
			}

			beginPreparation({
				...target,
				trackIds: new Set([trackId]),
			});
		},
		[beginPreparation],
	);

	return {
		retryTrack,
		trackStates,
	};
}

function markTracksPreparing({
	currentStates,
	trackIds,
}: {
	currentStates: PreviewMeteringTrackStates;
	trackIds: ReadonlySet<string>;
}): PreviewMeteringTrackStates {
	const nextStates = { ...currentStates };

	for (const trackId of trackIds) {
		nextStates[trackId] = {
			status: "preparing",
			trackId,
		};
	}

	return nextStates;
}

function applyPreparationResult({
	currentStates,
	result,
	trackIds,
}: {
	currentStates: PreviewMeteringTrackStates;
	result: PreviewMeteringPreparationResult;
	trackIds: ReadonlySet<string>;
}): PreviewMeteringTrackStates {
	const nextStates = { ...currentStates };
	const preparedByTrackId = new Map(
		result.tracks.map((prepared) => [prepared.trackId, prepared]),
	);
	const failuresByTrackId = new Map(
		result.failures.map((failure) => [failure.trackId, failure]),
	);

	for (const trackId of trackIds) {
		const prepared = preparedByTrackId.get(trackId);

		if (prepared) {
			nextStates[trackId] = {
				prepared,
				status: "ready",
				trackId,
			};
			continue;
		}

		const failure = failuresByTrackId.get(trackId);
		nextStates[trackId] = {
			reason: failure?.reason ?? "Preview metering data could not be prepared.",
			status: "unavailable",
			trackId,
		};
	}

	return nextStates;
}

function markTracksUnavailable({
	currentStates,
	reason,
	trackIds,
}: {
	currentStates: PreviewMeteringTrackStates;
	reason: string;
	trackIds: ReadonlySet<string>;
}): PreviewMeteringTrackStates {
	const failures: PreviewMeteringPreparationFailure[] = Array.from(
		trackIds,
		(trackId) => ({
			reason,
			track: {
				id: trackId,
				kind: "audio",
			},
			trackId,
			trackIndex: 0,
		}),
	);

	return applyPreparationResult({
		currentStates,
		result: {
			failures,
			tracks: [],
		},
		trackIds,
	});
}

function isAbortError(error: unknown) {
	return (
		(error instanceof DOMException && error.name === "AbortError") ||
		(error instanceof Error && error.name === "AbortError")
	);
}

function errorToMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}
