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
import type {
	PreviewAudioEngine,
	PreviewAudioEngineMeterSnapshot,
	PreviewAudioPlaybackState,
} from "../../audio/types/preview-audio-engine.types";
import { useNativePreviewTransport } from "../transport/use-native-preview-transport";
import { stubNativeMediaPlayback } from "./native-media-playback-fixture";

const play = vi.fn().mockResolvedValue(undefined);
const pause = vi.fn();
let nativePaused: WeakMap<HTMLMediaElement, boolean>;

beforeEach(() => {
	nativePaused = stubNativeMediaPlayback(play, pause);
	play.mockReset().mockResolvedValue(undefined);
	pause.mockClear();
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("useNativePreviewTransport", () => {
	it("resumes the paused audio window even when the native video follower drifted", async () => {
		const engine = createPreviewAudioEngineSpy({
			setTimeUpdatesCurrentTime: true,
		});
		const { container } = render(
			<NativePreviewTransportProbe previewAudioEngine={engine} />,
		);
		const toggle = screen.getByText("Toggle playback");
		fireEvent.click(toggle);
		await waitFor(() => expect(readState()).toContain("playing:true"));
		engine.setCurrentTimeSeconds(1.2);
		fireEvent.click(toggle);
		const video = container.querySelector("video");
		if (!video) throw new Error("Expected the Preview follower.");
		video.currentTime = 1.17;
		engine.setTime.mockClear();
		fireEvent.click(toggle);
		await waitFor(() => expect(readState()).toContain("playing:true"));
		expect(engine.getCurrentTime()).toBe(1.2);
		expect(engine.setTime).not.toHaveBeenCalled();
	});

	it("ignores keyboard Play when the audio context is closed", async () => {
		const engine = createPreviewAudioEngineSpy();
		render(<NativePreviewTransportProbe previewAudioEngine={engine} />);
		act(() => engine.setPlaybackState("closed"));
		fireEvent.click(screen.getByText("Toggle playback"));
		expect(readState()).toContain("requested:false");
		expect(engine.play).not.toHaveBeenCalled();
		expect(engine.setTime).not.toHaveBeenCalled();
	});

	it("pause cancels interruption intent and a pending follower play cannot restart video", async () => {
		const engine = createPreviewAudioEngineSpy();
		const started = createDeferred<void>();
		play.mockReturnValueOnce(started.promise);
		render(<NativePreviewTransportProbe previewAudioEngine={engine} />);
		fireEvent.click(screen.getByText("Toggle playback"));
		await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
		act(() => engine.setPlaybackState("recovery-required"));
		fireEvent.click(screen.getByText("Toggle playback"));
		expect(readState()).toContain("requested:false");
		expect(engine.pause).toHaveBeenCalled();
		await act(async () => started.resolve());
		expect(readState()).toContain("playing:false");
		act(() => engine.setPlaybackState("paused"));
		expect(play).toHaveBeenCalledTimes(1);
	});

	it("keeps paused audio-master state tied to the visible video frame when no explicit seek is pending", async () => {
		const { frameCallbacks, requestAnimationFrame } =
			stubPreviewAnimationFrames();
		const previewAudioEngine = createPreviewAudioEngineSpy({
			currentTimeSeconds: 0,
			setTimeUpdatesCurrentTime: true,
		});

		render(
			<NativePreviewTransportProbe previewAudioEngine={previewAudioEngine} />,
		);

		const video = screen.getByLabelText("Preview video") as HTMLVideoElement;
		const currentTimeWrites = trackVideoCurrentTimeWrites(video);

		fireEvent.click(screen.getByRole("button", { name: "Toggle playback" }));
		await waitFor(() => {
			expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
		});

		previewAudioEngine.setCurrentTimeSeconds(5);
		currentTimeWrites.setNativeCurrentTime(5);
		runNextPreviewFrame(frameCallbacks, 250);

		fireEvent.click(screen.getByRole("button", { name: "Toggle playback" }));
		currentTimeWrites.clear();
		currentTimeWrites.setNativeCurrentTime(5.08);
		fireEvent.timeUpdate(video);

		expect(currentTimeWrites.values()).toEqual([]);
		expect(readState()).toContain("playhead:5080000");
	});

	it("does not let a stale visible frame override an explicit paused timeline seek", async () => {
		const { requestAnimationFrame } = stubPreviewAnimationFrames();
		const previewAudioEngine = createPreviewAudioEngineSpy({
			currentTimeSeconds: 0,
			setTimeUpdatesCurrentTime: true,
		});

		render(
			<NativePreviewTransportProbe previewAudioEngine={previewAudioEngine} />,
		);

		const video = screen.getByLabelText("Preview video") as HTMLVideoElement;
		const currentTimeWrites = trackVideoCurrentTimeWrites(video, {
			applyWrites: false,
		});

		currentTimeWrites.setNativeCurrentTime(2);
		fireEvent.click(screen.getByRole("button", { name: "Seek forward" }));
		expect(currentTimeWrites.values()).toEqual([10]);
		expect(readState()).toContain("playhead:10000000");
		previewAudioEngine.setTime.mockClear();

		fireEvent.click(screen.getByRole("button", { name: "Toggle playback" }));

		await waitFor(() => {
			expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
		});
		expect(previewAudioEngine.setTime).toHaveBeenCalledWith(10);
		expect(previewAudioEngine.getCurrentTime()).toBe(10);
	});

	it("does not hard-resync a visual follower while the media element is still seeking", async () => {
		const { frameCallbacks, requestAnimationFrame } =
			stubPreviewAnimationFrames();
		const previewAudioEngine = createPreviewAudioEngineSpy({
			currentTimeSeconds: 0,
			setTimeUpdatesCurrentTime: true,
		});

		render(
			<NativePreviewTransportProbe previewAudioEngine={previewAudioEngine} />,
		);

		const video = screen.getByLabelText("Preview video") as HTMLVideoElement;
		const currentTimeWrites = trackVideoCurrentTimeWrites(video, {
			applyWrites: false,
		});

		fireEvent.click(screen.getByRole("button", { name: "Toggle playback" }));
		await waitFor(() => {
			expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
		});

		fireEvent.click(screen.getByRole("button", { name: "Seek forward" }));
		currentTimeWrites.setSeeking(true);
		currentTimeWrites.clear();

		previewAudioEngine.setCurrentTimeSeconds(10.3);
		runNextPreviewFrame(frameCallbacks, 300);
		previewAudioEngine.setCurrentTimeSeconds(10.6);
		runNextPreviewFrame(frameCallbacks, 600);

		expect(currentTimeWrites.values()).toEqual([]);
	});

	it("lets a starved MSE follower continue in decode order and brings audio back when it plays", async () => {
		const previewAudioEngine = createPreviewAudioEngineSpy({
			currentTimeSeconds: 0,
			setTimeUpdatesCurrentTime: true,
		});
		const canResyncTo = vi.fn(() => false);
		render(
			<NativePreviewTransportProbe
				canResyncTo={canResyncTo}
				previewAudioEngine={previewAudioEngine}
			/>,
		);
		const video = screen.getByLabelText("Preview video") as HTMLVideoElement;
		fireEvent.click(screen.getByRole("button", { name: "Toggle playback" }));
		await waitFor(() => expect(readState()).toContain("playing:true"));
		video.currentTime = 2;
		previewAudioEngine.setCurrentTimeSeconds(3);
		fireEvent.timeUpdate(video);
		expect(video.currentTime).toBe(2);

		fireEvent.waiting(video);
		expect(previewAudioEngine.getPlaybackState()).toBe("paused");
		expect(readState()).toContain("playhead:2000000");
		expect(video.paused).toBe(false);
		expect(readState()).toContain("requested:true");

		video.currentTime = 2.1;
		fireEvent.playing(video);
		await waitFor(() =>
			expect(previewAudioEngine.getPlaybackState()).toBe("playing"),
		);
		expect(previewAudioEngine.getCurrentTime()).toBe(2.1);
		expect(video.currentTime).toBe(2.1);
		expect(play).toHaveBeenCalledOnce();
	});

	it("keeps paused audio-master frame steps on the requested visual follower frame", () => {
		const previewAudioEngine = createPreviewAudioEngineSpy({
			currentTimeSeconds: 0,
		});

		render(
			<NativePreviewTransportProbe previewAudioEngine={previewAudioEngine} />,
		);

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
		stubPreviewAnimationFrames();
		const previewAudioEngine = createPreviewAudioEngineSpy({
			currentTimeSeconds: 3,
		});

		render(
			<NativePreviewTransportProbe previewAudioEngine={previewAudioEngine} />,
		);

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

		nativePaused.set(video, true);
		fireEvent.pause(video);
		expect(readState()).toContain("playing:false");

		nativePaused.set(video, false);
		fireEvent.play(video);
		expect(readState()).toContain("playing:false");
		expect(readState()).toContain("requested:true");
		fireEvent.playing(video);
		expect(readState()).toContain("playing:true");

		video.currentTime = 12;
		stubNativeEnd(video, 12);
		fireEvent.ended(video);
		expect(readState()).toContain("playing:false");
		expect(readState()).toContain("playhead:12000000");
	});

	it("uses the terminal native sample to enter and wrap a Selection at media end", async () => {
		render(
			<NativePreviewTransportProbe
				previewClockMode="native-video"
				selection={{ startUs: 11_900_000, endUs: 12_000_000 }}
			/>,
		);
		const video = screen.getByLabelText("Preview video") as HTMLVideoElement;
		stubNativeEnd(video, 12);
		video.currentTime = 11.5;
		fireEvent.click(screen.getByText("Toggle playback"));
		await waitFor(() => expect(readState()).toContain("playing:true"));
		fireEvent.click(screen.getByText("Toggle loop"));
		fireEvent.timeUpdate(video);
		expect(video.currentTime).toBe(11.5);

		video.currentTime = 12;
		fireEvent.pause(video);
		fireEvent.ended(video);

		expect(video.currentTime).toBe(11.9);
		expect(readState()).toContain("requested:true");
		expect(readState()).toContain("playhead:11900000");
		await waitFor(() => expect(play).toHaveBeenCalledTimes(2));
		fireEvent.ended(video);
		expect(play).toHaveBeenCalledTimes(2);
		expect(readState()).toContain("requested:true");
	});

	it("wraps from the audio clock while the native follower is still starting", async () => {
		const { frameCallbacks } = stubPreviewAnimationFrames();
		const followerPlay = createDeferred<void>();
		play.mockReturnValueOnce(followerPlay.promise);
		const engine = createPreviewAudioEngineSpy({
			setTimeUpdatesCurrentTime: true,
		});
		render(
			<NativePreviewTransportProbe
				previewAudioEngine={engine}
				selection={{ startUs: 11_900_000, endUs: 12_000_000 }}
			/>,
		);
		const video = screen.getByLabelText("Preview video") as HTMLVideoElement;
		video.currentTime = 11.5;
		fireEvent.click(screen.getByText("Toggle loop"));
		fireEvent.click(screen.getByText("Toggle playback"));
		await waitFor(() => expect(play).toHaveBeenCalledOnce());
		expect(readState()).toContain("playing:false");
		expect(engine.setPlaybackEnd).toHaveBeenLastCalledWith(12);

		engine.setCurrentTimeSeconds(12);
		runNextPreviewFrame(frameCallbacks);
		expect(engine.setTime).toHaveBeenLastCalledWith(11.9);
		expect(readState()).toContain("requested:true");
		await act(async () => followerPlay.resolve());
	});

	it.each([true])(
		"recovers near the end with Selection looping=%s",
		async (loop) => {
			const { frameCallbacks } = stubPreviewAnimationFrames();
			const engine = createPreviewAudioEngineSpy({
				setTimeUpdatesCurrentTime: true,
			});
			let transport: ReturnType<typeof useNativePreviewTransport>;
			render(
				<NativePreviewTransportProbe
					previewAudioEngine={engine}
					onTransport={(value) => {
						transport = value;
					}}
					selection={{ startUs: 4_000_000, endUs: 12_000_000 }}
				/>,
			);
			if (loop) fireEvent.click(screen.getByText("Toggle loop"));
			fireEvent.click(screen.getByText("Toggle playback"));
			await waitFor(() => expect(readState()).toContain("playing:true"));
			act(() => {
				engine.setCurrentTimeSeconds(11.9);
				engine.setPlaybackState("interrupted");
			});
			expect(readState()).toContain("playing:false");
			act(() => engine.setPlaybackState("buffering"));
			act(() => engine.setPlaybackState("playing"));
			await waitFor(() => expect(readState()).toContain("playing:true"));
			act(() => {
				engine.setCurrentTimeSeconds(12);
				transport.syncPlayheadWithNativeVideo();
			});
			if (loop) {
				expect(engine.setTime).toHaveBeenLastCalledWith(4);
				expect(readState()).toContain("requested:true");
				act(() => engine.setPlaybackState("buffering"));
				act(() => engine.setPlaybackState("playing"));
				await waitFor(() => expect(readState()).toContain("playing:true"));
				engine.setTime.mockClear();
				act(() => transport.syncPlayheadWithNativeVideo());
				expect(engine.setTime).not.toHaveBeenCalled();
			} else {
				expect(readState()).toContain("requested:false");
				expect(readState()).toContain("playing:false");
				expect(engine.getCurrentTime()).toBe(12);
			}
			expect(frameCallbacks).toHaveLength(loop ? 1 : 0);
		},
	);
});

function NativePreviewTransportProbe({
	canResyncTo,
	durationUs = 12_000_000,
	frameDurationUs = 33_333,
	previewAudioEngine = createPreviewAudioEngineSpy(),
	onTransport,
	previewClockMode = "audio-master",
	seekTargetUs = 2_000_000,
	selection = defaultSelection,
	source = previewSource,
}: {
	canResyncTo?: (time: number) => boolean;
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
		canResyncTo,
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
				onPlaying={transport.handleNativePlaying}
				onWaiting={transport.handleNativeWaiting}
				onSeeked={() => transport.syncPlayheadWithNativeVideo()}
				onTimeUpdate={() => transport.syncPlayheadWithNativeVideo()}
				ref={videoRef}
			>
				<track kind="captions" />
			</video>
			<output aria-label="transport state">
				{[
					`playing:${transport.isPlaying}`,
					`requested:${transport.playbackRequested}`,
					`audio:${transport.audioPlaybackState}`,
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
			<button onClick={() => void transport.recoverAudio()} type="button">
				Recover audio
			</button>
			<button onClick={() => transport.seekByUs(10_000_000)} type="button">
				Seek forward
			</button>
			<button onClick={() => transport.seekToUs(seekTargetUs)} type="button">
				Seek to sync event
			</button>
			<button
				onClick={() => transport.previewScrubToUs(seekTargetUs)}
				type="button"
			>
				Preview scrub
			</button>
			<button
				onClick={() => transport.previewScrubToUs(seekTargetUs + 1_000_000)}
				type="button"
			>
				Preview scrub ahead
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
	let state: PreviewAudioPlaybackState = "paused";
	const listeners = new Set<() => void>();
	const setPlaybackState = (next: PreviewAudioPlaybackState) => {
		state = next;
		for (const listener of listeners) listener();
	};
	return {
		getPlaybackState: () => state,
		setPlaybackState,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		getCurrentTime: vi.fn(() => currentTime),
		getPresentationTime: vi.fn(() => currentTime),
		pause: vi.fn(() => setPlaybackState("paused")),
		play: vi.fn(async () => setPlaybackState("playing")),
		readMeterSnapshot: vi.fn(() => emptyMeterSnapshot),
		setOutputGain: vi.fn(),
		setPlaybackEnd: vi.fn(),
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

const emptyMeterSnapshot: PreviewAudioEngineMeterSnapshot = {
	combinedState: {
		channels: [],
		partial: false,
		status: "ready",
	},
	trackStates: {},
};

function stubPreviewAnimationFrames() {
	const frameCallbacks: FrameRequestCallback[] = [];
	const pendingCallbacks = new Map<number, FrameRequestCallback>();
	let nextFrameId = 0;
	const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
		const frameId = ++nextFrameId;
		const pendingCallback: FrameRequestCallback = (timestampMs) => {
			pendingCallbacks.delete(frameId);
			callback(timestampMs);
		};
		pendingCallbacks.set(frameId, pendingCallback);
		frameCallbacks.push(pendingCallback);
		return frameId;
	});
	const cancelAnimationFrame = vi.fn((frameId: number) => {
		const callback = pendingCallbacks.get(frameId);
		if (!callback) return;
		pendingCallbacks.delete(frameId);
		const index = frameCallbacks.indexOf(callback);
		if (index !== -1) frameCallbacks.splice(index, 1);
	});
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

function trackVideoCurrentTimeWrites(
	video: HTMLVideoElement,
	{ applyWrites = true }: { applyWrites?: boolean } = {},
) {
	let currentTime = video.currentTime;
	let seeking = false;
	const writes: number[] = [];

	Object.defineProperty(video, "currentTime", {
		configurable: true,
		get: () => currentTime,
		set: (nextCurrentTime: number) => {
			if (applyWrites) {
				currentTime = nextCurrentTime;
			}
			writes.push(nextCurrentTime);
		},
	});
	Object.defineProperty(video, "seeking", {
		configurable: true,
		get: () => seeking,
	});

	return {
		clear() {
			writes.length = 0;
		},
		setSeeking(nextSeeking: boolean) {
			seeking = nextSeeking;
		},
		setNativeCurrentTime(nextCurrentTime: number) {
			currentTime = nextCurrentTime;
		},
		values() {
			return [...writes];
		},
	};
}

function stubNativeEnd(video: HTMLVideoElement, durationSeconds: number) {
	Object.defineProperty(video, "ended", {
		configurable: true,
		get: () => video.currentTime >= durationSeconds,
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

const previewSource = new File(["video"], "clip.mp4", { type: "video/mp4" });
const defaultSelection = { endUs: 12_000_000, startUs: 0 } satisfies Selection;
