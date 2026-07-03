import { audioTrackVolumePercentToGain } from "@/editor-core/audio-mix";
import type { AudioMix, ReadyMediaAsset } from "@/editor-core/model";

import type { BrowserAudioPreviewSource } from "./browser-audio-preview-sources.types";

export type PreviewAudioEngine = {
	destroy: () => void;
	getCurrentTime: () => number;
	pause: () => void;
	play: () => Promise<void>;
	setPlaybackRate: (playbackRate: number) => void;
	setTime: (timeSeconds: number) => void;
	setTrackGain: (trackIndex: number, gain: number) => void;
};

export type PreviewAudioContextLike = {
	close?: () => Promise<void> | void;
	createBufferSource: () => PreviewAudioBufferSourceNodeLike;
	createGain: () => PreviewAudioGainNodeLike;
	currentTime: number;
	decodeAudioData: (audioData: ArrayBuffer) => Promise<AudioBuffer>;
	destination: PreviewAudioNodeLike;
	resume?: () => Promise<void> | void;
};

export type PreviewAudioNodeLike = {
	connect: (destination: PreviewAudioNodeLike) => unknown;
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
	gainNode: PreviewAudioGainNodeLike;
	resource: PreviewAudioResource;
	sourceNode: PreviewAudioBufferSourceNodeLike | null;
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

export function previewGainForAudioTrackSource({
	audioMix,
	muted,
	soloedAudioTrackId,
	source,
	volume,
}: {
	audioMix: AudioMix;
	muted: boolean;
	soloedAudioTrackId?: string | null;
	source: BrowserAudioPreviewSource;
	volume: number;
}) {
	const decision = audioMix.tracks[source.trackId];

	if (muted) {
		return 0;
	}

	if (soloedAudioTrackId && source.trackId !== soloedAudioTrackId) {
		return 0;
	}

	if (!soloedAudioTrackId && decision?.include === false) {
		return 0;
	}

	return (
		clampPreviewVolume(volume) *
		audioTrackVolumePercentToGain(decision?.volumePercent ?? 100)
	);
}

export function applyPreviewAudioEngineGains({
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
	sources.forEach((source, sourceIndex) => {
		previewAudioEngine.setTrackGain(
			sourceIndex,
			previewGainForAudioTrackSource({
				audioMix,
				muted,
				soloedAudioTrackId,
				source,
				volume,
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
	const tracks: PreviewAudioEngineTrack[] = resources.map((resource) => {
		const gainNode = audioContext.createGain();
		gainNode.gain.value = 0;
		gainNode.connect(audioContext.destination);

		return {
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
			sourceNode.connect(track.gainNode);

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
				track.gainNode.disconnect?.();
			}

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
		setTime(nextTimeSeconds: number) {
			currentTimeSeconds = clampPreviewTime(nextTimeSeconds);

			if (!playing) {
				return;
			}

			startTrackSources();
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
