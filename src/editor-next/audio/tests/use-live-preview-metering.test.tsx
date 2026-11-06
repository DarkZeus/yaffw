/* @vitest-environment jsdom */

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AudioMix } from "@/editor-core/model";
import type { LivePreviewMeteringClock } from "../meters/preview-metering-live";
import { useLivePreviewMetering } from "../meters/use-live-preview-metering";
import type { PreviewAudioEngineMeterSnapshot } from "../types/preview-audio-engine.types";

const frameCallbacks: Array<{
	callback: FrameRequestCallback;
	id: number;
}> = [];
const timeoutCallbacks: Array<{
	callback: () => void;
	delayMs?: number;
	id: number;
}> = [];
let nextTimeoutId = 1;
let nextFrameId = 1;

beforeEach(() => {
	frameCallbacks.length = 0;
	timeoutCallbacks.length = 0;
	nextFrameId = 1;
	nextTimeoutId = 1;
	Object.defineProperty(window, "requestAnimationFrame", {
		configurable: true,
		value: vi.fn((callback: FrameRequestCallback) => {
			const id = nextFrameId;
			nextFrameId += 1;
			frameCallbacks.push({ callback, id });
			return id;
		}),
	});
	Object.defineProperty(window, "cancelAnimationFrame", {
		configurable: true,
		value: vi.fn((frameId: number) => {
			const callbackIndex = frameCallbacks.findIndex(
				(callback) => callback.id === frameId,
			);

			if (callbackIndex >= 0) {
				frameCallbacks.splice(callbackIndex, 1);
			}
		}),
	});
	Object.defineProperty(window, "setTimeout", {
		configurable: true,
		value: vi.fn((callback: () => void, delayMs?: number) => {
			const id = nextTimeoutId;
			nextTimeoutId += 1;
			timeoutCallbacks.push({ callback, delayMs, id });
			return id;
		}),
	});
	Object.defineProperty(window, "clearTimeout", {
		configurable: true,
		value: vi.fn((timeoutId: number) => {
			const callbackIndex = timeoutCallbacks.findIndex(
				(callback) => callback.id === timeoutId,
			);

			if (callbackIndex >= 0) {
				timeoutCallbacks.splice(callbackIndex, 1);
			}
		}),
	});
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("useLivePreviewMetering", () => {
	it("ignores stale frames after pause and continues fading on newer frames", () => {
		let currentNowMs = 0;
		let isPlaying = true;
		const playbackStateListeners = new Set<() => void>();
		const clock = createMeteringClock({
			getIsPlaying: () => isPlaying,
			readMeterSnapshot: () => createReadySnapshot(1),
			subscribeToPlaybackStateChange: (listener) => {
				playbackStateListeners.add(listener);

				return () => playbackStateListeners.delete(listener);
			},
		});

		render(<LivePreviewMeteringProbe clock={clock} now={() => currentNowMs} />);

		const alreadyDequeuedPlayingFrame = frameCallbacks.shift();
		expect(alreadyDequeuedPlayingFrame).toBeDefined();

		isPlaying = false;
		currentNowMs = 50;
		act(() => {
			for (const listener of playbackStateListeners) {
				listener();
			}
		});

		const pausePeak = Number(screen.getByLabelText("voice peak").textContent);
		expect(pausePeak).toBeLessThan(0);
		expect(pausePeak).toBeGreaterThan(-90);
		expect(window.cancelAnimationFrame).toHaveBeenCalledWith(
			alreadyDequeuedPlayingFrame?.id,
		);

		act(() => {
			alreadyDequeuedPlayingFrame?.callback(49);
		});
		expect(Number(screen.getByLabelText("voice peak").textContent)).toBe(
			pausePeak,
		);

		const staleTransitionFrame = frameCallbacks.shift();
		expect(staleTransitionFrame).toBeDefined();
		act(() => {
			staleTransitionFrame?.callback(49);
		});
		expect(Number(screen.getByLabelText("voice peak").textContent)).toBe(
			pausePeak,
		);

		act(() => {
			frameCallbacks.shift()?.callback(66);
		});
		const continuedFadePeak = Number(
			screen.getByLabelText("voice peak").textContent,
		);
		expect(continuedFadePeak).toBeLessThan(pausePeak);
		expect(continuedFadePeak).toBeGreaterThan(-90);
	});
});

function LivePreviewMeteringProbe({
	clock,
	now = () => 0,
}: {
	clock: LivePreviewMeteringClock;
	now?: () => number;
}) {
	const liveMetering = useLivePreviewMetering({
		audioMix,
		clock,
		enabled: true,
		knownTrackIds: ["audio-voice"],
		now,
		soloedAudioTrackId: null,
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

function createMeteringClock({
	getIsPlaying,
	readMeterSnapshot,
	subscribeToPlaybackStateChange = () => () => undefined,
}: {
	getIsPlaying: () => boolean;
	readMeterSnapshot: () => PreviewAudioEngineMeterSnapshot | null;
	subscribeToPlaybackStateChange?: LivePreviewMeteringClock["subscribeToPlaybackStateChange"];
}): LivePreviewMeteringClock {
	return {
		getIsPlaying,
		getMeteringStatus: () => "ready",
		readMeterSnapshot,
		subscribeToPlaybackStateChange,
	};
}

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
