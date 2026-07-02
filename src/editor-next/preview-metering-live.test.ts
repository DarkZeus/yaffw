import { describe, expect, it } from "vitest";

import type { AudioMix } from "@/editor-core/model";
import { createLivePreviewMeteringTrackStates } from "./preview-metering-live";
import type { PreviewMeteringTrackStates } from "./preview-metering-preparation.types";

describe("createLivePreviewMeteringTrackStates", () => {
	it("combines monitored tracks into stereo output channels without mono downmixing", () => {
		const { combinedState } = createLivePreviewMeteringTrackStates({
			audioMix: {
				finalPeakGuardDb: -1,
				outputChannels: 2,
				tracks: {
					"audio-desktop": {
						channelMode: "preserve",
						include: true,
						trackId: "audio-desktop",
						volumePercent: 100,
					},
					"audio-voice": {
						channelMode: "preserve",
						include: true,
						trackId: "audio-voice",
						volumePercent: 100,
					},
				},
			},
			isPlaying: true,
			nowMs: 1_000,
			playheadUs: 100_000,
			soloedAudioTrackId: null,
			trackStates: {
				"audio-desktop": createPreparedTrackState({
					channelLabels: ["Left", "Right"],
					channels: [[], [[100, 0.25]]],
					trackId: "audio-desktop",
				}),
				"audio-voice": createPreparedTrackState({
					channelLabels: ["Left", "Right"],
					channels: [[[100, 0.5]], []],
					trackId: "audio-voice",
				}),
			},
		});

		expect(combinedState.status).toBe("ready");
		if (combinedState.status !== "ready") {
			throw new Error("Expected ready combined metering state.");
		}
		expect(combinedState.partial).toBe(false);
		expect(combinedState.channels).toHaveLength(2);
		expect(combinedState.channels[0]?.label).toBe("Left");
		expect(combinedState.channels[1]?.label).toBe("Right");
		expect(combinedState.channels[0]?.peakDb).toBeCloseTo(-6.02, 2);
		expect(combinedState.channels[1]?.peakDb).toBeCloseTo(-12.04, 2);
	});

	it("makes the combined output follow preview solo monitoring", () => {
		const { combinedState } = createLivePreviewMeteringTrackStates({
			audioMix: {
				finalPeakGuardDb: -1,
				outputChannels: 2,
				tracks: {
					"audio-desktop": {
						channelMode: "preserve",
						include: true,
						trackId: "audio-desktop",
						volumePercent: 100,
					},
					"audio-voice": {
						channelMode: "preserve",
						include: false,
						trackId: "audio-voice",
						volumePercent: 100,
					},
				},
			},
			isPlaying: true,
			nowMs: 1_000,
			playheadUs: 100_000,
			soloedAudioTrackId: "audio-voice",
			trackStates: {
				"audio-desktop": createPreparedTrackState({
					channelLabels: ["Left", "Right"],
					channels: [[], [[100, 1]]],
					trackId: "audio-desktop",
				}),
				"audio-voice": createPreparedTrackState({
					channelLabels: ["Left", "Right"],
					channels: [[[100, 0.5]], []],
					trackId: "audio-voice",
				}),
			},
		});

		expect(combinedState.status).toBe("ready");
		if (combinedState.status !== "ready") {
			throw new Error("Expected ready combined metering state.");
		}
		expect(combinedState.partial).toBe(false);
		expect(combinedState.channels[0]?.peakDb).toBeCloseTo(-6.02, 2);
		expect(combinedState.channels[1]?.peakDb).toBe(-72);
	});

	it("marks the combined output partial or unavailable when audible tracks cannot be metered", () => {
		const partial = createLivePreviewMeteringTrackStates({
			audioMix: {
				finalPeakGuardDb: -1,
				outputChannels: 2,
				tracks: {
					"audio-desktop": {
						channelMode: "preserve",
						include: true,
						trackId: "audio-desktop",
						volumePercent: 100,
					},
					"audio-voice": {
						channelMode: "preserve",
						include: true,
						trackId: "audio-voice",
						volumePercent: 100,
					},
				},
			},
			isPlaying: true,
			nowMs: 1_000,
			playheadUs: 100_000,
			soloedAudioTrackId: null,
			trackStates: {
				"audio-desktop": {
					reason: "Desktop decode failed",
					status: "unavailable",
					trackId: "audio-desktop",
				},
				"audio-voice": createPreparedTrackState({
					channelLabels: ["Left", "Right"],
					channels: [[[100, 0.5]], []],
					trackId: "audio-voice",
				}),
			},
		}).combinedState;
		const unavailable = createLivePreviewMeteringTrackStates({
			audioMix: {
				finalPeakGuardDb: -1,
				outputChannels: 2,
				tracks: {
					"audio-desktop": {
						channelMode: "preserve",
						include: true,
						trackId: "audio-desktop",
						volumePercent: 100,
					},
				},
			},
			isPlaying: true,
			nowMs: 1_000,
			playheadUs: 100_000,
			soloedAudioTrackId: null,
			trackStates: {
				"audio-desktop": {
					reason: "Desktop decode failed",
					status: "unavailable",
					trackId: "audio-desktop",
				},
			},
		}).combinedState;

		expect(partial.status).toBe("ready");
		if (partial.status !== "ready") {
			throw new Error("Expected partial ready combined state.");
		}
		expect(partial.partial).toBe(true);
		expect(partial.reason).toContain("Desktop decode failed");
		expect(partial.channels[0]?.peakDb).toBeCloseTo(-6.02, 2);
		expect(partial.channels[1]?.peakDb).toBe(-72);
		expect(unavailable.status).toBe("unavailable");
		if (unavailable.status !== "unavailable") {
			throw new Error("Expected unavailable combined state.");
		}
		expect(unavailable.reason).toContain("Desktop decode failed");
	});

	it("keeps live meter sampling off the per-sample channel-data hot path", () => {
		let getChannelDataCallCount = 0;
		const trackStates = {
			"audio-desktop": createPreparedTrackStateWithAudioBuffer({
				audioBuffer: createCountedTestAudioBuffer({
					channels: [[], [[2_400, 0.25]]],
					onGetChannelData: () => {
						getChannelDataCallCount += 1;
					},
				}),
				channelLabels: ["Left", "Right"],
				trackId: "audio-desktop",
			}),
			"audio-voice": createPreparedTrackStateWithAudioBuffer({
				audioBuffer: createCountedTestAudioBuffer({
					channels: [[[2_400, 0.5]], []],
					onGetChannelData: () => {
						getChannelDataCallCount += 1;
					},
				}),
				channelLabels: ["Left", "Right"],
				trackId: "audio-voice",
			}),
		};

		createLivePreviewMeteringTrackStates({
			audioMix: {
				finalPeakGuardDb: -1,
				outputChannels: 2,
				tracks: {
					"audio-desktop": {
						channelMode: "preserve",
						include: true,
						trackId: "audio-desktop",
						volumePercent: 100,
					},
					"audio-voice": {
						channelMode: "preserve",
						include: true,
						trackId: "audio-voice",
						volumePercent: 100,
					},
				},
			},
			isPlaying: true,
			nowMs: 1_000,
			playheadUs: 50_000,
			soloedAudioTrackId: null,
			trackStates,
		});

		expect(getChannelDataCallCount).toBeLessThanOrEqual(64);
	});

	it("reuses channel plans across live meter ticks instead of re-analyzing decoded buffers", () => {
		let getChannelDataCallCount = 0;
		const trackStates = {
			"audio-voice": createPreparedTrackStateWithAudioBuffer({
				audioBuffer: createCountedTestAudioBuffer({
					channels: [[[2_400, 0.5]], []],
					onGetChannelData: () => {
						getChannelDataCallCount += 1;
					},
				}),
				channelLabels: ["Left", "Right"],
				trackId: "audio-voice",
			}),
		};
		const options = {
			audioMix: createAudioMix({
				channelMode: "use-left-as-mono",
				include: true,
				volumePercent: 100,
			}),
			isPlaying: true,
			nowMs: 1_000,
			playheadUs: 50_000,
			soloedAudioTrackId: null,
			trackStates,
		} satisfies Parameters<typeof createLivePreviewMeteringTrackStates>[0];

		createLivePreviewMeteringTrackStates(options);
		const firstTickCallCount = getChannelDataCallCount;
		createLivePreviewMeteringTrackStates({
			...options,
			nowMs: 1_016,
		});
		const secondTickCallCount = getChannelDataCallCount - firstTickCallCount;

		expect(secondTickCallCount).toBeLessThan(firstTickCallCount);
	});

	it("samples a peak window around the Playhead after channel handling and Track volume", () => {
		const { trackStates } = createLivePreviewMeteringTrackStates({
			audioMix: createAudioMix({
				channelMode: "use-left-as-mono",
				include: true,
				volumePercent: 50,
			}),
			isPlaying: true,
			nowMs: 1_000,
			playheadUs: 100_000,
			soloedAudioTrackId: null,
			trackStates: createPreparedTrackStates({
				channelLabels: ["Left", "Right"],
				channels: [[[100, 1]], [[100, 0.25]]],
			}),
		});

		const voiceState = trackStates["audio-voice"];

		expect(voiceState?.status).toBe("ready");
		if (voiceState?.status !== "ready") {
			throw new Error("Expected ready live metering state.");
		}

		expect(voiceState.channels).toHaveLength(1);
		expect(voiceState.channels[0]?.label).toBe("Mono");
		expect(voiceState.channels[0]?.peakDb).toBeCloseTo(-12.04, 2);
		expect(voiceState.channels[0]?.clipHeld).toBe(false);
	});

	it("uses the 50 ms playhead window and floors ready meters while paused", () => {
		const playing = createLivePreviewMeteringTrackStates({
			audioMix: createAudioMix({
				channelMode: "preserve",
				include: true,
				volumePercent: 100,
			}),
			isPlaying: true,
			nowMs: 1_000,
			playheadUs: 100_000,
			soloedAudioTrackId: null,
			trackStates: createPreparedTrackStates({
				channelLabels: ["Left", "Right"],
				channels: [
					[
						[124, 0.5],
						[130, 1],
					],
					[[130, 1]],
				],
			}),
		}).trackStates["audio-voice"];

		expect(playing?.status).toBe("ready");
		if (playing?.status !== "ready") {
			throw new Error("Expected ready live metering state.");
		}
		expect(playing.channels).toHaveLength(2);
		expect(playing.channels[0]?.label).toBe("Left");
		expect(playing.channels[1]?.label).toBe("Right");
		expect(playing.channels[0]?.peakDb).toBeCloseTo(-6.02, 2);
		expect(playing.channels[1]?.peakDb).toBe(-72);

		const paused = createLivePreviewMeteringTrackStates({
			audioMix: createAudioMix({
				channelMode: "preserve",
				include: true,
				volumePercent: 100,
			}),
			isPlaying: false,
			nowMs: 1_000,
			playheadUs: 100_000,
			soloedAudioTrackId: null,
			trackStates: createPreparedTrackStates({
				channelLabels: ["Left", "Right"],
				channels: [[[100, 1]], [[100, 1]]],
			}),
		}).trackStates["audio-voice"];

		expect(paused?.status).toBe("ready");
		if (paused?.status !== "ready") {
			throw new Error("Expected ready live metering state.");
		}
		expect(paused.channels.map((channel) => channel.peakDb)).toEqual([
			-72, -72,
		]);
	});

	it("holds clip indicators briefly after effective Track volume clipping", () => {
		const clipped = createLivePreviewMeteringTrackStates({
			audioMix: createAudioMix({
				channelMode: "preserve",
				include: true,
				volumePercent: 100,
			}),
			isPlaying: true,
			nowMs: 1_000,
			playheadUs: 100_000,
			soloedAudioTrackId: null,
			trackStates: createPreparedTrackStates({
				channelLabels: ["Left"],
				channels: [[[100, 1.2]]],
			}),
		});
		const held = createLivePreviewMeteringTrackStates({
			audioMix: createAudioMix({
				channelMode: "preserve",
				include: true,
				volumePercent: 100,
			}),
			isPlaying: true,
			nowMs: 1_500,
			playheadUs: 100_000,
			previousClipHoldState: clipped.clipHoldState,
			soloedAudioTrackId: null,
			trackStates: createPreparedTrackStates({
				channelLabels: ["Left"],
				channels: [[[100, 0.2]]],
			}),
		}).trackStates["audio-voice"];
		const expired = createLivePreviewMeteringTrackStates({
			audioMix: createAudioMix({
				channelMode: "preserve",
				include: true,
				volumePercent: 100,
			}),
			isPlaying: true,
			nowMs: 1_800,
			playheadUs: 100_000,
			previousClipHoldState: clipped.clipHoldState,
			soloedAudioTrackId: null,
			trackStates: createPreparedTrackStates({
				channelLabels: ["Left"],
				channels: [[[100, 0.2]]],
			}),
		}).trackStates["audio-voice"];

		expect(held?.status).toBe("ready");
		expect(expired?.status).toBe("ready");
		if (held?.status !== "ready" || expired?.status !== "ready") {
			throw new Error("Expected ready live metering states.");
		}
		expect(held.channels[0]?.clipHeld).toBe(true);
		expect(held.channels[0]?.peakDb).toBeCloseTo(-13.98, 2);
		expect(expired.channels[0]?.clipHeld).toBe(false);
	});

	it("shows excluded tracks as floor unless that track is soloed for preview", () => {
		const trackStates = {
			...createPreparedTrackStates({
				channelLabels: ["Ch 1", "Ch 2"],
				channels: [[[100, 0.5]], [[100, 0.25]]],
			}),
			"audio-desktop": createPreparedTrackState({
				channelLabels: ["Left", "Right"],
				channels: [[[100, 0.75]], [[100, 0.5]]],
				trackId: "audio-desktop",
			}),
		};
		const excluded = createLivePreviewMeteringTrackStates({
			audioMix: createAudioMix({
				channelMode: "preserve",
				include: false,
				volumePercent: 100,
			}),
			isPlaying: true,
			nowMs: 1_000,
			playheadUs: 100_000,
			soloedAudioTrackId: null,
			trackStates,
		}).trackStates["audio-voice"];
		const soloed = createLivePreviewMeteringTrackStates({
			audioMix: createAudioMix({
				channelMode: "preserve",
				include: false,
				volumePercent: 100,
			}),
			isPlaying: true,
			nowMs: 1_000,
			playheadUs: 100_000,
			soloedAudioTrackId: "audio-voice",
			trackStates,
		}).trackStates["audio-voice"];
		const otherTrackWhileSoloed = createLivePreviewMeteringTrackStates({
			audioMix: createAudioMix({
				channelMode: "preserve",
				include: true,
				volumePercent: 100,
			}),
			isPlaying: true,
			nowMs: 1_000,
			playheadUs: 100_000,
			soloedAudioTrackId: "audio-voice",
			trackStates,
		}).trackStates["audio-desktop"];

		expect(excluded?.status).toBe("ready");
		expect(soloed?.status).toBe("ready");
		expect(otherTrackWhileSoloed?.status).toBe("ready");
		if (
			excluded?.status !== "ready" ||
			soloed?.status !== "ready" ||
			otherTrackWhileSoloed?.status !== "ready"
		) {
			throw new Error("Expected ready live metering states.");
		}
		expect(excluded.excluded).toBe(true);
		expect(excluded.channels.map((channel) => channel.peakDb)).toEqual([
			-72, -72,
		]);
		expect(soloed.excluded).toBe(false);
		expect(soloed.channels[0]?.label).toBe("Ch 1");
		expect(soloed.channels[0]?.peakDb).toBeCloseTo(-6.02, 2);
		expect(otherTrackWhileSoloed.channels[0]?.peakDb).toBeCloseTo(-2.5, 1);
	});
});

