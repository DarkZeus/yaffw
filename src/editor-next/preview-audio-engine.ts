import { audioTrackVolumePercentToGain } from "@/editor-core/audio-mix";
import type {
	AudioMix,
	AudioTrackChannelMode,
	ReadyMediaAsset,
} from "@/editor-core/model";

import {
	outputChannelCountForMode,
	resolveChannelTransform,
} from "./browser-audio-mix";
import type { ResolvedChannelTransform } from "./browser-audio-mix.types";
import type { BrowserAudioPreviewSource } from "./browser-audio-preview-sources.types";

export type PreviewAudioEngine = {
	destroy: () => void;
	getCurrentTime: () => number;
	pause: () => void;
	play: () => Promise<void>;
	readMeterSnapshot: (
		options: ReadPreviewAudioEngineMeterSnapshotOptions,
	) => PreviewAudioEngineMeterSnapshot;
	setOutputGain: (gain: number) => void;
	setPlaybackRate: (playbackRate: number) => void;
	setTime: (timeSeconds: number) => void;
	setTrackChannelMode: (
		trackIndex: number,
		channelMode: AudioTrackChannelMode,
	) => void;
	setTrackMonitorGain: (trackIndex: number, gain: number) => void;
	setTrackVolumeGain: (trackIndex: number, gain: number) => void;
};

export type ReadPreviewAudioEngineMeterSnapshotOptions = {
	outputChannels: number;
};

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
	createBufferSource: () => PreviewAudioBufferSourceNodeLike;
	createChannelMerger?: (numberOfInputs?: number) => PreviewAudioNodeLike;
	createChannelSplitter?: (numberOfOutputs?: number) => PreviewAudioNodeLike;
	createGain: () => PreviewAudioGainNodeLike;
	currentTime: number;
	decodeAudioData: (audioData: ArrayBuffer) => Promise<AudioBuffer>;
	destination: PreviewAudioNodeLike;
	resume?: () => Promise<void> | void;
};

export type PreviewAudioNodeLike = {
	connect: (
		destination: PreviewAudioNodeLike,
		output?: number,
		input?: number,
	) => unknown;
	disconnect?: () => void;
};

export type PreviewAudioGainNodeLike = PreviewAudioNodeLike & {
	gain: {
		value: number;
	};
};

export type PreviewAudioBufferSourceNodeLike = PreviewAudioNodeLike & {
	buffer: AudioBuffer | null;
	playbackRate: {
		value: number;
	};
	start: (when?: number, offset?: number) => void;
	stop: () => void;
};

export type CreatePreviewAudioEngineOptions = {
	createAudioContext?: () => PreviewAudioContextLike;
	sources: BrowserAudioPreviewSource[];
};

type PreviewAudioResource = {
	buffer: AudioBuffer;
	source: BrowserAudioPreviewSource;
};

type PreviewAudioEngineTrack = {
	channelMode: AudioTrackChannelMode;
	channelRouting: PreviewAudioTrackChannelRouting;
	gainNode: PreviewAudioGainNodeLike;
	monitorGain: number;
	resource: PreviewAudioResource;
	sourceNode: PreviewAudioBufferSourceNodeLike | null;
	trackVolumeGain: number;
};

type PreviewAudioTrackChannelRouting = {
	dispose: () => void;
	inputNode: PreviewAudioNodeLike;
};

type PreviewAudioMeterPlan = {
	labels: string[];
	outputChannels: number;
	resolvedMode: Exclude<AudioTrackChannelMode, "auto-one-sided-stereo">;
};

const PREVIEW_AUDIO_METERING_PEAK_WINDOW_SECONDS = 0.05;

export function canUsePreviewAudioEngine(asset: ReadyMediaAsset) {
	return (
		asset.tracks.audio.length > 0 &&
		typeof window !== "undefined" &&
		typeof AudioContext !== "undefined" &&
		typeof Blob.prototype.arrayBuffer === "function" &&
		typeof URL.createObjectURL === "function"
	);
}

