/* @vitest-environment jsdom */

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReadyMediaAsset, Selection } from "@/editor-core/model";

import {
	NativePreviewPlayer,
	isPreviewShortcutSuppressed,
} from "./native-preview-player";

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

	it("suppresses shortcuts while typing or when shortcut dispatch is disabled", () => {
		const input = document.createElement("input");
		const dialog = document.createElement("div");
		dialog.setAttribute("role", "dialog");
		document.body.append(input);

		expect(
			isPreviewShortcutSuppressed({
				event: new KeyboardEvent("keydown", { key: " " }),
				shortcutsDisabled: true,
			}),
		).toBe(true);

		input.focus();

		expect(
			isPreviewShortcutSuppressed({
				event: new KeyboardEvent("keydown", { key: " " }),
				shortcutsDisabled: false,
			}),
		).toBe(true);

		input.blur();
		document.body.append(dialog);

		expect(
			isPreviewShortcutSuppressed({
				event: new KeyboardEvent("keydown", { key: " " }),
				shortcutsDisabled: false,
			}),
		).toBe(true);

		dialog.remove();
		input.remove();
	});
});

const previewSource = new File(["video"], "clip.mp4", { type: "video/mp4" });

function renderPlayer(
	props: Partial<React.ComponentProps<typeof NativePreviewPlayer>> = {},
) {
	return render(
		<NativePreviewPlayer
			asset={readyAsset}
			onSelectionEndRequested={() => {}}
			onSelectionRangeMoveRequested={() => {}}
			onSelectionResetRequested={() => {}}
			onSelectionStartRequested={() => {}}
			selection={selection}
			source={previewSource}
			{...props}
		/>,
	);
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
