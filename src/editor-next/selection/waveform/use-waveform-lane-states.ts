import { useEffect, useMemo, useState } from "react";
import type { AudioMediaTrack, ReadyMediaAsset } from "@/editor-core/model";
import { errorMessage } from "@/lib/error-message";
import type { ActiveMediaAssetCleanupScope } from "../../media-work/scopes/active-media-asset-cleanup-scope";
import type {
	WaveformLaneLoader,
	WaveformLaneResult,
	WaveformLaneState,
} from "../types/selection-waveform-lanes.types";

export function useWaveformLaneStates({
	activeMediaAssetCleanupScope,
	asset,
	source,
	waveformLaneLoader,
}: {
	activeMediaAssetCleanupScope?: ActiveMediaAssetCleanupScope;
	asset: ReadyMediaAsset;
	source: Blob;
	waveformLaneLoader: WaveformLaneLoader;
}) {
	const request = useMemo(
		() => ({
			activeMediaAssetCleanupScope,
			asset,
			source,
			waveformLaneLoader,
			initialStates: Object.fromEntries(
				asset.tracks.audio.map((track) => [
					track.id,
					{ status: "loading", track } satisfies WaveformLaneState,
				]),
			),
		}),
		[activeMediaAssetCleanupScope, asset, source, waveformLaneLoader],
	);
	const [published, setPublished] = useState<{
		request: typeof request;
		states: Record<string, WaveformLaneState>;
	} | null>(null);

	useEffect(() => {
		if (request.asset.tracks.audio.length === 0) return;

		const controller = new AbortController();
		const registration = request.activeMediaAssetCleanupScope?.registerCleanup(
			() => controller.abort(),
		);
		request.asset.tracks.audio.forEach((track, index) => {
			void loadLane(track, index);
		});

		async function loadLane(track: AudioMediaTrack, trackIndex: number) {
			if (controller.signal.aborted) return;

			let result: WaveformLaneResult;
			try {
				result = await request.waveformLaneLoader({
					assetDurationUs: request.asset.durationUs,
					signal: controller.signal,
					source: request.source,
					track,
					trackIndex,
				});
			} catch (error) {
				result = { status: "unavailable", reason: errorMessage(error) };
			}
			if (controller.signal.aborted) return;

			setPublished((current) => ({
				request,
				states: {
					...(current?.request === request
						? current.states
						: request.initialStates),
					[track.id]: { ...result, track },
				},
			}));
		}

		return registration ? registration.dispose : () => controller.abort();
	}, [request]);

	return published?.request === request
		? published.states
		: request.initialStates;
}
