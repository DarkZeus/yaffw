/* @vitest-environment jsdom */

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReadyMediaAsset, Selection } from "@/editor-core/model";

import { NativePreviewPlayer } from "./native-preview-player";

const createObjectURL = vi.fn(() => "blob:preview-source");
const revokeObjectURL = vi.fn();
const play = vi.fn().mockResolvedValue(undefined);
const pause = vi.fn();

beforeEach(() => {
	vi.stubGlobal("URL", {
		createObjectURL,
		revokeObjectURL,
	});
	Object.defineProperty(HTMLMediaElement.prototype, "play", {
		configurable: true,
		value: play,
	});
	Object.defineProperty(HTMLMediaElement.prototype, "pause", {
		configurable: true,
		value: pause,
	});
	createObjectURL.mockClear();
	revokeObjectURL.mockClear();
	play.mockClear();
	pause.mockClear();
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("NativePreviewPlayer", () => {
	it("owns the preview object URL and native video element lifecycle", () => {
		const { unmount } = renderPlayer();

		const video = screen.getByLabelText("Preview for clip.mp4");

		expect(createObjectURL).toHaveBeenCalledWith(previewSource);
		expect(video).toBeInstanceOf(HTMLVideoElement);
		expect(video.getAttribute("src")).toBe("blob:preview-source");

		unmount();

		expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview-source");
	});

	it("renders preview and transport as separate workbench chrome regions", async () => {
		const getBoundingClientRect = vi
			.spyOn(HTMLElement.prototype, "getBoundingClientRect")
			.mockImplementation(function getElementRect(this: HTMLElement) {
				if (this.getAttribute("aria-label") === "Preview viewer surface") {
					return createTestDomRect({ height: 300, width: 900 });
				}

				return createTestDomRect({ height: 0, width: 0 });
			});

		try {
			renderPlayer();

			const centerRegion = screen.getByLabelText("Workbench center region");
			const nativePreview = within(centerRegion).getByLabelText(
				"Native preview player",
			);
			const viewerHeader = within(nativePreview).getByLabelText(
				"Preview viewer header",
			);
			const viewerSurface = within(nativePreview).getByLabelText(
				"Preview viewer surface",
			);
			const aperture = within(viewerSurface).getByLabelText("Preview aperture");
			const transportRegion = screen.getByLabelText(
				"Workbench transport region",
			);
			const transportControls = within(transportRegion).getByLabelText(
				"Preview transport controls",
			);
			const primaryControls = within(transportControls).getByLabelText(
				"Primary preview controls",
			);
			const mediaTimeReadouts = within(transportControls).getByLabelText(
				"Preview media-time readouts",
			);
			const playbackSettings = within(transportControls).getByLabelText(
				"Preview playback settings",
			);

			expect(centerRegion.className).toContain("bg-workbench-viewer");
			expect(viewerHeader.className).toContain("border-workbench-border");
			expect(viewerHeader.textContent).not.toContain("clip.mp4");
			expect(
				within(viewerHeader).getByText("Program viewer").parentElement
					?.className,
			).toContain("whitespace-nowrap");
			expect(viewerSurface.className).toContain("bg-workbench-viewer");
			expect(aperture.className).toContain("border-workbench-border-strong");
			expect(aperture.className).toContain("max-h-full");
			expect(aperture.style.aspectRatio).toBe(String(16 / 9));
			await waitFor(() => {
				expect(aperture.style.width).toBe("533.333333px");
				expect(aperture.style.height).toBe("300px");
			});
			expect(
				within(aperture).getByLabelText("Preview for clip.mp4").className,
			).toContain("object-contain");
			expect(
				within(aperture).getByLabelText("Preview for clip.mp4").className,
			).not.toContain("object-cover");
			expect(transportRegion.className).toContain("bg-workbench-transport");
			expect(transportControls.className).toContain("grid");
			expect(primaryControls.className).toContain("justify-center");
			expect(
				within(primaryControls)
					.getByRole("button", { name: "Loop selection" })
					.getAttribute("aria-pressed"),
			).toBe("false");
			expect(mediaTimeReadouts.className).toContain("font-mono");
			expect(playbackSettings.className).toContain("justify-end");
			expect(
				within(centerRegion).queryByLabelText("Preview transport controls"),
			).toBeNull();
			expect(
				within(viewerHeader).getByRole("button", {
					name: "Open fullscreen preview",
				}),
			).toBeTruthy();
		} finally {
			getBoundingClientRect.mockRestore();
		}
	});

	it("drives play, pause, seek, speed, volume, mute, and frame-step through native video commands", async () => {
		renderPlayer();

		const video = screen.getByLabelText(
			"Preview for clip.mp4",
		) as HTMLVideoElement;

		fireEvent.click(screen.getByRole("button", { name: "Play" }));
		await waitFor(() => {
			expect(play).toHaveBeenCalledTimes(1);
		});

		fireEvent.click(screen.getByRole("button", { name: "Pause" }));
		expect(pause).toHaveBeenCalledTimes(1);

		fireEvent.click(
			screen.getByRole("button", { name: "Seek forward 10 seconds" }),
		);
		expect(video.currentTime).toBe(10);

		fireEvent.click(
			screen.getByRole("button", { name: "Step forward one frame" }),
		);
		expect(video.currentTime).toBeCloseTo(10.033333, 5);

		fireEvent.click(
			screen.getByRole("button", { name: "Seek backward 1 second" }),
		);
		expect(video.currentTime).toBeCloseTo(9.033333, 5);

		fireEvent.change(screen.getByLabelText("Playback speed"), {
			target: { value: "1.5" },
		});
		expect(video.playbackRate).toBe(1.5);

		fireEvent.change(screen.getByLabelText("Preview volume"), {
			target: { value: "25" },
		});
		expect(video.volume).toBe(0.25);

		fireEvent.click(screen.getByRole("button", { name: "Mute preview audio" }));
		expect(video.muted).toBe(true);
	});

	it("keeps Playhead seek, Selection commit, and Selection range move channels separate in the lower region", () => {
		const onSelectionEndRequested = vi.fn();
		const onSelectionRangeMoveRequested = vi.fn();
		const onSelectionStartRequested = vi.fn();
		const getBoundingClientRect = vi
			.spyOn(HTMLElement.prototype, "getBoundingClientRect")
			.mockImplementation(function getElementRect(this: HTMLElement) {
				if (this.dataset.testid === "selection-timeline-track") {
					return createTestDomRect({ height: 80, width: 1200 });
				}

				return createTestDomRect({ height: 0, width: 0 });
			});

		try {
			renderPlayer({
				onSelectionEndRequested,
				onSelectionRangeMoveRequested,
				onSelectionStartRequested,
				selection: {
					endUs: 8_000_000,
					startUs: 2_000_000,
				},
			});

			const video = screen.getByLabelText(
				"Preview for clip.mp4",
			) as HTMLVideoElement;

			fireEvent.mouseDown(screen.getByLabelText("Seek timeline ruler"), {
				clientX: 600,
			});
			expect(video.currentTime).toBe(6);
			expect(onSelectionStartRequested).not.toHaveBeenCalled();
			expect(onSelectionEndRequested).not.toHaveBeenCalled();
			expect(onSelectionRangeMoveRequested).not.toHaveBeenCalled();

			fireEvent.mouseDown(screen.getByLabelText("Selection start handle"), {
				clientX: 200,
			});
			fireEvent.mouseUp(window, { clientX: 300 });
			expect(video.currentTime).toBe(3);
			expect(onSelectionStartRequested).toHaveBeenCalledWith(3_000_000);
			expect(onSelectionEndRequested).not.toHaveBeenCalled();
			expect(onSelectionRangeMoveRequested).not.toHaveBeenCalled();

			fireEvent.mouseDown(screen.getByLabelText("Selection end handle"), {
				clientX: 800,
			});
			fireEvent.mouseUp(window, { clientX: 900 });
			expect(video.currentTime).toBe(9);
			expect(onSelectionEndRequested).toHaveBeenCalledWith(9_000_000);
			expect(onSelectionRangeMoveRequested).not.toHaveBeenCalled();

			fireEvent.mouseDown(screen.getByLabelText("Move selection range"), {
				clientX: 200,
			});
			fireEvent.mouseUp(window, { clientX: 500 });
			expect(onSelectionRangeMoveRequested).toHaveBeenCalledWith(3_000_000);
		} finally {
			getBoundingClientRect.mockRestore();
		}
	});

	it("loops inside the selection only after playback enters the selected range", async () => {
		const { frameCallbacks, requestAnimationFrame } =
			stubPreviewAnimationFrames();
		renderPlayer({
			selection: {
				endUs: 8_000_000,
				startUs: 4_000_000,
			},
		});

		const video = screen.getByLabelText(
			"Preview for clip.mp4",
		) as HTMLVideoElement;
		const loopButton = screen.getByRole("button", {
			name: "Loop selection",
		});

		expect(loopButton.getAttribute("aria-pressed")).toBe("false");
		fireEvent.click(loopButton);
		expect(loopButton.getAttribute("aria-pressed")).toBe("true");

		video.currentTime = 2;
		fireEvent.click(screen.getByRole("button", { name: "Play" }));

		await waitFor(() => {
			expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
		});
		runNextPreviewFrame(frameCallbacks);
		expect(video.currentTime).toBe(2);
		expect(screen.getByLabelText("Preview playhead time").textContent).toBe(
			"00:00:02.000",
		);

		video.currentTime = 4.5;
		runNextPreviewFrame(frameCallbacks);
		expect(video.currentTime).toBe(4.5);

		video.currentTime = 8.1;
		runNextPreviewFrame(frameCallbacks);
		expect(video.currentTime).toBe(4);
		expect(screen.getByLabelText("Preview playhead time").textContent).toBe(
			"00:00:04.000",
		);
	});

	it("does not jump backward when playback starts after the selection", async () => {
		const { frameCallbacks, requestAnimationFrame } =
			stubPreviewAnimationFrames();
		renderPlayer({
			selection: {
				endUs: 8_000_000,
				startUs: 4_000_000,
			},
		});

		const video = screen.getByLabelText(
			"Preview for clip.mp4",
		) as HTMLVideoElement;

		fireEvent.click(screen.getByRole("button", { name: "Loop selection" }));
		fireEvent.click(
			screen.getByRole("button", { name: "Seek forward 10 seconds" }),
		);
		expect(video.currentTime).toBe(10);
		fireEvent.click(screen.getByRole("button", { name: "Play" }));

		await waitFor(() => {
			expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
		});
		runNextPreviewFrame(frameCallbacks);

		expect(video.currentTime).toBe(10);

		video.currentTime = 12;
		fireEvent.ended(video);

		expect(video.currentTime).toBe(12);
		expect(play).toHaveBeenCalledTimes(1);
		expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
	});

	it("re-evaluates loop entry when the selection changes", async () => {
		const { frameCallbacks, requestAnimationFrame } =
			stubPreviewAnimationFrames();
		const view = renderPlayer({
			selection: {
				endUs: 8_000_000,
				startUs: 4_000_000,
			},
		});

		const video = screen.getByLabelText(
			"Preview for clip.mp4",
		) as HTMLVideoElement;

		fireEvent.click(screen.getByRole("button", { name: "Loop selection" }));
		video.currentTime = 4.5;
		fireEvent.click(screen.getByRole("button", { name: "Play" }));

		await waitFor(() => {
			expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
		});
		runNextPreviewFrame(frameCallbacks);
		expect(video.currentTime).toBe(4.5);

		view.rerender(
			createPlayerElement({
				selection: {
					endUs: 11_000_000,
					startUs: 9_000_000,
				},
			}),
		);
		expect(
			screen
				.getByRole("button", { name: "Loop selection" })
				.getAttribute("aria-pressed"),
		).toBe("true");

		video.currentTime = 8.5;
		runNextPreviewFrame(frameCallbacks);
		expect(video.currentTime).toBe(8.5);

		video.currentTime = 11.2;
		runNextPreviewFrame(frameCallbacks);
		expect(video.currentTime).toBe(9);
	});

	it("resets selection loop for each preview source", async () => {
		const nextSource = new File(["next video"], "next.mp4", {
			type: "video/mp4",
		});
		const view = renderPlayer();

		fireEvent.click(screen.getByRole("button", { name: "Loop selection" }));
		expect(
			screen
				.getByRole("button", { name: "Loop selection" })
				.getAttribute("aria-pressed"),
		).toBe("true");

		view.rerender(createPlayerElement({ source: nextSource }));

		await waitFor(() => {
			expect(
				screen
					.getByRole("button", { name: "Loop selection" })
					.getAttribute("aria-pressed"),
			).toBe("false");
		});
		expect(createObjectURL).toHaveBeenCalledWith(nextSource);
	});

	it("samples the native video clock on animation frames while playing", async () => {
		const { frameCallbacks, requestAnimationFrame } =
			stubPreviewAnimationFrames();

		renderPlayer();

		const video = screen.getByLabelText(
			"Preview for clip.mp4",
		) as HTMLVideoElement;

		fireEvent.click(screen.getByRole("button", { name: "Play" }));

		await waitFor(() => {
			expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
		});
		expect(screen.getByLabelText("Playhead handle").className).toContain(
			"transition-none",
		);

		video.currentTime = 1.25;
		runNextPreviewFrame(frameCallbacks);

		expect(screen.getByLabelText("Preview playhead time").textContent).toBe(
			"00:00:01.250",
		);
		expect(screen.getAllByText("00:00:01.250").length).toBeGreaterThan(1);
		expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
	});

	it("requests fullscreen when the native video API is available", () => {
		const requestFullscreen = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(HTMLVideoElement.prototype, "requestFullscreen", {
			configurable: true,
			value: requestFullscreen,
		});

		renderPlayer();

		const fullscreenButton = screen.getByRole("button", {
			name: "Open fullscreen preview",
		});

		expect(fullscreenButton.hasAttribute("disabled")).toBe(false);
		fireEvent.click(fullscreenButton);

		expect(requestFullscreen).toHaveBeenCalledTimes(1);
	});

	it("dispatches page-level shortcuts without moving the playhead for bracket selection commands", async () => {
		const onSelectionStartRequested = vi.fn();
		const onSelectionEndRequested = vi.fn();
		renderPlayer({
			onSelectionEndRequested,
			onSelectionStartRequested,
		});

		const video = screen.getByLabelText(
			"Preview for clip.mp4",
		) as HTMLVideoElement;

		fireEvent.keyDown(window, { code: "KeyL", key: "l" });
		expect(video.currentTime).toBe(10);

		fireEvent.keyDown(window, { code: "BracketLeft", key: "[" });
		expect(onSelectionStartRequested).toHaveBeenCalledWith(10_000_000);
		expect(video.currentTime).toBe(10);

		fireEvent.keyDown(window, { code: "BracketRight", key: "]" });
		expect(onSelectionEndRequested).toHaveBeenCalledWith(10_000_000);

		fireEvent.keyDown(window, {
			code: "ArrowRight",
			key: "ArrowRight",
			shiftKey: true,
		});
		expect(video.currentTime).toBeCloseTo(10.033333, 5);
	});
});

const previewSource = new File(["video"], "clip.mp4", { type: "video/mp4" });

function renderPlayer(
	props: Partial<React.ComponentProps<typeof NativePreviewPlayer>> = {},
) {
	return render(createPlayerElement(props));
}

function createPlayerElement(
	props: Partial<React.ComponentProps<typeof NativePreviewPlayer>> = {},
) {
	return (
		<NativePreviewPlayer
			asset={readyAsset}
			onSelectionEndRequested={() => {}}
			onSelectionRangeMoveRequested={() => {}}
			onSelectionResetRequested={() => {}}
			onSelectionStartRequested={() => {}}
			selection={selection}
			source={previewSource}
			{...props}
		/>
	);
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

function createTestDomRect({
	height,
	width,
}: {
	height: number;
	width: number;
}): DOMRect {
	return {
		bottom: height,
		height,
		left: 0,
		right: width,
		toJSON: () => ({}),
		top: 0,
		width,
		x: 0,
		y: 0,
	} as DOMRect;
}

const readyAsset = {
	durationUs: 12_000_000,
	exportCapability: {
		profile: {
			audioCodec: "aac",
			container: "mp4",
			videoCodec: "h264",
		},
		supported: true,
	},
	frameTiming: {
		fps: 30,
		frameDurationUs: 33_333,
		source: "known",
	},
	id: "asset-1",
	label: "clip.mp4",
	provenance: {
		fileName: "clip.mp4",
		mimeType: "video/mp4",
		sizeBytes: 1_024,
	},
	tracks: {
		audio: [],
		video: [
			{
				id: "video-1",
				kind: "video",
			},
		],
	},
} satisfies ReadyMediaAsset;

const selection = {
	endUs: 12_000_000,
	startUs: 0,
} satisfies Selection;
