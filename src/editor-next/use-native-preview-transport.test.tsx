/* @vitest-environment jsdom */

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type MultiTrack from "wavesurfer-multitrack";

import type { Selection } from "@/editor-core/model";

import { useNativePreviewTransport } from "./use-native-preview-transport";

const play = vi.fn().mockResolvedValue(undefined);
const pause = vi.fn();

beforeEach(() => {
	Object.defineProperty(HTMLMediaElement.prototype, "play", {
		configurable: true,
		value: play,
	});
	Object.defineProperty(HTMLMediaElement.prototype, "pause", {
		configurable: true,
		value: pause,
	});
	play.mockClear();
	pause.mockClear();
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("useNativePreviewTransport", () => {
	it("drives native preview commands through the video and multitrack refs", async () => {
		const multitrack = createMultitrackSpy();

		render(<NativePreviewTransportProbe multitrack={multitrack} />);

		const video = screen.getByLabelText("Preview video") as HTMLVideoElement;

		fireEvent.click(screen.getByRole("button", { name: "Toggle playback" }));
		await waitFor(() => {
			expect(play).toHaveBeenCalledTimes(1);
		});
		await waitFor(() => {
			expect(readState()).toContain("playing:true");
		});

		fireEvent.click(screen.getByRole("button", { name: "Toggle playback" }));
		expect(pause).toHaveBeenCalledTimes(1);
		expect(readState()).toContain("playing:false");

		fireEvent.click(screen.getByRole("button", { name: "Seek forward" }));
		expect(video.currentTime).toBe(10);
		expect(readState()).toContain("playhead:10000000");

		fireEvent.click(screen.getByRole("button", { name: "Step forward" }));
		expect(video.currentTime).toBeCloseTo(10.033333, 5);

		fireEvent.click(screen.getByRole("button", { name: "Set speed" }));
		expect(video.playbackRate).toBe(1.5);
		expect(multitrack.setAudioRate).toHaveBeenCalledWith(1.5);
		expect(readState()).toContain("rate:1.5");

		fireEvent.click(screen.getByRole("button", { name: "Set volume" }));
		expect(video.volume).toBe(0.25);
		expect(readState()).toContain("volume:0.25");

		fireEvent.click(screen.getByRole("button", { name: "Toggle mute" }));
		expect(video.muted).toBe(true);
		expect(readState()).toContain("muted:true");
	});

	it("loops only after playback enters the selection", async () => {
		const { frameCallbacks, requestAnimationFrame } =
			stubPreviewAnimationFrames();

		render(
			<NativePreviewTransportProbe
				audioTransportReady={false}
				selection={{ endUs: 8_000_000, startUs: 4_000_000 }}
			/>,
		);

		const video = screen.getByLabelText("Preview video") as HTMLVideoElement;

		fireEvent.click(screen.getByRole("button", { name: "Toggle loop" }));
		video.currentTime = 2;
		fireEvent.click(screen.getByRole("button", { name: "Toggle playback" }));

		await waitFor(() => {
			expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
		});
		runNextPreviewFrame(frameCallbacks);
		expect(video.currentTime).toBe(2);
		expect(readState()).toContain("playhead:2000000");

		video.currentTime = 4.5;
		runNextPreviewFrame(frameCallbacks);
		expect(video.currentTime).toBe(4.5);

		video.currentTime = 8.1;
		runNextPreviewFrame(frameCallbacks);
		expect(video.currentTime).toBe(4);
		expect(readState()).toContain("playhead:4000000");
	});

	it("resets playhead and selection loop when the source changes", async () => {
		const nextSource = new File(["next"], "next.mp4", { type: "video/mp4" });
		const view = render(<NativePreviewTransportProbe />);

		fireEvent.click(screen.getByRole("button", { name: "Seek forward" }));
		fireEvent.click(screen.getByRole("button", { name: "Toggle loop" }));
		expect(readState()).toContain("playhead:10000000");
		expect(readState()).toContain("loop:true");

		view.rerender(<NativePreviewTransportProbe source={nextSource} />);

		await waitFor(() => {
			expect(readState()).toContain("playhead:0");
		});
		expect(readState()).toContain("loop:false");
	});
});

function NativePreviewTransportProbe({
	audioTransportReady = true,
	multitrack = createMultitrackSpy(),
	selection = { endUs: 12_000_000, startUs: 0 },
	source = previewSource,
}: {
	audioTransportReady?: boolean;
	multitrack?: ReturnType<typeof createMultitrackSpy>;
	selection?: Selection;
	source?: Blob;
}) {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const multitrackRef = useRef<MultiTrack | null>(
		multitrack as unknown as MultiTrack,
	);
	const transport = useNativePreviewTransport({
		audioTransportReady,
		durationUs: 12_000_000,
		frameDurationUs: 33_333,
		multitrackRef,
		selection,
		source,
		videoRef,
	});

	return (
		<div>
			<video
				aria-label="Preview video"
				onEnded={transport.handleEnded}
				onPause={transport.handleNativePause}
				onPlay={transport.handleNativePlay}
				onSeeked={transport.syncPlayheadWithNativeVideo}
				onTimeUpdate={transport.syncPlayheadWithNativeVideo}
				ref={videoRef}
			>
				<track kind="captions" />
			</video>
			<output aria-label="transport state">
				{[
					`playing:${transport.isPlaying}`,
					`muted:${transport.muted}`,
					`rate:${transport.playbackRate}`,
					`volume:${transport.volume}`,
					`playhead:${transport.playheadUs}`,
					`loop:${transport.selectionLoopEnabled}`,
				].join("|")}
			</output>
			<button onClick={() => void transport.togglePlayback()} type="button">
				Toggle playback
			</button>
			<button onClick={() => transport.seekByUs(10_000_000)} type="button">
				Seek forward
			</button>
			<button onClick={() => transport.stepFrame(1)} type="button">
				Step forward
			</button>
			<button
				onClick={() => transport.setPreviewPlaybackRate(1.5)}
				type="button"
			>
				Set speed
			</button>
			<button onClick={() => transport.setPreviewVolume(0.25)} type="button">
				Set volume
			</button>
			<button onClick={transport.toggleMuted} type="button">
				Toggle mute
			</button>
			<button onClick={transport.toggleSelectionLoop} type="button">
				Toggle loop
			</button>
		</div>
	);
}

function createMultitrackSpy() {
	return {
		getCurrentTime: vi.fn(() => 0),
		pause: vi.fn(),
		play: vi.fn(),
		setAudioRate: vi.fn(),
		setTime: vi.fn(),
	};
}

function readState() {
	return screen.getByLabelText("transport state").textContent ?? "";
}

function stubPreviewAnimationFrames() {
	const frameCallbacks: FrameRequestCallback[] = [];
	const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
		frameCallbacks.push(callback);
		return frameCallbacks.length;
	});
	const cancelAnimationFrame = vi.fn();
	vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
	vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);

	return {
		cancelAnimationFrame,
		frameCallbacks,
		requestAnimationFrame,
	};
}

function runNextPreviewFrame(frameCallbacks: FrameRequestCallback[]) {
	act(() => {
		frameCallbacks.shift()?.(16);
	});
}

const previewSource = new File(["video"], "clip.mp4", { type: "video/mp4" });
