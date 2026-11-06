import {
	type AudioMixPlanTrack,
	createAudioMixPlan,
} from "@/editor-core/audio-mix-plan";
import type { AudioMix, ReadyMediaAsset } from "@/editor-core/model";
import {
	PREVIEW_AUDIO_WINDOW_HORIZON_SECONDS,
	PREVIEW_AUDIO_WINDOW_LOW_WATER_SECONDS,
} from "./preview-audio-window-policy";

import type {
	CreatePreviewAudioEngineOptions,
	PreviewAudioContextLike,
	PreviewAudioEngine,
} from "../types/preview-audio-engine.types";
import type { PreviewAudioResource } from "../types/preview-audio-resources.types";
import { createPreviewAudioGraph } from "./preview-audio-graph";
import { createPreviewAudioWindowController } from "./preview-audio-window-controller";
import { createPreviewOutputTime } from "./preview-output-time";
import { PREVIEW_OUTPUT_TIMING_ENABLED } from "./preview-output-timing-enabled";
import { createScheduledWindowEngine } from "./scheduled-window-engine";

export function canUsePreviewAudioEngine(asset: ReadyMediaAsset) {
	return (
		asset.tracks.audio.length > 0 &&
		typeof window !== "undefined" &&
		typeof AudioContext !== "undefined" &&
		typeof AudioBuffer !== "undefined"
	);
}

export async function createPreviewAudioEngine({
	createAudioContext = () =>
		new AudioContext() as unknown as PreviewAudioContextLike,
	provider,
	outputTimingEnabled = PREVIEW_OUTPUT_TIMING_ENABLED,
	outputChannels,
	resources,
	initialTimeSeconds = 0,
	initialPlaybackRate = 1,
	signal,
}: CreatePreviewAudioEngineOptions): Promise<PreviewAudioEngine> {
	if (signal?.aborted)
		throw new DOMException("Preview audio preparation aborted.", "AbortError");
	const audioContext = createAudioContext();
	let ownedGraph: ReturnType<typeof createPreviewAudioGraph> | null = null;
	let scheduler: ReturnType<typeof createScheduledWindowEngine>;
	try {
		ownedGraph = createPreviewAudioGraph(
			audioContext,
			resources,
			outputChannels,
		);
		scheduler = createScheduledWindowEngine({
			createAudioContext: () => audioContext,
			contextLifecycleManaged: true,
			durationSeconds: provider.durationSeconds,
			horizonSeconds: PREVIEW_AUDIO_WINDOW_HORIZON_SECONDS,
			lowWaterSeconds: PREVIEW_AUDIO_WINDOW_LOW_WATER_SECONDS,
			trackIds: resources.map((resource) => resource.trackId),
			trackDestination: ownedGraph.destination,
		});
	} catch (error) {
		ownedGraph?.destroy();
		if (audioContext.state !== "closed") await audioContext.close?.();
		throw error;
	}
	const graph = ownedGraph;
	const outputTime = createPreviewOutputTime();
	const controller = createPreviewAudioWindowController(
		provider,
		scheduler,
		initialPlaybackRate,
		audioContext,
	);
	let destroyed = false;
	const unsubscribeGainLifecycle = controller.subscribe(() => {
		if (!scheduler.isPlaying()) graph.settleGains();
	});
	const destroy = () => {
		if (destroyed) return;
		destroyed = true;
		unsubscribeGainLifecycle();
		signal?.removeEventListener("abort", destroy);
		controller.destroy();
		graph.destroy();
	};
	signal?.addEventListener("abort", destroy, { once: true });
	try {
		scheduler.setPlaybackRate(initialPlaybackRate);
		await controller.prepare(initialTimeSeconds);
		if (destroyed)
			throw new DOMException(
				"Preview audio preparation aborted.",
				"AbortError",
			);
	} catch (error) {
		destroy();
		throw error;
	}
	return {
		destroy,
		getCurrentTime: scheduler.getCurrentTime,
		getPresentationTime() {
			const fallback = scheduler.getCurrentTime();
			if (!outputTimingEnabled) return fallback;
			let timestamp:
				| ReturnType<NonNullable<PreviewAudioContextLike["getOutputTimestamp"]>>
				| undefined;
			try {
				timestamp = audioContext.getOutputTimestamp?.();
			} catch {
				/* Browser timestamp unavailable. */
			}
			return outputTime.read({
				epoch:
					controller.getPlaybackState() === "playing"
						? scheduler.getPlaybackEpoch()
						: null,
				renderingTimeSeconds: fallback,
				contextTimeSeconds: audioContext.currentTime,
				performanceTimeMilliseconds: performance.now(),
				timestamp,
			});
		},
		getStatus: scheduler.getStatus,
		getPlaybackState: controller.getPlaybackState,
		subscribe: controller.subscribe,
		getMetrics: controller.getMetrics,
		pause() {
			controller.pause();
			graph.settleGains();
		},
		play: controller.play,
		retryTrack: controller.retryTrack,
		setTime: controller.setTime,
		setPlaybackRate: controller.setPlaybackRate,
		setPlaybackEnd: scheduler.setPlaybackEnd,
		readMeterSnapshot: () =>
			graph.readMeterSnapshot(scheduler.isPlaying(), controller.getFailures()),
		setOutputGain(gain) {
			if (destroyed) return;
			graph.setOutputGain(gain, scheduler.isPlaying());
		},
		setTrackMonitorGain(index, gain) {
			if (destroyed) return;
			graph.setTrackMonitorGain(index, gain, scheduler.isPlaying());
		},
		setTrackVolumeGain(index, gain) {
			if (destroyed) return;
			graph.setTrackVolumeGain(index, gain, scheduler.isPlaying());
		},
		setTrackChannelMode(index, mode) {
			if (destroyed) return;
			if (graph.setTrackChannelMode(index, mode))
				void controller.rebuildRouting();
		},
	};
}

function previewTrackMonitorGainForAudioMixPlanTrack({
	soloedAudioTrackId,
	trackPlan,
}: {
	soloedAudioTrackId?: string | null;
	trackPlan: AudioMixPlanTrack | undefined;
}) {
	if (soloedAudioTrackId && trackPlan?.trackId !== soloedAudioTrackId) {
		return 0;
	}

	if (!soloedAudioTrackId && trackPlan?.include === false) {
		return 0;
	}

	return 1;
}

export function applyPreviewAudioEngineMix({
	audioMix,
	muted,
	previewAudioEngine,
	soloedAudioTrackId,
	resources,
	volume,
}: {
	audioMix: AudioMix;
	muted: boolean;
	previewAudioEngine: PreviewAudioEngine;
	soloedAudioTrackId?: string | null;
	resources: PreviewAudioResource[];
	volume: number;
}) {
	previewAudioEngine.setOutputGain(muted ? 0 : volume);

	const mixPlan = createAudioMixPlan({
		audioMix,
		trackIds: resources.map((resource) => resource.trackId),
	});

	resources.forEach((resource, resourceIndex) => {
		const trackPlan = mixPlan.tracksById[resource.trackId];

		previewAudioEngine.setTrackChannelMode(
			resourceIndex,
			trackPlan?.channelMode ?? "preserve",
		);
		previewAudioEngine.setTrackVolumeGain(
			resourceIndex,
			trackPlan?.trackVolumeGain ?? 1,
		);
		previewAudioEngine.setTrackMonitorGain(
			resourceIndex,
			previewTrackMonitorGainForAudioMixPlanTrack({
				soloedAudioTrackId,
				trackPlan,
			}),
		);
	});
}
