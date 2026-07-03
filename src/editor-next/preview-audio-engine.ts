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
	setOutputGain: (gain: number) => void;
	setPlaybackRate: (playbackRate: number) => void;
	setTime: (timeSeconds: number) => void;
	setTrackChannelMode: (
		trackIndex: number,
		channelMode: AudioTrackChannelMode,
	) => void;
	setTrackGain: (trackIndex: number, gain: number) => void;
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
	resource: PreviewAudioResource;
	sourceNode: PreviewAudioBufferSourceNodeLike | null;
};

type PreviewAudioTrackChannelRouting = {
	dispose: () => void;
	inputNode: PreviewAudioNodeLike;
};

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

export function previewTrackGainForAudioTrackSource({
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

	return audioTrackVolumePercentToGain(decision?.volumePercent ?? 100);
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
		previewAudioEngine.setTrackGain(
			sourceIndex,
			previewTrackGainForAudioTrackSource({
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
			resource,
			sourceNode: null,
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
		setTrackChannelMode(trackIndex: number, channelMode: AudioTrackChannelMode) {
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
		setTrackGain(trackIndex: number, gain: number) {
			const track = tracks[trackIndex];

			if (!track) {
				return;
			}

			track.gainNode.gain.value = clampPreviewVolume(gain);
		},
	};
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
			Math.max(2, outputChannelCountForMode(resource.buffer, resolvedChannelMode)),
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

function clampPreviewVolume(volume: number) {
	if (!Number.isFinite(volume)) {
		return 1;
	}

	return Math.max(0, Math.min(volume, 1));
}
