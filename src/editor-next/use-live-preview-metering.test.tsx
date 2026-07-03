/* @vitest-environment jsdom */

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AudioMix } from "@/editor-core/model";
import type { PreviewMeteringTrackStates } from "./preview-metering-preparation.types";
import { useLivePreviewMetering } from "./use-live-preview-metering";

const frameCallbacks: FrameRequestCallback[] = [];
const timeoutCallbacks: Array<() => void> = [];

beforeEach(() => {
	frameCallbacks.length = 0;
	timeoutCallbacks.length = 0;
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
	Object.defineProperty(window, "setTimeout", {
		configurable: true,
		value: vi.fn((callback: () => void) => {
			timeoutCallbacks.push(callback);
			return timeoutCallbacks.length;
		}),
	});
	Object.defineProperty(window, "clearTimeout", {
		configurable: true,
		value: vi.fn(),
	});
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("useLivePreviewMetering", () => {
	it("updates prepared meter values on every animation frame", () => {
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

		playheadUs = 100_000;
		act(() => {
			frameCallbacks.shift()?.(32);
		});

		const secondFramePeak = Number(
			screen.getByLabelText("voice peak").textContent,
		);

		expect(secondFramePeak).toBeLessThan(0);
		expect(secondFramePeak).toBeGreaterThan(-12.04);

		act(() => {
			frameCallbacks.shift()?.(80);
		});

		const releasedPeak = Number(
			screen.getByLabelText("voice peak").textContent,
		);

		expect(releasedPeak).toBeLessThan(0);
		expect(releasedPeak).toBeLessThan(secondFramePeak);
		expect(releasedPeak).toBeGreaterThan(-12.04);
		expect(screen.getByLabelText("voice clip").textContent).toBe("held");
	});

	it("uses fast attack and slower release for displayed peak values", () => {
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

		act(() => {
			frameCallbacks.shift()?.(16);
		});

		playheadUs = 150_000;
		act(() => {
			frameCallbacks.shift()?.(80);
		});

		const attackPeak = Number(screen.getByLabelText("voice peak").textContent);
		expect(attackPeak).toBeLessThan(0);
		expect(attackPeak).toBeGreaterThan(-1);
		expect(screen.getByLabelText("voice clip").textContent).toBe("held");

		playheadUs = 100_000;
		act(() => {
			frameCallbacks.shift()?.(144);
		});

		const releasePeak = Number(screen.getByLabelText("voice peak").textContent);
		expect(releasePeak).toBeLessThan(attackPeak);
		expect(releasePeak).toBeGreaterThan(-12.04);
		expect(screen.getByLabelText("voice clip").textContent).toBe("held");
	});

	it("uses low-frequency paused polling instead of an animation-frame loop", () => {
		let isPlaying = false;
		const clock = {
			getIsPlaying: () => isPlaying,
			getPlayheadUs: () => 100_000,
		};

		render(
			<LivePreviewMeteringProbe
				audioMix={audioMix}
				clock={clock}
				trackStates={trackStates}
			/>,
		);

		expect(Number(screen.getByLabelText("voice peak").textContent)).toBe(-72);
		expect(window.requestAnimationFrame).not.toHaveBeenCalled();
		expect(timeoutCallbacks).toHaveLength(1);

		isPlaying = true;
		act(() => {
			timeoutCallbacks.shift()?.();
		});

		expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
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
	const liveMetering = useLivePreviewMetering({
		audioMix,
		clock,
		enabled: true,
		now: fixedNow,
		soloedAudioTrackId: null,
		trackStates,
	});
	const voiceState = liveMetering.trackStates["audio-voice"];
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
