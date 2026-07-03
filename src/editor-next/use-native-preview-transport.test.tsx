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

import type { Selection } from "@/editor-core/model";

import { EXPORT_CORRECTNESS_FIXTURES } from "./export-correctness-fixtures";
import type { PreviewAudioEngine } from "./preview-audio-engine";
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
	it("drives native preview commands through the video and previewAudioEngine refs", async () => {
		const previewAudioEngine = createPreviewAudioEngineSpy();

		render(<NativePreviewTransportProbe previewAudioEngine={previewAudioEngine} />);

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

		previewAudioEngine.setTime.mockClear();
		fireEvent.click(screen.getByRole("button", { name: "Seek forward" }));
		expect(video.currentTime).toBe(10);
		expect(previewAudioEngine.setTime).toHaveBeenCalledWith(10);
		expect(readState()).toContain("playhead:10000000");

		fireEvent.click(screen.getByRole("button", { name: "Step forward" }));
		expect(video.currentTime).toBeCloseTo(10.033333, 5);

		fireEvent.click(screen.getByRole("button", { name: "Set speed" }));
		expect(video.playbackRate).toBe(1.5);
		expect(previewAudioEngine.setPlaybackRate).toHaveBeenCalledWith(1.5);
		expect(readState()).toContain("rate:1.5");

		fireEvent.click(screen.getByRole("button", { name: "Set volume" }));
		expect(video.volume).toBe(0.25);
		expect(readState()).toContain("volume:0.25");

		fireEvent.click(screen.getByRole("button", { name: "Toggle mute" }));
		expect(video.muted).toBe(true);
		expect(readState()).toContain("muted:true");

		fireEvent.click(screen.getByRole("button", { name: "Toggle mute" }));
		expect(video.muted).toBe(true);
		expect(readState()).toContain("muted:false");
	});

	it("starts audio-master playback without waiting for native video playback", async () => {
		const playStarted = createDeferred<void>();
		const previewAudioEngine = createPreviewAudioEngineSpy();
		play.mockReturnValueOnce(playStarted.promise);

		render(<NativePreviewTransportProbe previewAudioEngine={previewAudioEngine} />);

		fireEvent.click(screen.getByRole("button", { name: "Toggle playback" }));

		await waitFor(() => {
			expect(play).toHaveBeenCalledTimes(1);
		});
		expect(screen.getByLabelText("Preview video")).toHaveProperty(
			"muted",
			true,
		);
		expect(previewAudioEngine.setTime).toHaveBeenCalledWith(0);
		expect(previewAudioEngine.play).toHaveBeenCalledTimes(1);
		expect(readState()).toContain("playing:true");

		await act(async () => {
			playStarted.resolve();
			await playStarted.promise;
		});

		expect(readState()).toContain("playing:true");
	});

	it("does not chase small custom-audio clock drift with native video seeks during playback", async () => {
		const previewAudioEngine = createPreviewAudioEngineSpy({
			currentTimeSeconds: 2.06,
		});

		render(<NativePreviewTransportProbe previewAudioEngine={previewAudioEngine} />);

		const video = screen.getByLabelText("Preview video") as HTMLVideoElement;

		fireEvent.click(screen.getByRole("button", { name: "Toggle playback" }));
		await waitFor(() => {
			expect(readState()).toContain("playing:true");
		});

		video.currentTime = 2.12;
		fireEvent.timeUpdate(video);

		expect(video.currentTime).toBe(2.12);
		expect(readState()).toContain("playhead:2060000");
	});

	it("resyncs visible audio-master video lag before it reaches a quarter second", async () => {
		const previewAudioEngine = createPreviewAudioEngineSpy({
			currentTimeSeconds: 2,
		});

		render(<NativePreviewTransportProbe previewAudioEngine={previewAudioEngine} />);

		const video = screen.getByLabelText("Preview video") as HTMLVideoElement;

		fireEvent.click(screen.getByRole("button", { name: "Toggle playback" }));
		await waitFor(() => {
			expect(readState()).toContain("playing:true");
		});

		video.currentTime = 1.9;
		fireEvent.timeUpdate(video);

		expect(video.currentTime).toBe(2);
		expect(readState()).toContain("playhead:2000000");
	});

	it("samples high-frequency playback frames without committing every tiny playhead tick to React state", async () => {
		const { frameCallbacks, requestAnimationFrame } =
			stubPreviewAnimationFrames();
		const transportHandleRef: {
			current: ReturnType<typeof useNativePreviewTransport> | null;
		} = {
			current: null,
		};

		render(
			<NativePreviewTransportProbe
				onTransport={(transport) => {
					transportHandleRef.current = transport;
				}}
				previewClockMode="native-video"
				selection={defaultSelection}
			/>,
		);

		const video = screen.getByLabelText("Preview video") as HTMLVideoElement;

		fireEvent.click(screen.getByRole("button", { name: "Toggle playback" }));

		await waitFor(() => {
			expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
		});

		video.currentTime = 1;
		runNextPreviewFrame(frameCallbacks, 0);

		expect(readState()).toContain("playhead:1000000");
		expect(transportHandleRef.current?.getPlayheadUs()).toBe(1_000_000);

		video.currentTime = 1.016;
		runNextPreviewFrame(frameCallbacks, 16);

		expect(transportHandleRef.current?.getPlayheadUs()).toBe(1_016_000);
		expect(readState()).toContain("playhead:1000000");

		video.currentTime = 1.052;
		runNextPreviewFrame(frameCallbacks, 52);

		expect(transportHandleRef.current?.getPlayheadUs()).toBe(1_052_000);
		expect(readState()).toContain("playhead:1052000");
	});

	it("hard-resyncs large native video drift to the audio-master clock", async () => {
		const previewAudioEngine = createPreviewAudioEngineSpy({
			currentTimeSeconds: 5,
		});

		render(<NativePreviewTransportProbe previewAudioEngine={previewAudioEngine} />);

		const video = screen.getByLabelText("Preview video") as HTMLVideoElement;

		fireEvent.click(screen.getByRole("button", { name: "Toggle playback" }));
		await waitFor(() => {
			expect(readState()).toContain("playing:true");
		});

		video.currentTime = 4.5;
		fireEvent.timeUpdate(video);

		expect(video.currentTime).toBe(5);
		expect(readState()).toContain("playhead:5000000");
	});

	it("keeps paused audio-master seeks on the requested visual follower frame", () => {
		const previewAudioEngine = createPreviewAudioEngineSpy({
			currentTimeSeconds: 0,
		});

		render(<NativePreviewTransportProbe previewAudioEngine={previewAudioEngine} />);

		const video = screen.getByLabelText("Preview video") as HTMLVideoElement;

		fireEvent.click(screen.getByRole("button", { name: "Seek forward" }));
		expect(video.currentTime).toBe(10);
		expect(previewAudioEngine.setTime).toHaveBeenCalledWith(10);
		expect(readState()).toContain("playhead:10000000");

		fireEvent.seeked(video);

		expect(video.currentTime).toBe(10);
		expect(readState()).toContain("playhead:10000000");
	});

	it("starts audio-master playback from a paused timeline seek without snapping back", async () => {
		const { frameCallbacks, requestAnimationFrame } =
			stubPreviewAnimationFrames();
		const previewAudioEngine = createPreviewAudioEngineSpy({
			currentTimeSeconds: 0,
			setTimeUpdatesCurrentTime: true,
		});

		render(<NativePreviewTransportProbe previewAudioEngine={previewAudioEngine} />);

		const video = screen.getByLabelText("Preview video") as HTMLVideoElement;

		fireEvent.click(screen.getByRole("button", { name: "Seek forward" }));
		expect(video.currentTime).toBe(10);
		expect(readState()).toContain("playhead:10000000");

		fireEvent.click(screen.getByRole("button", { name: "Toggle playback" }));

		await waitFor(() => {
			expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
		});
		runNextPreviewFrame(frameCallbacks);

		expect(previewAudioEngine.setTime).toHaveBeenLastCalledWith(10);
		expect(previewAudioEngine.getCurrentTime()).toBe(10);
		expect(video.currentTime).toBe(10);
		expect(readState()).toContain("playhead:10000000");
	});

	it("keeps paused audio-master frame steps on the requested visual follower frame", () => {
		const previewAudioEngine = createPreviewAudioEngineSpy({
			currentTimeSeconds: 0,
		});

		render(<NativePreviewTransportProbe previewAudioEngine={previewAudioEngine} />);

		const video = screen.getByLabelText("Preview video") as HTMLVideoElement;

		fireEvent.click(screen.getByRole("button", { name: "Step forward" }));
		expect(video.currentTime).toBeCloseTo(0.033333, 5);
		expect(previewAudioEngine.setTime).toHaveBeenCalledWith(0.033333);
		expect(readState()).toContain("playhead:33333");

		fireEvent.seeked(video);

		expect(video.currentTime).toBeCloseTo(0.033333, 5);
		expect(readState()).toContain("playhead:33333");
	});

	it("ignores native video playback events while audio-master owns preview state", async () => {
		const previewAudioEngine = createPreviewAudioEngineSpy({
			currentTimeSeconds: 3,
		});

		render(<NativePreviewTransportProbe previewAudioEngine={previewAudioEngine} />);

		const video = screen.getByLabelText("Preview video") as HTMLVideoElement;

		fireEvent.play(video);
		expect(readState()).toContain("playing:false");

		fireEvent.click(screen.getByRole("button", { name: "Toggle playback" }));
		await waitFor(() => {
			expect(readState()).toContain("playing:true");
		});
		previewAudioEngine.pause.mockClear();

		video.currentTime = 9;
		fireEvent.seeked(video);
		expect(video.currentTime).toBe(3);
		expect(readState()).toContain("playhead:3000000");

		fireEvent.pause(video);
		expect(previewAudioEngine.pause).not.toHaveBeenCalled();
		expect(readState()).toContain("playing:true");

		fireEvent.ended(video);
		expect(readState()).toContain("playing:true");
		expect(readState()).toContain("playhead:3000000");
	});

	it("keeps native-clock fallback tied to native video playback events", async () => {
		const playStarted = createDeferred<void>();
		const previewAudioEngine = createPreviewAudioEngineSpy();
		play.mockReturnValueOnce(playStarted.promise);

		render(
			<NativePreviewTransportProbe
				previewAudioEngine={previewAudioEngine}
				previewClockMode="native-video"
			/>,
		);

		const video = screen.getByLabelText("Preview video") as HTMLVideoElement;

		fireEvent.click(screen.getByRole("button", { name: "Toggle playback" }));

		await waitFor(() => {
			expect(play).toHaveBeenCalledTimes(1);
		});
		expect(previewAudioEngine.play).not.toHaveBeenCalled();
		expect(readState()).toContain("playing:false");

		await act(async () => {
			playStarted.resolve();
			await playStarted.promise;
		});

		await waitFor(() => {
			expect(readState()).toContain("playing:true");
		});

		fireEvent.pause(video);
		expect(readState()).toContain("playing:false");

		fireEvent.play(video);
		expect(readState()).toContain("playing:true");

		fireEvent.ended(video);
		expect(readState()).toContain("playing:false");
		expect(readState()).toContain("playhead:12000000");
	});

	it("does not start native-video free-run while audio-master preview is pending", async () => {
		const previewAudioEngine = createPreviewAudioEngineSpy();
		const view = render(
			<NativePreviewTransportProbe
				previewAudioEngine={previewAudioEngine}
				previewClockMode="audio-master-pending"
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Toggle playback" }));

		expect(play).not.toHaveBeenCalled();
		expect(previewAudioEngine.play).not.toHaveBeenCalled();
		expect(readState()).toContain("mode:audio-master-pending");
		expect(readState()).toContain("playing:false");

		view.rerender(
			<NativePreviewTransportProbe
				previewAudioEngine={previewAudioEngine}
				previewClockMode="audio-master"
			/>,
		);

		await waitFor(() => {
			expect(readState()).toContain("mode:audio-master");
		});
		expect(play).not.toHaveBeenCalled();
		expect(previewAudioEngine.play).not.toHaveBeenCalled();
		expect(readState()).toContain("playing:false");
	});

	it("keeps the sync fixture click and flash aligned through play, pause, seek, and frame-step", async () => {
		const syncFixture = syncFlashClickFixture();
		const [firstEvent, secondEvent] = syncFixture.expected.syncEventsUs ?? [];
		const { frameCallbacks, requestAnimationFrame } =
			stubPreviewAnimationFrames();
		const previewAudioEngine = createPreviewAudioEngineSpy();

		if (!firstEvent || !secondEvent) {
			throw new Error(
				"Expected the sync fixture to define at least two events.",
			);
		}

		render(
			<NativePreviewTransportProbe
				durationUs={syncFixture.expected.durationUs}
				previewAudioEngine={previewAudioEngine}
				seekTargetUs={secondEvent.audioClickUs}
				selection={syncFixture.selections.full}
			/>,
		);

		const video = screen.getByLabelText("Preview video") as HTMLVideoElement;

		fireEvent.click(screen.getByRole("button", { name: "Toggle playback" }));
		await waitFor(() => {
			expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
		});

		video.currentTime = 0;
		previewAudioEngine.setCurrentTimeSeconds(firstEvent.audioClickUs / 1_000_000);
		runNextPreviewFrame(frameCallbacks);

		expect(video.currentTime).toBe(firstEvent.visualFlashUs / 1_000_000);
		expect(readState()).toContain(`playhead:${firstEvent.audioClickUs}`);

		fireEvent.click(screen.getByRole("button", { name: "Toggle playback" }));
		expect(readState()).toContain("playing:false");

		video.currentTime = 0;
		fireEvent.seeked(video);

		expect(video.currentTime).toBe(firstEvent.visualFlashUs / 1_000_000);
		expect(readState()).toContain(`playhead:${firstEvent.audioClickUs}`);

		previewAudioEngine.setTime.mockClear();
		fireEvent.click(screen.getByRole("button", { name: "Seek to sync event" }));

		expect(video.currentTime).toBe(secondEvent.visualFlashUs / 1_000_000);
		expect(previewAudioEngine.setTime).toHaveBeenCalledWith(
			secondEvent.audioClickUs / 1_000_000,
		);
		expect(readState()).toContain(`playhead:${secondEvent.audioClickUs}`);

		fireEvent.click(screen.getByRole("button", { name: "Step forward" }));

		expect(video.currentTime).toBeCloseTo(
			(secondEvent.visualFlashUs + 33_333) / 1_000_000,
			5,
		);
		expect(previewAudioEngine.setTime).toHaveBeenLastCalledWith(
			(secondEvent.audioClickUs + 33_333) / 1_000_000,
		);
		expect(readState()).toContain(
			`playhead:${secondEvent.audioClickUs + 33333}`,
		);
	});

	it("loops only after playback enters the selection", async () => {
		const { frameCallbacks, requestAnimationFrame } =
			stubPreviewAnimationFrames();

		render(
			<NativePreviewTransportProbe
				previewClockMode="native-video"
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

	it("loops audio-master playback from the selection end using the audio clock", async () => {
		const { frameCallbacks, requestAnimationFrame } =
			stubPreviewAnimationFrames();
		const previewAudioEngine = createPreviewAudioEngineSpy({
			currentTimeSeconds: 2,
		});

		render(
			<NativePreviewTransportProbe
				previewAudioEngine={previewAudioEngine}
				selection={{ endUs: 8_000_000, startUs: 4_000_000 }}
			/>,
		);

		const video = screen.getByLabelText("Preview video") as HTMLVideoElement;

		fireEvent.click(screen.getByRole("button", { name: "Toggle loop" }));
		video.currentTime = 8.5;
		fireEvent.click(screen.getByRole("button", { name: "Toggle playback" }));

		await waitFor(() => {
			expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
		});
		previewAudioEngine.setTime.mockClear();

		runNextPreviewFrame(frameCallbacks);
		expect(video.currentTime).toBe(2);
		expect(readState()).toContain("playhead:2000000");

		previewAudioEngine.setCurrentTimeSeconds(4.5);
		runNextPreviewFrame(frameCallbacks);
		expect(video.currentTime).toBe(4.5);
		expect(readState()).toContain("playhead:4500000");

		previewAudioEngine.setCurrentTimeSeconds(8.2);
		runNextPreviewFrame(frameCallbacks);

		expect(previewAudioEngine.setTime).toHaveBeenCalledWith(4);
		expect(video.currentTime).toBe(4);
		expect(readState()).toContain("playhead:4000000");
		expect(readState()).toContain("playing:true");
	});

	it("loops the sync fixture selection by audio click and visual flash media time", async () => {
		const syncFixture = syncFlashClickFixture();
		const { frameCallbacks, requestAnimationFrame } =
			stubPreviewAnimationFrames();
		const previewAudioEngine = createPreviewAudioEngineSpy({
			currentTimeSeconds:
				syncFixture.selections.selectedRange.startUs / 1_000_000,
		});

		render(
			<NativePreviewTransportProbe
				durationUs={syncFixture.expected.durationUs}
				previewAudioEngine={previewAudioEngine}
				selection={syncFixture.selections.selectedRange}
			/>,
		);

		const video = screen.getByLabelText("Preview video") as HTMLVideoElement;

		fireEvent.click(screen.getByRole("button", { name: "Toggle loop" }));
		fireEvent.click(screen.getByRole("button", { name: "Toggle playback" }));

		await waitFor(() => {
			expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
		});
		previewAudioEngine.setTime.mockClear();

		video.currentTime = 0;
		previewAudioEngine.setCurrentTimeSeconds(7);
		runNextPreviewFrame(frameCallbacks);

		expect(video.currentTime).toBe(7);
		expect(readState()).toContain("playhead:7000000");

		previewAudioEngine.setCurrentTimeSeconds(8.2);
		runNextPreviewFrame(frameCallbacks);

		expect(previewAudioEngine.setTime).toHaveBeenCalledWith(
			syncFixture.selections.selectedRange.startUs / 1_000_000,
		);
		expect(video.currentTime).toBe(
			syncFixture.selections.selectedRange.startUs / 1_000_000,
		);
		expect(readState()).toContain(
			`playhead:${syncFixture.selections.selectedRange.startUs}`,
		);
	});

	it("stops audio-master playback when the audio clock reaches media end", async () => {
		const { frameCallbacks, requestAnimationFrame } =
			stubPreviewAnimationFrames();
		const previewAudioEngine = createPreviewAudioEngineSpy({
			currentTimeSeconds: 3,
		});

		render(<NativePreviewTransportProbe previewAudioEngine={previewAudioEngine} />);

		const video = screen.getByLabelText("Preview video") as HTMLVideoElement;

		fireEvent.click(screen.getByRole("button", { name: "Toggle playback" }));
		await waitFor(() => {
			expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
		});
		pause.mockClear();
		previewAudioEngine.pause.mockClear();

		video.currentTime = 10;
		previewAudioEngine.setCurrentTimeSeconds(12.4);
		runNextPreviewFrame(frameCallbacks);

		expect(previewAudioEngine.pause).toHaveBeenCalledTimes(1);
		expect(pause).toHaveBeenCalledTimes(1);
		expect(video.currentTime).toBe(12);
		expect(readState()).toContain("playhead:12000000");
		expect(readState()).toContain("playing:false");
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
	durationUs = 12_000_000,
	frameDurationUs = 33_333,
	previewAudioEngine = createPreviewAudioEngineSpy(),
	onTransport,
	previewClockMode = "audio-master",
	seekTargetUs = 2_000_000,
	selection = { endUs: 12_000_000, startUs: 0 },
	source = previewSource,
}: {
	durationUs?: number;
	frameDurationUs?: number;
	previewAudioEngine?: ReturnType<typeof createPreviewAudioEngineSpy>;
	onTransport?: (
		transport: ReturnType<typeof useNativePreviewTransport>,
	) => void;
	previewClockMode?: "audio-master" | "audio-master-pending" | "native-video";
	seekTargetUs?: number;
	selection?: Selection;
	source?: Blob;
}) {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const previewAudioEngineRef = useRef<PreviewAudioEngine | null>(
		previewAudioEngine as unknown as PreviewAudioEngine,
	);
	const transport = useNativePreviewTransport({
		durationUs,
		frameDurationUs,
		previewAudioEngineRef,
		previewClockMode,
		selection,
		source,
		videoRef,
	});
	onTransport?.(transport);

	return (
		<div>
			<video
				aria-label="Preview video"
				onEnded={transport.handleEnded}
				onPause={transport.handleNativePause}
				onPlay={transport.handleNativePlay}
				onSeeked={() => transport.syncPlayheadWithNativeVideo()}
				onTimeUpdate={() => transport.syncPlayheadWithNativeVideo()}
				ref={videoRef}
			>
				<track kind="captions" />
			</video>
			<output aria-label="transport state">
				{[
					`playing:${transport.isPlaying}`,
					`muted:${transport.muted}`,
					`mode:${transport.previewClockMode}`,
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
			<button onClick={() => transport.seekToUs(seekTargetUs)} type="button">
				Seek to sync event
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

function createPreviewAudioEngineSpy({
	currentTimeSeconds = 0,
	setTimeUpdatesCurrentTime = false,
}: {
	currentTimeSeconds?: number;
	setTimeUpdatesCurrentTime?: boolean;
} = {}) {
	let currentTime = currentTimeSeconds;

	return {
		getCurrentTime: vi.fn(() => currentTime),
		pause: vi.fn(),
		play: vi.fn(),
		setOutputGain: vi.fn(),
		setPlaybackRate: vi.fn(),
		setCurrentTimeSeconds(nextCurrentTimeSeconds: number) {
			currentTime = nextCurrentTimeSeconds;
		},
		setTime: vi.fn((nextCurrentTimeSeconds: number) => {
			if (setTimeUpdatesCurrentTime) {
				currentTime = nextCurrentTimeSeconds;
			}
		}),
		setTrackChannelMode: vi.fn(),
		setTrackGain: vi.fn(),
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

function runNextPreviewFrame(
	frameCallbacks: FrameRequestCallback[],
	timestampMs = 16,
) {
	act(() => {
		frameCallbacks.shift()?.(timestampMs);
	});
}

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});

	return {
		promise,
		reject,
		resolve,
	};
}

function syncFlashClickFixture() {
	const fixture = EXPORT_CORRECTNESS_FIXTURES.find(
		(candidate) => candidate.id === "mp4-sync-flash-click",
	);

	if (!fixture) {
		throw new Error("Expected the sync flash/click fixture to be registered.");
	}

	return fixture;
}

const previewSource = new File(["video"], "clip.mp4", { type: "video/mp4" });
const defaultSelection = { endUs: 12_000_000, startUs: 0 } satisfies Selection;
