/* @vitest-environment jsdom */

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
	it("does not read or replace the live timer when an obsolete poll runs after pause and resume", () => {
		let currentNowMs = 0;
		let isPlaying = true;
		const listeners = new Set<() => void>();
		const readMeterSnapshot = vi.fn(() => createReadySnapshot(0.25));
		const clock = createMeteringClock({
			getIsPlaying: () => isPlaying,
			readMeterSnapshot,
			subscribeToPlaybackStateChange: (listener) => {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
		});
		render(<LivePreviewMeteringProbe clock={clock} now={() => currentNowMs} />);
		const obsoletePoll = timeoutCallbacks.shift();
		expect(obsoletePoll?.delayMs).toBe(50);

		act(() => {
			currentNowMs = 20;
			isPlaying = false;
			for (const listener of listeners) listener();
			currentNowMs = 40;
			isPlaying = true;
			for (const listener of listeners) listener();
		});
		readMeterSnapshot.mockClear();
		const currentPoll = timeoutCallbacks[0];
		act(() => {
			currentNowMs = 100;
			obsoletePoll?.callback();
		});
		expect(readMeterSnapshot).not.toHaveBeenCalled();
		expect(timeoutCallbacks).toEqual([currentPoll]);
	});

	it("discards an in-flight sample superseded by a playback transition", () => {
		let currentNowMs = 0;
		let isPlaying = true;
		let pauseDuringRead = false;
		const listeners = new Set<() => void>();
		const readMeterSnapshot = vi.fn((sampleSignal: boolean) => {
			if (sampleSignal && pauseDuringRead) {
				isPlaying = false;
				for (const listener of listeners) listener();
				return createReadySnapshot(1);
			}
			return createReadySnapshot(0.25);
		});
		const clock = createMeteringClock({
			getIsPlaying: () => isPlaying,
			readMeterSnapshot,
			subscribeToPlaybackStateChange: (listener) => {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
		});
		render(<LivePreviewMeteringProbe clock={clock} now={() => currentNowMs} />);
		act(() => {
			currentNowMs = 50;
			pauseDuringRead = true;
			timeoutCallbacks.shift()?.callback();
			frameCallbacks.shift()?.callback(66);
		});
		expect(readMeterSnapshot.mock.calls).toEqual([[true], [true], [false]]);
		expect(readClips()).toEqual(["clear", "clear", "clear", "clear"]);
		expect(
			Number(screen.getByLabelText("voice peak").textContent),
		).toBeLessThan(-12.04);
		expect(timeoutCallbacks.map(({ delayMs }) => delayMs)).toEqual([250]);
	});

	it("refreshes preparing, unavailable, and ready presentations without sampling while paused", () => {
		let status: ReturnType<LivePreviewMeteringClock["getMeteringStatus"]> =
			"preparing";
		const readMeterSnapshot = vi.fn(() =>
			status === "failed" ? null : createReadySnapshot(1),
		);
		const clock = createMeteringClock({
			getIsPlaying: () => false,
			getMeteringStatus: () => status,
			readMeterSnapshot,
		});
		render(<LivePreviewMeteringProbe clock={clock} />);
		expect(screen.getByLabelText("voice state").textContent).toBe("preparing");
		expect(screen.getByLabelText("combined state").textContent).toBe(
			"preparing",
		);
		act(() => {
			status = "failed";
			timeoutCallbacks.shift()?.callback();
		});
		expect(screen.getByLabelText("voice state").textContent).toBe(
			"unavailable",
		);
		expect(screen.getByLabelText("combined state").textContent).toBe(
			"unavailable",
		);
		expect(readMeterSnapshot).toHaveBeenCalledExactlyOnceWith(false);
		act(() => {
			status = "ready";
			timeoutCallbacks.shift()?.callback();
		});
		expect(readMeterSnapshot.mock.calls).toEqual([[false], [false]]);
		expect(screen.getByLabelText("voice state").textContent).toBe("ready");
		expect(screen.getByLabelText("combined state").textContent).toBe("ready");
		expect(screen.getByLabelText("voice peak").textContent).toBe("-90");
		expect(frameCallbacks).toHaveLength(0);
	});

	it("expires each track and combined channel independently during paused decay", () => {
		let currentNowMs = 0;
		let isPlaying = true;
		let snapshot = createReadySnapshot(1, 0.1);
		const listeners = new Set<() => void>();
		const clock = createMeteringClock({
			getIsPlaying: () => isPlaying,
			readMeterSnapshot: () => snapshot,
			subscribeToPlaybackStateChange: (listener) => {
				listeners.add(listener);
				return () => listeners.delete(listener);
			},
		});
		render(<LivePreviewMeteringProbe clock={clock} now={() => currentNowMs} />);
		expect(readClips()).toEqual(["held", "clear", "held", "clear"]);

		act(() => {
			currentNowMs = 400;
			snapshot = createReadySnapshot(0.1, 1);
			timeoutCallbacks.shift()?.callback();
			frameCallbacks.shift()?.callback(currentNowMs);
		});
		expect(readClips()).toEqual(["held", "held", "held", "held"]);

		act(() => {
			currentNowMs = 450;
			isPlaying = false;
			for (const listener of listeners) listener();
		});
		act(() => frameCallbacks.shift()?.callback(750));
		expect(readClips()).toEqual(["clear", "held", "clear", "held"]);
		act(() => frameCallbacks.shift()?.callback(1150));
		expect(readClips()).toEqual(["clear", "clear", "clear", "clear"]);
		act(() => frameCallbacks.shift()?.callback(2400));
		expect(screen.getByLabelText("voice peak").textContent).toBe("-90");
		expect(screen.getByLabelText("combined peak").textContent).toBe("-90");
		expect(frameCallbacks).toHaveLength(0);
	});

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
		clock,
		knownTrackIds: ["audio-voice"],
		now,
	});
	const voiceState = liveMetering.trackStates["audio-voice"];
	const combinedState = liveMetering.combinedState;
	const voice = voiceState?.status === "ready" ? voiceState.channels : [];
	const combined =
		combinedState.status === "ready" ? combinedState.channels : [];

	return (
		<div>
			<output aria-label="voice state">{voiceState?.status}</output>
			<output aria-label="combined state">{combinedState.status}</output>
			<output aria-label="voice peak">{voice[0]?.peakDb}</output>
			<output aria-label="combined peak">{combined[0]?.peakDb}</output>
			<output aria-label="voice left clip">
				{voice[0]?.clipHeld ? "held" : "clear"}
			</output>
			<output aria-label="voice right clip">
				{voice[1]?.clipHeld ? "held" : "clear"}
			</output>
			<output aria-label="combined left clip">
				{combined[0]?.clipHeld ? "held" : "clear"}
			</output>
			<output aria-label="combined right clip">
				{combined[1]?.clipHeld ? "held" : "clear"}
			</output>
		</div>
	);
}

