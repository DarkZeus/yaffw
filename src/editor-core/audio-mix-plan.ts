import {
	DEFAULT_AUDIO_TRACK_VOLUME_PERCENT,
	audioTrackVolumePercentToGain,
} from "./audio-mix";
import type { AudioMix, AudioTrackChannelMode } from "./model";

export type AudioMixPlanTrack = {
	channelMode: AudioTrackChannelMode;
	include: boolean;
	trackId: string;
	trackVolumeGain: number;
	volumePercent: number;
};

export type AudioMixPlan = {
	finalPeakGuardDb: number;
	outputChannels: AudioMix["outputChannels"];
	tracks: AudioMixPlanTrack[];
	tracksById: Record<string, AudioMixPlanTrack>;
};

export function createAudioMixPlan({
	audioMix,
	trackIds,
}: {
	audioMix: AudioMix;
	trackIds: readonly string[];
}): AudioMixPlan {
	const tracks = trackIds.map((trackId) =>
		createAudioMixPlanTrack({ audioMix, trackId }),
	);

	return {
		finalPeakGuardDb: audioMix.finalPeakGuardDb,
		outputChannels: audioMix.outputChannels,
		tracks,
		tracksById: Object.fromEntries(
			tracks.map((track) => [track.trackId, track]),
		),
	};
}

export function audioMixPlanHasIncludedTracks(plan: AudioMixPlan): boolean {
	return plan.tracks.some(audioMixPlanTrackIsIncluded);
}

export function includedAudioMixPlanTracks(
	plan: AudioMixPlan,
): AudioMixPlanTrack[] {
	return plan.tracks.filter(audioMixPlanTrackIsIncluded);
}

export function audioMixPlanTrackIsIncluded(track: AudioMixPlanTrack): boolean {
	return track.include;
}

export function audioMixPlanTrackOutputChannelCount({
	inputChannelCount,
	resolvedChannelMode,
}: {
	inputChannelCount: number;
	resolvedChannelMode: Exclude<AudioTrackChannelMode, "auto-one-sided-stereo">;
}): number {
	if (
		resolvedChannelMode === "duplicate-left-to-stereo" ||
		resolvedChannelMode === "duplicate-right-to-stereo"
	) {
		return Math.max(2, inputChannelCount);
	}

	if (resolvedChannelMode === "preserve") {
		return inputChannelCount;
	}

	return 1;
}

function createAudioMixPlanTrack({
	audioMix,
	trackId,
}: {
	audioMix: AudioMix;
	trackId: string;
}): AudioMixPlanTrack {
	const decision = audioMix.tracks[trackId];
	const volumePercent =
		decision?.volumePercent ?? DEFAULT_AUDIO_TRACK_VOLUME_PERCENT;

	return {
		channelMode: decision?.channelMode ?? "preserve",
		include: decision?.include ?? true,
		trackId,
		trackVolumeGain: audioTrackVolumePercentToGain(volumePercent),
		volumePercent,
	};
}
