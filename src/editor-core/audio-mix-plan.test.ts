import { describe, expect, it } from "vitest";

import {
	audioMixPlanHasIncludedTracks,
	audioMixPlanTrackOutputChannelCount,
	createAudioMixPlan,
	includedAudioMixPlanTracks,
} from "./audio-mix-plan";
import type { AudioMix } from "./model";

describe("Audio mix plan", () => {
	it("represents committed Audio mix decisions without preview-only monitoring state", () => {
		const audioMix = {
			finalPeakGuardDb: -1,
			outputChannels: 2,
			tracks: {
				"audio-desktop": {
					channelMode: "duplicate-right-to-stereo",
					include: false,
					trackId: "audio-desktop",
					volumePercent: 100,
				},
				"audio-music": {
					channelMode: "average-to-mono",
					include: true,
					trackId: "audio-music",
					volumePercent: 0,
				},
				"audio-voice": {
					channelMode: "use-left-as-mono",
					include: true,
					trackId: "audio-voice",
					volumePercent: 50,
				},
			},
		} satisfies AudioMix;

		const plan = createAudioMixPlan({
			audioMix,
			trackIds: ["audio-voice", "audio-desktop", "audio-music"],
		});

		expect(plan).toEqual({
			finalPeakGuardDb: -1,
			outputChannels: 2,
			tracks: [
				{
					channelMode: "use-left-as-mono",
					include: true,
					trackId: "audio-voice",
					trackVolumeGain: 0.25,
					volumePercent: 50,
				},
				{
					channelMode: "duplicate-right-to-stereo",
					include: false,
					trackId: "audio-desktop",
					trackVolumeGain: 1,
					volumePercent: 100,
				},
				{
					channelMode: "average-to-mono",
					include: true,
					trackId: "audio-music",
					trackVolumeGain: 0,
					volumePercent: 0,
				},
			],
			tracksById: {
				"audio-desktop": {
					channelMode: "duplicate-right-to-stereo",
					include: false,
					trackId: "audio-desktop",
					trackVolumeGain: 1,
					volumePercent: 100,
				},
				"audio-music": {
					channelMode: "average-to-mono",
					include: true,
					trackId: "audio-music",
					trackVolumeGain: 0,
					volumePercent: 0,
				},
				"audio-voice": {
					channelMode: "use-left-as-mono",
					include: true,
					trackId: "audio-voice",
					trackVolumeGain: 0.25,
					volumePercent: 50,
				},
			},
		});
		expect(Object.keys(plan)).not.toContain("soloedAudioTrackId");
		expect(Object.keys(plan)).not.toContain("previewVolume");
		expect(Object.keys(plan)).not.toContain("previewMuted");
		expect(
			includedAudioMixPlanTracks(plan).map((track) => track.trackId),
		).toEqual(["audio-voice", "audio-music"]);
		expect(audioMixPlanHasIncludedTracks(plan)).toBe(true);
	});

	it("keeps an included zero-volume track in the Generated audio mix plan", () => {
		const plan = createAudioMixPlan({
			audioMix: {
				finalPeakGuardDb: -1,
				outputChannels: 2,
				tracks: {
					"audio-silent": {
						channelMode: "preserve",
						include: true,
						trackId: "audio-silent",
						volumePercent: 0,
					},
				},
			},
			trackIds: ["audio-silent"],
		});

		expect(
			includedAudioMixPlanTracks(plan).map((track) => track.trackId),
		).toEqual(["audio-silent"]);
		expect(audioMixPlanHasIncludedTracks(plan)).toBe(true);
	});

	it("shares output-channel intent for preview graph planning and export rendering", () => {
		expect(
			audioMixPlanTrackOutputChannelCount({
				inputChannelCount: 6,
				resolvedChannelMode: "preserve",
			}),
		).toBe(6);
		expect(
			audioMixPlanTrackOutputChannelCount({
				inputChannelCount: 1,
				resolvedChannelMode: "duplicate-left-to-stereo",
			}),
		).toBe(2);
		expect(
			audioMixPlanTrackOutputChannelCount({
				inputChannelCount: 2,
				resolvedChannelMode: "use-right-as-mono",
			}),
		).toBe(1);
	});
});
