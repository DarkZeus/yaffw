import type MultiTrack from "wavesurfer-multitrack";
import type { TrackOptions } from "wavesurfer-multitrack";

import { audioTrackVolumePercentToGain } from "@/editor-core/audio-mix";
import type { AudioMix, ReadyMediaAsset } from "@/editor-core/model";

import type { BrowserAudioPreviewSource } from "./browser-audio-preview-sources.types";

export function canUseBrowserAudioPreviewTransport(asset: ReadyMediaAsset) {
	return (
		asset.tracks.audio.length > 0 &&
		typeof window !== "undefined" &&
		typeof AudioContext !== "undefined" &&
		typeof HTMLAudioElement !== "undefined" &&
		typeof URL.createObjectURL === "function"
	);
}

export function createMultitrackPreviewTracks(
	sources: BrowserAudioPreviewSource[],
): TrackOptions[] {
	return sources.map((source) => ({
		id: source.trackId,
		options: {
			barGap: 0,
			barWidth: 1,
			height: 0,
			progressColor: "transparent",
			waveColor: "transparent",
		},
		startPosition: source.startPositionSeconds,
		url: source.url,
		volume: 0,
	}));
}

export function previewVolumeForAudioTrackSource({
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

export function applyMultitrackPreviewVolumes({
	audioMix,
	multitrack,
	muted,
	soloedAudioTrackId,
	sources,
	volume,
}: {
	audioMix: AudioMix;
	multitrack: MultiTrack;
	muted: boolean;
	soloedAudioTrackId?: string | null;
	sources: BrowserAudioPreviewSource[];
	volume: number;
}) {
	sources.forEach((source, sourceIndex) => {
		multitrack.setTrackVolume(
			sourceIndex,
			previewVolumeForAudioTrackSource({
				audioMix,
				muted,
				soloedAudioTrackId,
				source,
				volume,
			}),
		);
	});
}

export function setMultitrackPreviewPlaybackRate(
	multitrack: MultiTrack | null,
	playbackRate: number,
) {
	if (!multitrack) {
		return;
	}

	const transport = multitrack as unknown as {
		audios?: Array<{ playbackRate: number }>;
		setAudioRate?: (rate: number) => void;
	};

	if (typeof transport.setAudioRate === "function") {
		transport.setAudioRate(playbackRate);
		return;
	}

	for (const audio of transport.audios ?? []) {
		audio.playbackRate = playbackRate;
	}
}

function clampPreviewVolume(volume: number) {
	if (!Number.isFinite(volume)) {
		return 1;
	}

	return Math.max(0, Math.min(volume, 1));
}
