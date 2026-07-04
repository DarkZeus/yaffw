/* @vitest-environment jsdom */

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AudioMix } from "@/editor-core/model";
import type { PreviewAudioEngineMeterSnapshot } from "../engine/preview-audio-engine";
import type { LivePreviewMeteringClock } from "../meters/preview-metering-live";
import { useLivePreviewMetering } from "../meters/use-live-preview-metering";

const frameCallbacks: FrameRequestCallback[] = [];
const timeoutCallbacks: Array<{ callback: () => void; delayMs?: number }> = [];

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
		value: vi.fn((callback: () => void, delayMs?: number) => {
			timeoutCallbacks.push({ callback, delayMs });
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
	it("updates displayed meter values from Preview audio engine snapshots", () => {
		let currentNowMs = 0;
		let snapshot = createReadySnapshot(0.25);
		const clock = createMeteringClock({
			getIsPlaying: () => true,
			readMeterSnapshot: () => snapshot,
		});

		render(<LivePreviewMeteringProbe clock={clock} now={() => currentNowMs} />);

		expect(Number(screen.getByLabelText("voice peak").textContent)).toBeCloseTo(
			-12.04,
			2,
		);

		snapshot = createReadySnapshot(1);
		currentNowMs = 80;
		act(() => {
			timeoutCallbacks.shift()?.callback();
		});
		act(() => {
			frameCallbacks.shift()?.(80);
		});

		const attackPeak = Number(screen.getByLabelText("voice peak").textContent);
		expect(attackPeak).toBeLessThanOrEqual(0);
		expect(attackPeak).toBeGreaterThan(-1);
		expect(screen.getByLabelText("voice clip").textContent).toBe("held");
	});

	it("decays displayed meters toward silence after playback stops", () => {
		let currentNowMs = 0;
		let isPlaying = true;
		const clock = createMeteringClock({
			getIsPlaying: () => isPlaying,
			readMeterSnapshot: () => createReadySnapshot(1),
		});

		render(<LivePreviewMeteringProbe clock={clock} now={() => currentNowMs} />);

		expect(Number(screen.getByLabelText("voice peak").textContent)).toBe(0);

		isPlaying = false;
		currentNowMs = 250;
		act(() => {
			timeoutCallbacks.shift()?.callback();
		});

		const decayedPeak = Number(screen.getByLabelText("voice peak").textContent);
		expect(decayedPeak).toBeLessThan(0);
		expect(decayedPeak).toBeGreaterThan(-72);
		expect(timeoutCallbacks).toHaveLength(1);
		expect(timeoutCallbacks[0]?.delayMs).toBe(250);
	});

	it("animates playing meter values on animation frames between snapshot reads", () => {
		let currentNowMs = 0;
		let snapshot = createReadySnapshot(0.25);
		const clock = createMeteringClock({
			getIsPlaying: () => true,
			readMeterSnapshot: () => snapshot,
		});

		render(<LivePreviewMeteringProbe clock={clock} now={() => currentNowMs} />);

		expect(Number(screen.getByLabelText("voice peak").textContent)).toBeCloseTo(
			-12.04,
			2,
		);

		snapshot = createReadySnapshot(1);
		currentNowMs = 16;
		act(() => {
			frameCallbacks.shift()?.(16);
		});

		expect(Number(screen.getByLabelText("voice peak").textContent)).toBeCloseTo(
			-12.04,
			2,
		);

		currentNowMs = 64;
		act(() => {
			timeoutCallbacks.shift()?.callback();
		});
		act(() => {
			frameCallbacks.shift()?.(64);
		});

		const committedPeak = Number(
			screen.getByLabelText("voice peak").textContent,
		);
		expect(committedPeak).toBeGreaterThan(-2);
	});

	it("does not sample expensive playing meter snapshots at frame cadence", () => {
		let currentNowMs = 0;
		const readMeterSnapshot = vi.fn(() => createReadySnapshot(0.25));
		const clock = createMeteringClock({
			getIsPlaying: () => true,
			readMeterSnapshot,
		});

		render(<LivePreviewMeteringProbe clock={clock} now={() => currentNowMs} />);

		expect(readMeterSnapshot).toHaveBeenCalledTimes(1);

		for (const frameTimestampMs of [16, 32, 48]) {
			currentNowMs = frameTimestampMs;
			act(() => {
				frameCallbacks.shift()?.(frameTimestampMs);
			});
		}

		expect(readMeterSnapshot).toHaveBeenCalledTimes(1);

		currentNowMs = 64;
		act(() => {
			timeoutCallbacks.shift()?.callback();
		});

		expect(readMeterSnapshot).toHaveBeenCalledTimes(2);
	});

	it("uses animation frames for playing display updates and low-frequency polling for snapshots", () => {
		const clock = createMeteringClock({
			getIsPlaying: () => true,
			readMeterSnapshot: () => createReadySnapshot(1),
		});

		render(<LivePreviewMeteringProbe clock={clock} now={fixedNow} />);

		expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
		expect(timeoutCallbacks).toHaveLength(1);
		expect(timeoutCallbacks[0]?.delayMs).toBe(50);
	});

	it("uses low-frequency paused polling instead of an animation-frame loop", () => {
		const clock = createMeteringClock({
			getIsPlaying: () => false,
			readMeterSnapshot: () => createReadySnapshot(1),
		});

		render(<LivePreviewMeteringProbe clock={clock} now={fixedNow} />);

		expect(Number(screen.getByLabelText("voice peak").textContent)).toBe(-72);
		expect(window.requestAnimationFrame).not.toHaveBeenCalled();
		expect(timeoutCallbacks).toHaveLength(1);
		expect(timeoutCallbacks[0]?.delayMs).toBe(250);
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
}: {
	getIsPlaying: () => boolean;
	readMeterSnapshot: () => PreviewAudioEngineMeterSnapshot | null;
}): LivePreviewMeteringClock {
	return {
		getIsPlaying,
		getMeteringStatus: () => "ready",
		readMeterSnapshot,
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

function fixedNow() {
	return 0;
}
