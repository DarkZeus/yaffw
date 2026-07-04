import { describe, expect, it } from "vitest";

import type { PreviewAudioEngineMeterSnapshot } from "../engine/preview-audio-engine";
import { createLivePreviewMeteringTrackStates } from "../meters/preview-metering-live";

describe("createLivePreviewMeteringTrackStates", () => {
	it("converts Preview audio engine graph taps into track and combined meters", () => {
		const { combinedState, trackStates } = createLivePreviewMeteringTrackStates(
			{
				isPlaying: true,
				knownTrackIds: ["audio-voice", "audio-desktop"],
				meterSnapshot: {
					combinedState: {
						channels: [
							{ label: "Left", peak: 0.75 },
							{ label: "Right", peak: 0.5 },
						],
						partial: false,
						status: "ready",
					},
					trackStates: {
						"audio-desktop": {
							channels: [
								{ label: "Left", peak: 0.5 },
								{ label: "Right", peak: 0.25 },
							],
							status: "ready",
							trackId: "audio-desktop",
						},
						"audio-voice": {
							channels: [
								{ label: "Left", peak: 0.25 },
								{ label: "Right", peak: 0.25 },
							],
							status: "ready",
							trackId: "audio-voice",
						},
					},
				},
				meteringStatus: "ready",
				nowMs: 1_000,
			},
		);
		const voiceState = trackStates["audio-voice"];

		expect(voiceState?.status).toBe("ready");
		if (voiceState?.status !== "ready") {
			throw new Error("Expected ready Voice meter state.");
		}
		expect(voiceState.channels[0]?.peakDb).toBeCloseTo(-12.04, 2);
		expect(voiceState.channels[1]?.peakDb).toBeCloseTo(-12.04, 2);
		expect(combinedState.status).toBe("ready");
		if (combinedState.status !== "ready") {
			throw new Error("Expected ready combined meter state.");
		}
		expect(combinedState.partial).toBe(false);
		expect(combinedState.channels[0]?.peakDb).toBeCloseTo(-2.5, 1);
		expect(combinedState.channels[1]?.peakDb).toBeCloseTo(-6.02, 2);
	});

	it("keeps partial and unavailable engine tap states visible", () => {
		const { combinedState, trackStates } = createLivePreviewMeteringTrackStates(
			{
				isPlaying: true,
				knownTrackIds: ["audio-voice", "audio-desktop"],
				meterSnapshot: {
					combinedState: {
						channels: [
							{ label: "Left", peak: 0.5 },
							{ label: "Right", peak: 0 },
						],
						partial: true,
						reason: "Some monitored tracks are unavailable: Desktop failed",
						status: "ready",
					},
					trackStates: {
						"audio-desktop": {
							reason: "Desktop failed",
							status: "unavailable",
							trackId: "audio-desktop",
						},
						"audio-voice": {
							channels: [
								{ label: "Left", peak: 0.5 },
								{ label: "Right", peak: 0 },
							],
							status: "ready",
							trackId: "audio-voice",
						},
					},
				},
				meteringStatus: "ready",
				nowMs: 1_000,
			},
		);

		expect(trackStates["audio-desktop"]).toEqual({
			reason: "Desktop failed",
			status: "unavailable",
			trackId: "audio-desktop",
		});
		expect(combinedState.status).toBe("ready");
		if (combinedState.status !== "ready") {
			throw new Error("Expected partial ready combined state.");
		}
		expect(combinedState.partial).toBe(true);
		expect(combinedState.reason).toContain("Desktop failed");
	});

	it("targets silence while paused so presentation can decay displayed meters", () => {
		const { trackStates } = createLivePreviewMeteringTrackStates({
			isPlaying: false,
			knownTrackIds: ["audio-voice"],
			meterSnapshot: createReadySnapshot(1),
			meteringStatus: "ready",
			nowMs: 1_000,
		});
		const voiceState = trackStates["audio-voice"];

		expect(voiceState?.status).toBe("ready");
		if (voiceState?.status !== "ready") {
			throw new Error("Expected ready Voice meter state.");
		}
		expect(voiceState.channels.map((channel) => channel.peakDb)).toEqual([
			-72, -72,
		]);
	});

	it("reports preparing and failed engine meter source states", () => {
		const preparing = createLivePreviewMeteringTrackStates({
			isPlaying: false,
			knownTrackIds: ["audio-voice"],
			meterSnapshot: null,
			meteringStatus: "preparing",
			nowMs: 1_000,
		});
		const failed = createLivePreviewMeteringTrackStates({
			isPlaying: false,
			knownTrackIds: ["audio-voice"],
			meterSnapshot: null,
			meteringStatus: "failed",
			nowMs: 1_000,
		});

		expect(preparing.trackStates["audio-voice"]?.status).toBe("preparing");
		expect(preparing.combinedState.status).toBe("preparing");
		expect(failed.trackStates["audio-voice"]?.status).toBe("unavailable");
		expect(failed.combinedState.status).toBe("unavailable");
	});
});

function createReadySnapshot(peak: number): PreviewAudioEngineMeterSnapshot {
	return {
		combinedState: {
			channels: [
				{ label: "Left", peak },
				{ label: "Right", peak },
			],
			partial: false,
			status: "ready",
		},
		trackStates: {
			"audio-voice": {
				channels: [
					{ label: "Left", peak },
					{ label: "Right", peak },
				],
				status: "ready",
				trackId: "audio-voice",
			},
		},
	};
}
