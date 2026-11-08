import { runWorkerJob } from "../../media-work/workers/worker-job";
import type {
	WaveformLaneRequest,
	WaveformLaneResult,
	WaveformWorkerRequest,
} from "../types/selection-waveform-lanes.types";
import {
	createWaveformAbortError,
	isWaveformAbortError,
	loadDecodedWaveformLane,
} from "./selection-waveform-lanes-loader";
import WaveformLaneWorker from "./selection-waveform-lanes.worker?worker";

export {
	WAVEFORM_SAMPLE_COUNT,
	addAudioSampleToBuckets,
	loadDecodedWaveformLane,
} from "./selection-waveform-lanes-loader";

const MAX_WAVEFORM_CACHE_ENTRIES_PER_SOURCE = 8;

let waveformLaneResultCache = new WeakMap<
	Blob,
	Map<string, WaveformLaneResult>
>();

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

	if (!result) {
		result = await loadDecodedWaveformLane({
			assetDurationUs,
			signal,
			source,
			trackIndex,
		});
	}

	if (signal?.aborted) throw createWaveformAbortError();

	if (result.status === "ready") {
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
	return runWorkerJob<WaveformWorkerRequest, WaveformLaneResult>({
		createWorker: () => new WaveformLaneWorker(),
		request: { assetDurationUs, source, trackIndex },
		signal,
		createAbortError: createWaveformAbortError,
		failureMessage: "Waveform worker failed.",
	});
}

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
