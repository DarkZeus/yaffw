import type { AudioMediaTrack, AudioMix, ReadyMediaAsset } from "./model";

export const DEFAULT_AUDIO_TRACK_VOLUME_PERCENT = 100;
export const DEFAULT_AUDIO_MIX_FINAL_PEAK_GUARD_DB = -1;

export function createDefaultAudioMix(
	asset: Pick<ReadyMediaAsset, "tracks">,
): AudioMix {
	return {
		finalPeakGuardDb: DEFAULT_AUDIO_MIX_FINAL_PEAK_GUARD_DB,
		outputChannels: 2,
		tracks: Object.fromEntries(
			asset.tracks.audio.map((track) => [
				track.id,
				createDefaultAudioMixTrackDecision(track),
			]),
		),
	};
}

export function createDefaultAudioMixTrackDecision(
	track: AudioMediaTrack,
): AudioMix["tracks"][string] {
	return {
		channelMode: "preserve",
		include: true,
		trackId: track.id,
		volumePercent: DEFAULT_AUDIO_TRACK_VOLUME_PERCENT,
	};
}

export function audioMixHasIncludedTracks(audioMix: AudioMix): boolean {
	return Object.values(audioMix.tracks).some(
		(decision) => decision.include && decision.volumePercent > 0,
	);
}

export function audioTrackVolumePercentToGain(volumePercent: number): number {
	if (!Number.isFinite(volumePercent)) {
		return 1;
	}

	const normalized = Math.max(0, Math.min(volumePercent, 100)) / 100;

	return normalized * normalized;
}
