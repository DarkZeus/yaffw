/* @vitest-environment jsdom */

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AudioMix } from "@/editor-core/model";
import type { PreviewMeteringTrackStates } from "./preview-metering-preparation.types";
import { useLivePreviewMetering } from "./use-live-preview-metering";

const frameCallbacks: FrameRequestCallback[] = [];

beforeEach(() => {
	frameCallbacks.length = 0;
	Object.defineProperty(window, "requestAnimationFrame", {
		configurable: true,
		value: vi.fn((callback: FrameRequestCallback) => {
			frameCallbacks.push(callback);
			return frameCallbacks.length;
		}),
	});
	Object.defineProperty(window, "cancelAnimationFrame", {
		configurable: true,
		value: vi.fn(),
	});
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("useLivePreviewMetering", () => {
	it("updates prepared meter values on animation frames", () => {
		let playheadUs = 100_000;
		const clock = {
			getIsPlaying: () => true,
			getPlayheadUs: () => playheadUs,
		};

		render(
			<LivePreviewMeteringProbe
				audioMix={audioMix}
				clock={clock}
				trackStates={trackStates}
			/>,
		);

		expect(Number(screen.getByLabelText("voice peak").textContent)).toBeCloseTo(
			-12.04,
			2,
		);

		playheadUs = 150_000;
		act(() => {
			frameCallbacks.shift()?.(16);
		});

		expect(Number(screen.getByLabelText("voice peak").textContent)).toBe(0);
		expect(screen.getByLabelText("voice clip").textContent).toBe("held");
	});
});

function LivePreviewMeteringProbe({
	audioMix,
	clock,
	trackStates,
}: {
	audioMix: AudioMix;
	clock: {
		getIsPlaying: () => boolean;
		getPlayheadUs: () => number;
	};
	trackStates: PreviewMeteringTrackStates;
}) {
	const liveTrackStates = useLivePreviewMetering({
		audioMix,
		clock,
		enabled: true,
		now: fixedNow,
		soloedAudioTrackId: null,
		trackStates,
	});
	const voiceState = liveTrackStates["audio-voice"];
	const voicePeak =
		voiceState?.status === "ready" ? voiceState.channels[0]?.peakDb : null;
	const voiceClip =
		voiceState?.status === "ready" && voiceState.channels[0]?.clipHeld
			? "held"
			: "clear";

	return (
		<div>
			<output aria-label="voice peak">{voicePeak}</output>
			<output aria-label="voice clip">{voiceClip}</output>
		</div>
	);
}

const audioMix = {
	finalPeakGuardDb: -1,
	outputChannels: 2,
	tracks: {
		"audio-voice": {
			channelMode: "preserve",
			include: true,
			trackId: "audio-voice",
			volumePercent: 100,
		},
	},
} satisfies AudioMix;

function fixedNow() {
	return 1_000;
}

const trackStates = {
	"audio-voice": {
		prepared: {
			audioBuffer: createTestAudioBuffer(),
			channelLabels: ["Left"],
			startPositionSeconds: 0,
			track: {
				channels: 1,
				id: "audio-voice",
				kind: "audio",
				label: "Voice",
			},
			trackId: "audio-voice",
			trackIndex: 0,
		},
		status: "ready",
		trackId: "audio-voice",
	},
} satisfies PreviewMeteringTrackStates;

function createTestAudioBuffer(): AudioBuffer {
	const data = new Float32Array(200);
	data[100] = 0.25;
	data[150] = 1;

	return {
		copyFromChannel(destination, _channelNumber, startInChannel = 0) {
			destination.set(
				data.subarray(startInChannel, startInChannel + destination.length),
			);
		},
		copyToChannel(source, _channelNumber, startInChannel = 0) {
			data.set(source, startInChannel);
		},
		duration: 0.2,
		getChannelData() {
			return data;
		},
		length: 200,
		numberOfChannels: 1,
		sampleRate: 1_000,
	} as AudioBuffer;
}
