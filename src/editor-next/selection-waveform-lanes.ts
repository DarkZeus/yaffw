import { useEffect, useState } from "react";

import type { ReadyMediaAsset } from "@/editor-core/model";

import {
	createWaveformAbortError,
	isWaveformAbortError,
	loadWaveformLaneOnCurrentThread,
} from "./selection-waveform-lanes-loader";
import type {
	WaveformLaneLoader,
	WaveformLaneRequest,
	WaveformLaneResult,
	WaveformLaneState,
} from "./selection-waveform-lanes.types";
import WaveformLaneWorker from "./selection-waveform-lanes.worker?worker";

export {
	WAVEFORM_SAMPLE_COUNT,
	addAudioBufferToBuckets,
	loadWaveformLaneOnCurrentThread,
} from "./selection-waveform-lanes-loader";

const MAX_WAVEFORM_CACHE_ENTRIES_PER_SOURCE = 8;

let waveformLaneResultCache = new WeakMap<
	Blob,
	Map<string, WaveformLaneResult>
>();

let nextWorkerRequestId = 0;

export function useWaveformLaneStates({
	asset,
	source,
	waveformLaneLoader,
}: {
	asset: ReadyMediaAsset;
	source: Blob;
	waveformLaneLoader: WaveformLaneLoader;
}) {
	const [laneStates, setLaneStates] = useState<
		Record<string, WaveformLaneState>
	>({});

	useEffect(() => {
		let cancelled = false;
		const abortController = new AbortController();

		setLaneStates(
			Object.fromEntries(
				asset.tracks.audio.map((track) => [
					track.id,
					{
						status: "loading",
						track,
					} satisfies WaveformLaneState,
				]),
			),
		);

		asset.tracks.audio.forEach((track, trackIndex) => {
			void waveformLaneLoader({
				assetDurationUs: asset.durationUs,
				signal: abortController.signal,
				source,
				track,
				trackIndex,
			})
				.then((result) => {
					if (cancelled) {
						return;
					}

					setLaneStates((currentStates) => ({
						...currentStates,
						[track.id]: {
							...result,
							track,
						},
					}));
				})
				.catch((error: unknown) => {
					if (cancelled) {
						return;
					}

					setLaneStates((currentStates) => ({
						...currentStates,
						[track.id]: {
							reason: errorToMessage(error),
							status: "unavailable",
							track,
						},
					}));
				});
		});

		return () => {
			cancelled = true;
			abortController.abort();
		};
	}, [asset.durationUs, asset.tracks.audio, source, waveformLaneLoader]);

	return laneStates;
}

export async function loadBrowserWaveformLane({
	assetDurationUs,
	signal,
	source,
	track,
	trackIndex,
}: WaveformLaneRequest): Promise<WaveformLaneResult> {
	if (signal?.aborted) {
		throw createWaveformAbortError();
	}

	const cachedResult = readCachedWaveformLaneResult({
		assetDurationUs,
		source,
		trackIndex,
	});
	if (cachedResult) {
		return cachedResult;
	}

	let result: WaveformLaneResult | null = null;

	if (canUseWaveformWorker()) {
		try {
			result = await loadWorkerWaveformLane({
				assetDurationUs,
				signal,
				source,
				track,
				trackIndex,
			});
		} catch (error) {
			if (signal?.aborted || isWaveformAbortError(error)) {
				throw createWaveformAbortError();
			}
		}
	}

	if (result?.status !== "ready") {
		result = await loadWaveformLaneOnCurrentThread({
			assetDurationUs,
			signal,
			source,
			trackIndex,
		});
	}

	if (result.status === "ready" && !signal?.aborted) {
		writeCachedWaveformLaneResult(
			{
				assetDurationUs,
				source,
				trackIndex,
			},
			result,
		);
	}

	return result;
}

export function clearWaveformLaneCache() {
	waveformLaneResultCache = new WeakMap();
}

function loadWorkerWaveformLane({
	assetDurationUs,
	signal,
	source,
	trackIndex,
}: WaveformLaneRequest): Promise<WaveformLaneResult> {
	if (signal?.aborted) {
		return Promise.reject(createWaveformAbortError());
	}

	return new Promise((resolve, reject) => {
		const requestId = nextWorkerRequestId++;
		const worker = new WaveformLaneWorker();

		let settled = false;

		function cleanup() {
			signal?.removeEventListener("abort", handleAbort);
			worker.removeEventListener("error", handleError);
			worker.removeEventListener("message", handleMessage);
			worker.terminate();
		}

		function resolveSettled(value: WaveformLaneResult) {
			if (settled) {
				return;
			}

			settled = true;
			cleanup();
			resolve(value);
		}

		function rejectSettled(error: Error) {
			if (settled) {
				return;
			}

			settled = true;
			cleanup();
			reject(error);
		}

		function handleAbort() {
			rejectSettled(createWaveformAbortError());
		}

		function handleError(event: ErrorEvent) {
			rejectSettled(new Error(event.message || "Waveform worker failed."));
		}

		function handleMessage(event: MessageEvent<WaveformWorkerResponseMessage>) {
			if (event.data.requestId !== requestId) {
				return;
			}

			resolveSettled(event.data.result);
		}

		signal?.addEventListener("abort", handleAbort, { once: true });
		worker.addEventListener("error", handleError);
		worker.addEventListener("message", handleMessage);
		worker.postMessage({
			request: {
				assetDurationUs,
				source,
				trackIndex,
			},
			requestId,
			type: "generate",
		} satisfies WaveformWorkerRequestMessage);
	});
}

type WaveformWorkerRequestMessage = {
	request: Omit<WaveformLaneRequest, "signal" | "track">;
	requestId: number;
	type: "generate";
};

type WaveformWorkerResponseMessage = {
	requestId: number;
	result: WaveformLaneResult;
	type: "done";
};

function readCachedWaveformLaneResult({
	assetDurationUs,
	source,
	trackIndex,
}: Pick<WaveformLaneRequest, "assetDurationUs" | "source" | "trackIndex">) {
	return waveformLaneResultCache
		.get(source)
		?.get(createWaveformLaneCacheKey({ assetDurationUs, trackIndex }));
}

function writeCachedWaveformLaneResult(
	{
		assetDurationUs,
		source,
		trackIndex,
	}: Pick<WaveformLaneRequest, "assetDurationUs" | "source" | "trackIndex">,
	result: WaveformLaneResult,
) {
	let sourceCache = waveformLaneResultCache.get(source);
	if (!sourceCache) {
		sourceCache = new Map();
		waveformLaneResultCache.set(source, sourceCache);
	}

	const cacheKey = createWaveformLaneCacheKey({ assetDurationUs, trackIndex });
	sourceCache.delete(cacheKey);
	sourceCache.set(cacheKey, result);

	while (sourceCache.size > MAX_WAVEFORM_CACHE_ENTRIES_PER_SOURCE) {
		const oldestKey = sourceCache.keys().next().value;
		if (!oldestKey) {
			break;
		}
		sourceCache.delete(oldestKey);
	}
}

function createWaveformLaneCacheKey({
	assetDurationUs,
	trackIndex,
}: Pick<WaveformLaneRequest, "assetDurationUs" | "trackIndex">) {
	return [assetDurationUs, trackIndex].join(":");
}

function canUseWaveformWorker() {
	return typeof Worker !== "undefined";
}

function errorToMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}
