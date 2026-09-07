import {
	type AudioMixPlanTrack,
	createAudioMixPlan,
} from "@/editor-core/audio-mix-plan";
import type {
	AudioMix,
	AudioTrackChannelMode,
	ReadyMediaAsset,
} from "@/editor-core/model";

import type { PreviewAudioResource } from "../types/preview-audio-resources.types";
import type { MediaWindowProvider } from "./media-window-provider";
import { createPreviewAudioGraph } from "./preview-audio-graph";
import { createPreviewAudioWindowController } from "./preview-audio-window-controller";
import {
	type ScheduledWindowEngineStatus,
	createScheduledWindowEngine,
} from "./scheduled-window-engine";

export type PreviewAudioEngine = {
	destroy: () => void;
	subscribe: (listener: () => void) => () => void;
	getMetrics: () => ReturnType<
		ReturnType<typeof createPreviewAudioWindowController>["getMetrics"]
	>;
	retryTrack: (trackId: string) => Promise<void>;
	setPlaybackEnd: (endSeconds: number | null) => void;
	getCurrentTime: () => number;
	getStatus: () => PreviewAudioEngineStatus;
	pause: () => void;
	play: () => Promise<void>;
	readMeterSnapshot: () => PreviewAudioEngineMeterSnapshot;
	setOutputGain: (gain: number) => void;
	setPlaybackRate: (playbackRate: number) => Promise<void>;
	setTime: (timeSeconds: number) => Promise<void>;
	setTrackChannelMode: (
		trackIndex: number,
		channelMode: AudioTrackChannelMode,
	) => void;
	setTrackMonitorGain: (trackIndex: number, gain: number) => void;
	setTrackVolumeGain: (trackIndex: number, gain: number) => void;
};

export type PreviewAudioEngineStatus = ScheduledWindowEngineStatus;

export type PreviewAudioEngineMeterChannel = {
	label: string;
	peak: number;
};

export type PreviewAudioEngineTrackMeterState =
	| {
			channels: PreviewAudioEngineMeterChannel[];
			status: "ready";
			trackId: string;
	  }
	| {
			reason: string;
			status: "unavailable";
			trackId: string;
	  };

export type PreviewAudioEngineCombinedMeterState =
	| {
			channels: PreviewAudioEngineMeterChannel[];
			partial: boolean;
			reason?: string;
			status: "ready";
	  }
	| {
			reason: string;
			status: "unavailable";
	  };

export type PreviewAudioEngineMeterSnapshot = {
	combinedState: PreviewAudioEngineCombinedMeterState;
	trackStates: Record<string, PreviewAudioEngineTrackMeterState>;
};

export type PreviewAudioContextLike = {
	close?: () => Promise<void> | void;
	createAnalyser: () => PreviewAudioAnalyserNodeLike;
	createBufferSource: () => PreviewAudioBufferSourceNodeLike;
	createChannelMerger?: (numberOfInputs?: number) => PreviewAudioNodeLike;
	createChannelSplitter?: (numberOfOutputs?: number) => PreviewAudioNodeLike;
	createGain: () => PreviewAudioGainNodeLike;
	currentTime: number;
	destination: PreviewAudioNodeLike;
	resume?: () => Promise<void> | void;
	sampleRate: number;
};

export type PreviewAudioNodeLike = {
	channelCount?: number;
	channelCountMode?: "clamped-max" | "explicit" | "max";
	channelInterpretation?: "discrete" | "speakers";
	connect: (
		destination: PreviewAudioNodeLike,
		output?: number,
		input?: number,
	) => unknown;
	disconnect?: (destination?: PreviewAudioNodeLike) => void;
};

export type PreviewAudioAnalyserNodeLike = PreviewAudioNodeLike & {
	fftSize: number;
	getFloatTimeDomainData: (array: Float32Array) => void;
};

export type PreviewAudioGainNodeLike = PreviewAudioNodeLike & {
	gain: {
		value: number;
	};
};

export type PreviewAudioBufferSourceNodeLike = PreviewAudioNodeLike & {
	buffer: AudioBuffer | null;
	onended: (() => void) | null;
	playbackRate: {
		value: number;
	};
	start: (when?: number, offset?: number, duration?: number) => void;
	stop: () => void;
};

export type CreatePreviewAudioEngineOptions = {
	createAudioContext?: () => PreviewAudioContextLike;
	provider: MediaWindowProvider;
	initialTimeSeconds?: number;
	initialPlaybackRate?: number;
	signal?: AbortSignal;
	outputChannels: number;
	resources: PreviewAudioResource[];
};

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
			durationSeconds: provider.durationSeconds,
			horizonSeconds: 2,
			lowWaterSeconds: 1.5,
			trackIds: resources.map((resource) => resource.trackId),
			trackDestination: ownedGraph.destination,
		});
	} catch (error) {
		ownedGraph?.destroy();
		await audioContext.close?.();
		throw error;
	}
	const graph = ownedGraph;
	const controller = createPreviewAudioWindowController(
		provider,
		scheduler,
		initialPlaybackRate,
	);
	let destroyed = false;
	const destroy = () => {
		if (destroyed) return;
		destroyed = true;
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
		getStatus: scheduler.getStatus,
		subscribe: controller.subscribe,
		getMetrics: controller.getMetrics,
		pause: controller.pause,
		play: controller.play,
		retryTrack: controller.retryTrack,
		setTime: controller.setTime,
		setPlaybackRate: controller.setPlaybackRate,
		setPlaybackEnd: scheduler.setPlaybackEnd,
		readMeterSnapshot: () =>
			graph.readMeterSnapshot(scheduler.isPlaying(), controller.getFailures()),
		setOutputGain: graph.setOutputGain,
		setTrackMonitorGain: graph.setTrackMonitorGain,
		setTrackVolumeGain: graph.setTrackVolumeGain,
		setTrackChannelMode(index, mode) {
			if (destroyed) return;
			if (graph.setTrackChannelMode(index, mode))
				void controller.rebuildRouting();
		},
	};
}

export function previewTrackVolumeGainForAudioTrackResource({
	audioMix,
	resource,
}: {
	audioMix: AudioMix;
	resource: PreviewAudioResource;
}) {
	const plan = createAudioMixPlan({
		audioMix,
		trackIds: [resource.trackId],
	});

	return plan.tracksById[resource.trackId]?.trackVolumeGain ?? 1;
}

export function previewTrackMonitorGainForAudioTrackResource({
	audioMix,
	soloedAudioTrackId,
	resource,
}: {
	audioMix: AudioMix;
	soloedAudioTrackId?: string | null;
	resource: PreviewAudioResource;
}) {
	const plan = createAudioMixPlan({
		audioMix,
		trackIds: [resource.trackId],
	});
	const trackPlan = plan.tracksById[resource.trackId];

	return previewTrackMonitorGainForAudioMixPlanTrack({
		soloedAudioTrackId,
		trackPlan,
	});
}

export function previewOutputGainForAudioMonitoring({
	muted,
	volume,
}: {
	muted: boolean;
	volume: number;
}) {
	if (muted) {
		return 0;
	}

	return clampPreviewVolume(volume);
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
	previewAudioEngine.setOutputGain(
		previewOutputGainForAudioMonitoring({ muted, volume }),
	);

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

export function setPreviewAudioEnginePlaybackRate(
	previewAudioEngine: PreviewAudioEngine | null,
	playbackRate: number,
) {
	previewAudioEngine?.setPlaybackRate(playbackRate);
}

function clampPreviewVolume(volume: number) {
	return Number.isFinite(volume) ? Math.max(0, Math.min(volume, 1)) : 1;
}
