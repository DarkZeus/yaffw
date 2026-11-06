import type { AudioTrackChannelMode } from "@/editor-core/model";
import type { MediaWindowProvider } from "../engine/media-window-provider";
import type { PreviewAudioContextLifecycleSource } from "../engine/preview-audio-context-lifecycle";
import type { PreviewGainParam } from "../engine/preview-gain-transition";
import type {
	ScheduledWindowEngineMetrics,
	ScheduledWindowEngineStatus,
} from "../engine/scheduled-window-engine";
import type { PreviewAudioResource } from "./preview-audio-resources.types";

export type PreviewAudioEngine = {
	destroy: () => void;
	subscribe: (listener: () => void) => () => void;
	getMetrics: () => {
		generationsOpened: number;
		generationsCancelled: number;
		stalePullResults: number;
		trackRetries: number;
		cleanupCount: number;
		activeTimers: number;
		engine: ScheduledWindowEngineMetrics;
	};
	retryTrack: (trackId: string) => Promise<void>;
	setPlaybackEnd: (endSeconds: number | null) => void;
	getCurrentTime: () => number;
	getPresentationTime: () => number;
	getStatus: () => PreviewAudioEngineStatus;
	getPlaybackState: () => PreviewAudioPlaybackState;
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

/** Playback availability is separate from decoded-track readiness and clock authority. */
export type PreviewAudioPlaybackState =
	| "paused"
	| "playing"
	| "buffering"
	| "interrupted"
	| "recovery-required"
	| "closed";

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

export type PreviewAudioContextLike = PreviewAudioContextLifecycleSource & {
	close?: () => Promise<void> | void;
	createAnalyser: () => PreviewAudioAnalyserNodeLike;
	createBufferSource: () => PreviewAudioBufferSourceNodeLike;
	createChannelMerger?: (numberOfInputs?: number) => PreviewAudioNodeLike;
	createChannelSplitter?: (numberOfOutputs?: number) => PreviewAudioNodeLike;
	createGain: () => PreviewAudioGainNodeLike;
	currentTime: number;
	getOutputTimestamp?: () => { contextTime?: number; performanceTime?: number };
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
	gain: PreviewGainParam;
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
	outputTimingEnabled?: boolean;
	provider: MediaWindowProvider;
	initialTimeSeconds?: number;
	initialPlaybackRate?: number;
	signal?: AbortSignal;
	outputChannels: number;
	resources: PreviewAudioResource[];
};