function createMeteringClock({
	getIsPlaying,
	getMeteringStatus = () => "ready",
	readMeterSnapshot,
	subscribeToPlaybackStateChange = () => () => undefined,
}: {
	getIsPlaying: () => boolean;
	getMeteringStatus?: LivePreviewMeteringClock["getMeteringStatus"];
	readMeterSnapshot: LivePreviewMeteringClock["readMeterSnapshot"];
	subscribeToPlaybackStateChange?: LivePreviewMeteringClock["subscribeToPlaybackStateChange"];
}): LivePreviewMeteringClock {
	return {
		getIsPlaying,
		getMeteringStatus,
		readMeterSnapshot,
		subscribeToPlaybackStateChange,
	};
}

function readClips() {
	return ["voice left", "voice right", "combined left", "combined right"].map(
		(label) => screen.getByLabelText(`${label} clip`).textContent,
	);
}

function createReadySnapshot(
	peak: number,
	rightPeak = peak,
): PreviewAudioEngineMeterSnapshot {
	return {
		combinedState: {
			channels: [
				{ label: "Left", peak },
				{ label: "Right", peak: rightPeak },
			],
			partial: false,
			status: "ready",
		},
		trackStates: {
			"audio-voice": {
				channels: [
					{ label: "Left", peak },
					{ label: "Right", peak: rightPeak },
				],
				status: "ready",
				trackId: "audio-voice",
			},
		},
	};
}