function createAudioMix({
	channelMode,
	include,
	volumePercent,
}: {
	channelMode: AudioMix["tracks"][string]["channelMode"];
	include: boolean;
	volumePercent: number;
}): AudioMix {
	return {
		finalPeakGuardDb: -1,
		outputChannels: 2,
		tracks: {
			"audio-desktop": {
				channelMode: "preserve",
				include: true,
				trackId: "audio-desktop",
				volumePercent: 100,
			},
			"audio-voice": {
				channelMode,
				include,
				trackId: "audio-voice",
				volumePercent,
			},
		},
	};
}

function createPreparedTrackStates({
	channelLabels,
	channels,
}: {
	channelLabels: string[];
	channels: Array<Array<[number, number]>>;
}): PreviewMeteringTrackStates {
	return {
		"audio-voice": createPreparedTrackState({
			channelLabels,
			channels,
			trackId: "audio-voice",
		}),
	};
}

function createPreparedTrackState({
	channelLabels,
	channels,
	trackId,
}: {
	channelLabels: string[];
	channels: Array<Array<[number, number]>>;
	trackId: "audio-voice" | "audio-desktop";
}): PreviewMeteringTrackStates[string] {
	const trackIndex = trackId === "audio-voice" ? 0 : 1;

	return {
		prepared: {
			audioBuffer: createTestAudioBuffer(channels),
			channelLabels,
			startPositionSeconds: 0,
			track: {
				channels: channelLabels.length,
				id: trackId,
				kind: "audio",
				label: trackId === "audio-voice" ? "Voice" : "Desktop",
			},
			trackId,
			trackIndex,
		},
		status: "ready",
		trackId,
	};
}