export async function createPreviewAudioEngine({
	createAudioContext = createDefaultPreviewAudioContext,
	sources,
}: CreatePreviewAudioEngineOptions): Promise<PreviewAudioEngine> {
	const audioContext = createAudioContext();
	const resources = await Promise.all(
		sources.map(async (source) => ({
			buffer: await decodePreviewAudioResource(audioContext, source),
			source,
		})),
	);

	return createPreparedPreviewAudioEngine({
		audioContext,
		resources,
	});
}

export function previewTrackVolumeGainForAudioTrackSource({
	audioMix,
	source,
}: {
	audioMix: AudioMix;
	source: BrowserAudioPreviewSource;
}) {
	const decision = audioMix.tracks[source.trackId];

	return audioTrackVolumePercentToGain(decision?.volumePercent ?? 100);
}

export function previewTrackMonitorGainForAudioTrackSource({
	audioMix,
	soloedAudioTrackId,
	source,
}: {
	audioMix: AudioMix;
	soloedAudioTrackId?: string | null;
	source: BrowserAudioPreviewSource;
}) {
	const decision = audioMix.tracks[source.trackId];

	if (soloedAudioTrackId && source.trackId !== soloedAudioTrackId) {
		return 0;
	}

	if (!soloedAudioTrackId && decision?.include === false) {
		return 0;
	}

	return 1;
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

export function applyPreviewAudioEngineMix({
	audioMix,
	muted,
	previewAudioEngine,
	soloedAudioTrackId,
	sources,
	volume,
}: {
	audioMix: AudioMix;
	muted: boolean;
	previewAudioEngine: PreviewAudioEngine;
	soloedAudioTrackId?: string | null;
	sources: BrowserAudioPreviewSource[];
	volume: number;
}) {
	previewAudioEngine.setOutputGain(
		previewOutputGainForAudioMonitoring({ muted, volume }),
	);

	sources.forEach((source, sourceIndex) => {
		previewAudioEngine.setTrackChannelMode(
			sourceIndex,
			audioMix.tracks[source.trackId]?.channelMode ?? "preserve",
		);
		previewAudioEngine.setTrackVolumeGain(
			sourceIndex,
			previewTrackVolumeGainForAudioTrackSource({
				audioMix,
				source,
			}),
		);
		previewAudioEngine.setTrackMonitorGain(
			sourceIndex,
			previewTrackMonitorGainForAudioTrackSource({
				audioMix,
				soloedAudioTrackId,
				source,
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

function createPreparedPreviewAudioEngine({
	audioContext,
	resources,
}: {
	audioContext: PreviewAudioContextLike;
	resources: PreviewAudioResource[];
}): PreviewAudioEngine {
	const outputGainNode = audioContext.createGain();
	outputGainNode.gain.value = 1;
	outputGainNode.connect(audioContext.destination);

	const tracks: PreviewAudioEngineTrack[] = resources.map((resource) => {
		const gainNode = audioContext.createGain();
		gainNode.gain.value = 0;
		gainNode.connect(outputGainNode);

		return {
			channelMode: "preserve",
			channelRouting: createPreviewAudioTrackChannelRouting({
				audioContext,
				channelMode: "preserve",
				gainNode,
				resource,
			}),
			gainNode,
			monitorGain: 0,
			resource,
			sourceNode: null,
			trackVolumeGain: 1,
		};
	});
	let currentTimeSeconds = 0;
	let destroyed = false;
	let playing = false;
	let playbackRate = 1;
	let playbackStartContextTimeSeconds = audioContext.currentTime;
	let playbackStartMediaTimeSeconds = 0;

	function getCurrentTime() {
		if (!playing) {
			return currentTimeSeconds;
		}

		return Math.max(
			0,
			playbackStartMediaTimeSeconds +
				(audioContext.currentTime - playbackStartContextTimeSeconds) *
					playbackRate,
		);
	}

	function syncCurrentTimeFromContext() {
		currentTimeSeconds = getCurrentTime();
		playbackStartContextTimeSeconds = audioContext.currentTime;
		playbackStartMediaTimeSeconds = currentTimeSeconds;
	}

	function stopTrackSources() {
		for (const track of tracks) {
			if (!track.sourceNode) {
				continue;
			}

			try {
				track.sourceNode.stop();
			} catch {
				// A Web Audio source can only be stopped after it has started.
			}

			track.sourceNode.disconnect?.();
			track.sourceNode = null;
		}
	}

	function startTrackSources() {
		stopTrackSources();
		playbackStartContextTimeSeconds = audioContext.currentTime;
		playbackStartMediaTimeSeconds = currentTimeSeconds;

		for (const track of tracks) {
			const sourceNode = audioContext.createBufferSource();
			const trackStartSeconds = track.resource.source.startPositionSeconds;
			const offsetSeconds = currentTimeSeconds - trackStartSeconds;
			const startOffsetSeconds = Math.max(0, offsetSeconds);

			if (startOffsetSeconds >= track.resource.buffer.duration) {
				continue;
			}

			sourceNode.buffer = track.resource.buffer;
			sourceNode.playbackRate.value = playbackRate;
			sourceNode.connect(track.channelRouting.inputNode);

			const startDelaySeconds =
				offsetSeconds < 0 ? Math.abs(offsetSeconds) / playbackRate : 0;
			sourceNode.start(
				audioContext.currentTime + startDelaySeconds,
				startOffsetSeconds,
			);
			track.sourceNode = sourceNode;
		}
	}

	function readMeterSnapshot({
		outputChannels,
	}: ReadPreviewAudioEngineMeterSnapshotOptions): PreviewAudioEngineMeterSnapshot {
		const outputChannelCount =
			normalizePreviewAudioMeterOutputChannelCount(outputChannels);
		const playheadSeconds = getCurrentTime();
		const trackStates: Record<string, PreviewAudioEngineTrackMeterState> = {};
		const readyTracks = tracks.map((track) => ({
			...track,
			meterPlan: createPreviewAudioMeterPlan({
				audioBuffer: track.resource.buffer,
				channelMode: track.channelMode,
				outputChannelCount,
			}),
		}));

		for (const track of readyTracks) {
			const peaks = playing
				? samplePreviewAudioTrackPeakWindow({
						meterPlan: track.meterPlan,
						playheadSeconds,
						resource: track.resource,
						trackGain: track.trackVolumeGain,
					})
				: Array.from({ length: track.meterPlan.outputChannels }, () => 0);

			trackStates[track.resource.source.trackId] = {
				channels: createPreviewAudioMeterChannels({
					labels: track.meterPlan.labels,
					peaks,
				}),
				status: "ready",
				trackId: track.resource.source.trackId,
			};
		}

		const combinedPeaks = playing
			? sampleCombinedPreviewAudioPeakWindow({
					outputChannelCount,
					playheadSeconds,
					tracks: readyTracks,
				})
			: Array.from({ length: outputChannelCount }, () => 0);

		return {
			combinedState: {
				channels: createPreviewAudioMeterChannels({
					labels: createPreviewOutputChannelLabels(outputChannelCount),
					peaks: combinedPeaks,
				}),
				partial: false,
				status: "ready",
			},
			trackStates,
		};
	}

	return {
		destroy() {
			if (destroyed) {
				return;
			}

			destroyed = true;
			playing = false;
			stopTrackSources();

			for (const track of tracks) {
				track.channelRouting.dispose();
				track.gainNode.disconnect?.();
			}

			outputGainNode.disconnect?.();
			void audioContext.close?.();
		},
		getCurrentTime,
		pause() {
			if (destroyed || !playing) {
				return;
			}

			syncCurrentTimeFromContext();
			playing = false;
			stopTrackSources();
		},
		async play() {
			if (destroyed || playing) {
				return;
			}

			await audioContext.resume?.();

			if (destroyed || playing) {
				return;
			}

			playing = true;
			startTrackSources();
		},
		readMeterSnapshot,
		setPlaybackRate(nextPlaybackRate: number) {
			if (!playing) {
				playbackRate = clampPlaybackRate(nextPlaybackRate);
				return;
			}

			syncCurrentTimeFromContext();
			playbackRate = clampPlaybackRate(nextPlaybackRate);
			startTrackSources();
		},
		setOutputGain(gain: number) {
			outputGainNode.gain.value = clampPreviewVolume(gain);
		},
		setTime(nextTimeSeconds: number) {
			currentTimeSeconds = clampPreviewTime(nextTimeSeconds);

			if (!playing) {
				return;
			}

			startTrackSources();
		},
		setTrackChannelMode(
			trackIndex: number,
			channelMode: AudioTrackChannelMode,
		) {
			const track = tracks[trackIndex];

			if (!track || track.channelMode === channelMode) {
				return;
			}

			if (playing) {
				syncCurrentTimeFromContext();
				stopTrackSources();
			}

			track.channelMode = channelMode;
			track.channelRouting.dispose();
			track.channelRouting = createPreviewAudioTrackChannelRouting({
				audioContext,
				channelMode,
				gainNode: track.gainNode,
				resource: track.resource,
			});

			if (playing) {
				startTrackSources();
			}
		},
		setTrackMonitorGain(trackIndex: number, gain: number) {
			const track = tracks[trackIndex];

			if (!track) {
				return;
			}

			track.monitorGain = clampPreviewVolume(gain);
			updatePreviewAudioTrackGainNode(track);
		},
		setTrackVolumeGain(trackIndex: number, gain: number) {
			const track = tracks[trackIndex];

			if (!track) {
				return;
			}

			track.trackVolumeGain = clampPreviewVolume(gain);
			updatePreviewAudioTrackGainNode(track);
		},
	};
}

function updatePreviewAudioTrackGainNode(track: PreviewAudioEngineTrack) {
	track.gainNode.gain.value =
		clampPreviewVolume(track.trackVolumeGain) *
		clampPreviewVolume(track.monitorGain);
}

function createPreviewAudioTrackChannelRouting({
	audioContext,
	channelMode,
	gainNode,
	resource,
}: {
	audioContext: PreviewAudioContextLike;
	channelMode: AudioTrackChannelMode;
	gainNode: PreviewAudioGainNodeLike;
	resource: PreviewAudioResource;
}): PreviewAudioTrackChannelRouting {
	const resolvedChannelMode = resolvePreviewAudioChannelMode({
		audioBuffer: resource.buffer,
		channelMode,
	});

	if (
		resolvedChannelMode === "preserve" ||
		!audioContext.createChannelSplitter
	) {
		return {
			dispose: () => {},
			inputNode: gainNode,
		};
	}

	const splitter = audioContext.createChannelSplitter(
		Math.max(1, resource.buffer.numberOfChannels),
	);
	const createdNodes: PreviewAudioNodeLike[] = [splitter];

	if (
		resolvedChannelMode === "use-left-as-mono" ||
		resolvedChannelMode === "use-right-as-mono"
	) {
		const sourceChannelIndex = sourceChannelIndexForMode(
			resolvedChannelMode,
			resource.buffer,
		);
		splitter.connect(gainNode, sourceChannelIndex, 0);

		return {
			dispose: () => disconnectPreviewAudioNodes(createdNodes),
			inputNode: splitter,
		};
	}

	if (
		resolvedChannelMode === "duplicate-left-to-stereo" ||
		resolvedChannelMode === "duplicate-right-to-stereo"
	) {
		const sourceChannelIndex = sourceChannelIndexForMode(
			resolvedChannelMode,
			resource.buffer,
		);

		if (!audioContext.createChannelMerger) {
			splitter.connect(gainNode, sourceChannelIndex, 0);

			return {
				dispose: () => disconnectPreviewAudioNodes(createdNodes),
				inputNode: splitter,
			};
		}

		const merger = audioContext.createChannelMerger(
			Math.max(
				2,
				outputChannelCountForMode(resource.buffer, resolvedChannelMode),
			),
		);
		createdNodes.push(merger);
		splitter.connect(merger, sourceChannelIndex, 0);
		splitter.connect(merger, sourceChannelIndex, 1);
		merger.connect(gainNode);

		return {
			dispose: () => disconnectPreviewAudioNodes(createdNodes),
			inputNode: splitter,
		};
	}

	if (resolvedChannelMode === "average-to-mono") {
		for (
			let channelIndex = 0;
			channelIndex < resource.buffer.numberOfChannels;
			channelIndex += 1
		) {
			const averageGainNode = audioContext.createGain();
			averageGainNode.gain.value =
				1 / Math.max(1, resource.buffer.numberOfChannels);
			createdNodes.push(averageGainNode);
			splitter.connect(averageGainNode, channelIndex, 0);
			averageGainNode.connect(gainNode);
		}

		return {
			dispose: () => disconnectPreviewAudioNodes(createdNodes),
			inputNode: splitter,
		};
	}

	return {
		dispose: () => disconnectPreviewAudioNodes(createdNodes),
		inputNode: splitter,
	};
}

function resolvePreviewAudioChannelMode({
	audioBuffer,
	channelMode,
}: {
	audioBuffer: AudioBuffer;
	channelMode: AudioTrackChannelMode;
}): Exclude<AudioTrackChannelMode, "auto-one-sided-stereo"> {
	if (channelMode === "auto-one-sided-stereo") {
		return resolveChannelTransform(audioBuffer, channelMode).resolvedMode;
	}

	return channelMode;
}

function sourceChannelIndexForMode(
	channelMode: ResolvedChannelTransform["resolvedMode"],
	audioBuffer: AudioBuffer,
) {
	if (
		channelMode === "use-right-as-mono" ||
		channelMode === "duplicate-right-to-stereo"
	) {
		return Math.min(1, audioBuffer.numberOfChannels - 1);
	}

	return 0;
}

function createPreviewAudioMeterPlan({
	audioBuffer,
	channelMode,
	outputChannelCount,
}: {
	audioBuffer: AudioBuffer;
	channelMode: AudioTrackChannelMode;
	outputChannelCount: number;
}): PreviewAudioMeterPlan {
	const resolvedMode = resolvePreviewAudioChannelMode({
		audioBuffer,
		channelMode,
	});
	const transformedOutputChannels = outputChannelCountForMode(
		audioBuffer,
		resolvedMode,
	);
	const meterOutputChannels = outputChannelCountForPreviewAudioMeterMode({
		outputChannelCount,
		resolvedMode,
		transformedOutputChannels,
	});

	return {
		labels: createPreviewAudioMeterChannelLabels({
			audioBuffer,
			outputChannels: meterOutputChannels,
			resolvedMode,
		}),
		outputChannels: meterOutputChannels,
		resolvedMode,
	};
}

function outputChannelCountForPreviewAudioMeterMode({
	outputChannelCount,
	resolvedMode,
	transformedOutputChannels,
}: {
	outputChannelCount: number;
	resolvedMode: Exclude<AudioTrackChannelMode, "auto-one-sided-stereo">;
	transformedOutputChannels: number;
}): number {
	if (
		resolvedMode === "use-left-as-mono" ||
		resolvedMode === "use-right-as-mono" ||
		resolvedMode === "average-to-mono"
	) {
		return Math.max(1, outputChannelCount);
	}

	return transformedOutputChannels;
}

function samplePreviewAudioTrackPeakWindow({
	meterPlan,
	playheadSeconds,
	resource,
	trackGain,
}: {
	meterPlan: PreviewAudioMeterPlan;
	playheadSeconds: number;
	resource: PreviewAudioResource;
	trackGain: number;
}): number[] {
	const audioBuffer = resource.buffer;
	const centerFrame = Math.round(
		(playheadSeconds - resource.source.startPositionSeconds) *
			audioBuffer.sampleRate,
	);
	const halfWindowFrames = Math.max(
		1,
		Math.round(
			(PREVIEW_AUDIO_METERING_PEAK_WINDOW_SECONDS / 2) * audioBuffer.sampleRate,
		),
	);
	const startFrame = Math.max(0, centerFrame - halfWindowFrames);
	const endFrame = Math.min(audioBuffer.length, centerFrame + halfWindowFrames);

	if (startFrame >= endFrame) {
		return Array.from({ length: meterPlan.outputChannels }, () => 0);
	}

	const channelData = readPreviewAudioBufferChannelData(audioBuffer);

	return Array.from({ length: meterPlan.outputChannels }, (_, channelIndex) => {
		let peak = 0;

		for (let frameIndex = startFrame; frameIndex < endFrame; frameIndex += 1) {
			peak = Math.max(
				peak,
				Math.abs(
					readPreviewAudioTransformedSample({
						channelData,
						channelIndex,
						frameIndex,
						resolvedMode: meterPlan.resolvedMode,
					}),
				),
			);
		}

		return peak * clampPreviewVolume(trackGain);
	});
}

function sampleCombinedPreviewAudioPeakWindow({
	outputChannelCount,
	playheadSeconds,
	tracks,
}: {
	outputChannelCount: number;
	playheadSeconds: number;
	tracks: Array<
		PreviewAudioEngineTrack & {
			meterPlan: PreviewAudioMeterPlan;
		}
	>;
}): number[] {
	const referenceSampleRate = Math.max(
		1,
		...tracks.map((track) => track.resource.buffer.sampleRate),
	);
	const frameCount = Math.max(
		1,
		Math.round(
			PREVIEW_AUDIO_METERING_PEAK_WINDOW_SECONDS * referenceSampleRate,
		),
	);
	const startSeconds =
		playheadSeconds - PREVIEW_AUDIO_METERING_PEAK_WINDOW_SECONDS / 2;
	const peaks = Array.from({ length: outputChannelCount }, () => 0);
	const tracksWithChannelData = tracks.map((track) => ({
		...track,
		channelData: readPreviewAudioBufferChannelData(track.resource.buffer),
	}));

	for (let frameOffset = 0; frameOffset < frameCount; frameOffset += 1) {
		const sampleTimeSeconds = startSeconds + frameOffset / referenceSampleRate;

		for (
			let outputChannelIndex = 0;
			outputChannelIndex < outputChannelCount;
			outputChannelIndex += 1
		) {
			let mixedSample = 0;

			for (const track of tracksWithChannelData) {
				const frameIndex = Math.round(
					(sampleTimeSeconds - track.resource.source.startPositionSeconds) *
						track.resource.buffer.sampleRate,
				);

				mixedSample +=
					readPreviewAudioTrackSampleForOutputChannel({
						channelData: track.channelData,
						frameIndex,
						meterPlan: track.meterPlan,
						outputChannelIndex,
					}) *
					clampPreviewVolume(track.trackVolumeGain) *
					clampPreviewVolume(track.monitorGain);
			}

			peaks[outputChannelIndex] = Math.max(
				peaks[outputChannelIndex] ?? 0,
				Math.abs(mixedSample),
			);
		}
	}

	return peaks;
}

function readPreviewAudioTrackSampleForOutputChannel({
	channelData,
	frameIndex,
	meterPlan,
	outputChannelIndex,
}: {
	channelData: Float32Array[];
	frameIndex: number;
	meterPlan: PreviewAudioMeterPlan;
	outputChannelIndex: number;
}): number {
	const bufferLength = channelData[0]?.length ?? 0;

	if (frameIndex < 0 || frameIndex >= bufferLength) {
		return 0;
	}

	const transformedChannelIndex =
		meterPlan.outputChannels === 1
			? 0
			: Math.min(outputChannelIndex, meterPlan.outputChannels - 1);

	return readPreviewAudioTransformedSample({
		channelData,
		channelIndex: transformedChannelIndex,
		frameIndex,
		resolvedMode: meterPlan.resolvedMode,
	});
}

function readPreviewAudioBufferChannelData(
	audioBuffer: AudioBuffer,
): Float32Array[] {
	return Array.from({ length: audioBuffer.numberOfChannels }, (_, channel) =>
		audioBuffer.getChannelData(channel),
	);
}

function readPreviewAudioTransformedSample({
	channelData,
	channelIndex,
	frameIndex,
	resolvedMode,
}: {
	channelData: Float32Array[];
	channelIndex: number;
	frameIndex: number;
	resolvedMode: Exclude<AudioTrackChannelMode, "auto-one-sided-stereo">;
}): number {
	if (resolvedMode === "preserve") {
		return readPreviewAudioSourceSample(channelData, channelIndex, frameIndex);
	}

	if (
		resolvedMode === "use-left-as-mono" ||
		resolvedMode === "duplicate-left-to-stereo"
	) {
		return readPreviewAudioSourceSample(channelData, 0, frameIndex);
	}

	if (
		resolvedMode === "use-right-as-mono" ||
		resolvedMode === "duplicate-right-to-stereo"
	) {
		return readPreviewAudioSourceSample(
			channelData,
			Math.min(1, channelData.length - 1),
			frameIndex,
		);
	}

	if (resolvedMode === "average-to-mono") {
		let sample = 0;

		for (let channel = 0; channel < channelData.length; channel += 1) {
			sample += readPreviewAudioSourceSample(channelData, channel, frameIndex);
		}

		return sample / Math.max(1, channelData.length);
	}

	return readPreviewAudioSourceSample(channelData, channelIndex, frameIndex);
}

function readPreviewAudioSourceSample(
	channelData: Float32Array[],
	channelIndex: number,
	frameIndex: number,
): number {
	const sourceChannel = Math.min(channelIndex, channelData.length - 1);

	return channelData[sourceChannel]?.[frameIndex] ?? 0;
}

function createPreviewAudioMeterChannels({
	labels,
	peaks,
}: {
	labels: string[];
	peaks: number[];
}): PreviewAudioEngineMeterChannel[] {
	return peaks.map((peak, channelIndex) => ({
		label: labels[channelIndex] ?? `Ch ${channelIndex + 1}`,
		peak: Number.isFinite(peak) ? Math.max(0, peak) : 0,
	}));
}

function createPreviewAudioMeterChannelLabels({
	audioBuffer,
	outputChannels,
	resolvedMode,
}: {
	audioBuffer: AudioBuffer;
	outputChannels: number;
	resolvedMode: Exclude<AudioTrackChannelMode, "auto-one-sided-stereo">;
}): string[] {
	if (
		resolvedMode === "use-left-as-mono" ||
		resolvedMode === "use-right-as-mono" ||
		resolvedMode === "average-to-mono"
	) {
		return outputChannels === 1
			? ["Mono"]
			: createPreviewOutputChannelLabels(outputChannels);
	}

	if (
		outputChannels === 2 &&
		(resolvedMode === "duplicate-left-to-stereo" ||
			resolvedMode === "duplicate-right-to-stereo")
	) {
		return ["Left", "Right"];
	}

	return Array.from({ length: outputChannels }, (_, channelIndex) =>
		formatPreviewAudioSourceChannelLabel(
			audioBuffer.numberOfChannels,
			channelIndex,
		),
	);
}

function formatPreviewAudioSourceChannelLabel(
	channelCount: number,
	channelIndex: number,
): string {
	if (channelCount === 1) {
		return "Mono";
	}

	if (channelCount === 2) {
		return channelIndex === 0 ? "Left" : "Right";
	}

	return `Ch ${channelIndex + 1}`;
}

function createPreviewOutputChannelLabels(outputChannels: number): string[] {
	if (outputChannels === 1) {
		return ["Mono"];
	}

	if (outputChannels === 2) {
		return ["Left", "Right"];
	}

	return Array.from(
		{ length: outputChannels },
		(_, channelIndex) => `Ch ${channelIndex + 1}`,
	);
}

function disconnectPreviewAudioNodes(nodes: PreviewAudioNodeLike[]) {
	for (const node of nodes) {
		node.disconnect?.();
	}
}

async function decodePreviewAudioResource(
	audioContext: PreviewAudioContextLike,
	source: BrowserAudioPreviewSource,
) {
	const audioData = await source.blob.arrayBuffer();

	return audioContext.decodeAudioData(audioData.slice(0));
}

function createDefaultPreviewAudioContext(): PreviewAudioContextLike {
	return new AudioContext() as unknown as PreviewAudioContextLike;
}

function clampPlaybackRate(playbackRate: number) {
	if (!Number.isFinite(playbackRate) || playbackRate <= 0) {
		return 1;
	}

	return playbackRate;
}

function clampPreviewTime(timeSeconds: number) {
	if (!Number.isFinite(timeSeconds)) {
		return 0;
	}

	return Math.max(0, timeSeconds);
}

function normalizePreviewAudioMeterOutputChannelCount(outputChannels: number) {
	if (!Number.isFinite(outputChannels)) {
		return 2;
	}

	return Math.max(1, Math.min(8, Math.round(outputChannels)));
}

function clampPreviewVolume(volume: number) {
	if (!Number.isFinite(volume)) {
		return 1;
	}

	return Math.max(0, Math.min(volume, 1));
}