function createPreparedTrackStateWithAudioBuffer({
	audioBuffer,
	channelLabels,
	trackId,
}: {
	audioBuffer: AudioBuffer;
	channelLabels: string[];
	trackId: "audio-voice" | "audio-desktop";
}): PreviewMeteringTrackStates[string] {
	const trackIndex = trackId === "audio-voice" ? 0 : 1;

	return {
		prepared: {
			audioBuffer,
			channelLabels,
			startPositionSeconds: 0,
			track: {
				channels: channelLabels.length,
				id: trackId,
				kind: "audio",
				label: trackId === "audio-voice" ? "Voice" : "Desktop",
			},
			trackId,
			trackIndex,
		},
		status: "ready",
		trackId,
	};
}

function createTestAudioBuffer(
	channels: Array<Array<[number, number]>>,
): AudioBuffer {
	const length = 200;
	const channelData = channels.map((peaks) => {
		const data = new Float32Array(length);

		for (const [frameIndex, value] of peaks) {
			data[frameIndex] = value;
		}

		return data;
	});

	return {
		copyFromChannel(destination, channelNumber, startInChannel = 0) {
			destination.set(
				channelData[channelNumber]?.subarray(
					startInChannel,
					startInChannel + destination.length,
				) ?? new Float32Array(destination.length),
			);
		},
		copyToChannel(source, channelNumber, startInChannel = 0) {
			channelData[channelNumber]?.set(source, startInChannel);
		},
		duration: length / 1_000,
		getChannelData(channelNumber) {
			const data = channelData[channelNumber];

			if (!data) {
				throw new Error(`Missing channel ${channelNumber}.`);
			}

			return data;
		},
		length,
		numberOfChannels: channelData.length,
		sampleRate: 1_000,
	} as AudioBuffer;
}

function createCountedTestAudioBuffer({
	channels,
	onGetChannelData,
}: {
	channels: Array<Array<[number, number]>>;
	onGetChannelData: () => void;
}): AudioBuffer {
	const length = 4_800;
	const channelData = channels.map((peaks) => {
		const data = new Float32Array(length);

		for (const [frameIndex, value] of peaks) {
			data[frameIndex] = value;
		}

		return data;
	});

	return {
		copyFromChannel(destination, channelNumber, startInChannel = 0) {
			destination.set(
				channelData[channelNumber]?.subarray(
					startInChannel,
					startInChannel + destination.length,
				) ?? new Float32Array(destination.length),
			);
		},
		copyToChannel(source, channelNumber, startInChannel = 0) {
			channelData[channelNumber]?.set(source, startInChannel);
		},
		duration: length / 48_000,
		getChannelData(channelNumber) {
			onGetChannelData();
			const data = channelData[channelNumber];

			if (!data) {
				throw new Error(`Missing channel ${channelNumber}.`);
			}

			return data;
		},
		length,
		numberOfChannels: channelData.length,
		sampleRate: 48_000,
	} as AudioBuffer;
}
