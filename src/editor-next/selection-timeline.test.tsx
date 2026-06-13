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

import { SelectionTimeline } from "./selection-timeline";

beforeEach(() => {
	mockTimelineGeometry();
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("SelectionTimeline", () => {
	it("loads every audio lane progressively, exposes unavailable lanes, and shows compact audio controls", async () => {
		renderTimeline({
			audioPreviewPreparingTrackIds: new Set(["audio-1"]),
			waveformLaneLoader: async ({ trackIndex }) =>
				trackIndex === 0
					? {
							samples: [0.2, 0.8, 0.5],
							status: "ready",
						}
					: {
							reason: "Decode failed",
							status: "unavailable",
						},
		});

		expect(screen.getByLabelText("Selection timeline")).toBeTruthy();
		expect(screen.getByText("Voice")).toBeTruthy();
		expect(screen.getByText("Game audio")).toBeTruthy();
		expect(screen.queryByText(/Language/)).toBeNull();
		expect(screen.getAllByText("AAC").length).toBeGreaterThan(0);
		expect(screen.getAllByText("2 channels").length).toBeGreaterThan(0);

		await waitFor(() => {
			expect(
				screen.getAllByText("Waveform generation failed").length,
			).toBeGreaterThan(0);
		});
		expect(screen.queryByText("Waveform ready")).toBeNull();
		expect(screen.getByLabelText("Voice waveform detail")).toBeTruthy();
		expect(screen.queryByLabelText("Move selection range")).toBeNull();
		expect(
			screen.getByTestId("waveform-lane-header-audio-1").nextElementSibling,
		).toBe(screen.getByLabelText("Seek Voice waveform lane"));
		expect(screen.queryByTestId("selection-range-outline")).toBeNull();
		expect(screen.getByLabelText("Playhead handle").className).toContain(
			"transition-[left]",
		);
		expect(screen.getByLabelText("Playhead handle").className).toContain(
			"ease-linear",
		);
		expect(screen.getByLabelText("Playhead handle").className).not.toContain(
			"ease-out",
		);
		expect(
			screen.getByRole("button", { name: "Keep playhead centered" }),
		).toBeTruthy();
		expect(screen.queryByTestId("selection-start-handle-rail")).toBeNull();
		expect(screen.queryByTestId("selection-end-handle-rail")).toBeNull();
		expect(screen.getByRole("button", { name: "Exclude Voice from mix" }));
		expect(screen.getByLabelText("Voice volume"));
		expect(screen.getByLabelText("Voice channel fix"));
		expect(screen.getByRole("button", { name: "Solo Voice" }));
		expect(screen.getByText("Preparing audio")).toBeTruthy();

		expect(screen.queryByText("Mute")).toBeNull();
		expect(screen.queryByText("Solo")).toBeNull();
		expect(screen.queryByText("Mono")).toBeNull();
	});

	it("centers the playhead in the horizontal scroll container when follow is enabled", async () => {
		renderTimeline({
			playheadUs: 6_000_000,
		});

		const scrollContainer = screen.getByTestId("selection-timeline-scroll");
		const scrollTo = mockTimelineScroll(scrollContainer, {
			clientWidth: 600,
			scrollWidth: 1200,
		});
		const followButton = screen.getByRole("button", {
			name: "Keep playhead centered",
		});

		expect(followButton.getAttribute("aria-pressed")).toBe("false");
		expect(followButton.className).toContain("bg-workbench-viewer");
		expect(followButton.className).not.toContain("bg-workbench-selected");

		fireEvent.click(followButton);

		expect(followButton.getAttribute("aria-pressed")).toBe("true");
		expect(followButton.className).toContain("bg-workbench-progress/15");
		expect(followButton.className).toContain("text-workbench-progress");
		expect(followButton.className).not.toContain("bg-workbench-selected");
		await waitFor(() => {
			expect(scrollTo).toHaveBeenCalledWith({
				behavior: "smooth",
				left: 300,
			});
		});
	});

	it("seeks from waveform clicks, commits range drags as deltas, and zooms with horizontal width", () => {
		const onPlayheadSeekRequested = vi.fn();
		const onSelectionRangeMoveRequested = vi.fn();
		renderTimeline({
			onPlayheadSeekRequested,
			onSelectionRangeMoveRequested,
			selection: {
				endUs: 6_000_000,
				startUs: 2_000_000,
			},
			waveformLaneLoader: async () => ({
				reason: "Decode failed",
				status: "unavailable",
			}),
		});

		fireEvent.mouseDown(screen.getByLabelText("Seek Voice waveform lane"), {
			clientX: 300,
		});
		expect(onPlayheadSeekRequested).toHaveBeenCalledWith(3_000_000);

		fireEvent.mouseDown(screen.getByLabelText("Seek timeline ruler"), {
			clientX: 600,
		});
		expect(onPlayheadSeekRequested).toHaveBeenCalledWith(6_000_000);

		fireEvent.mouseDown(screen.getByLabelText("Playhead handle"), {
			clientX: 0,
		});
		expect(screen.getByLabelText("Playhead handle").className).toContain(
			"transition-none",
		);
		fireEvent.mouseUp(window, { clientX: 900 });
		expect(onPlayheadSeekRequested).toHaveBeenCalledWith(9_000_000);

		fireEvent.mouseDown(screen.getByLabelText("Move selection range"), {
			clientX: 200,
		});
		expect(screen.getByTestId("selection-range-outline").className).toContain(
			"transition-none",
		);
		fireEvent.mouseUp(window, { clientX: 500 });
		expect(onSelectionRangeMoveRequested).toHaveBeenCalledWith(3_000_000);

		fireEvent.click(screen.getByRole("button", { name: "Zoom in timeline" }));
		expect(screen.getByTestId("selection-timeline-track").style.minWidth).toBe(
			"150%",
		);
	});
});

const source = new File(["video"], "clip.mp4", { type: "video/mp4" });

function renderTimeline(
	props: Partial<React.ComponentProps<typeof SelectionTimeline>> = {},
) {
	return render(
		<SelectionTimeline
			asset={readyAsset}
			onPlayheadSeekRequested={() => {}}
			onSelectionEndCommitRequested={() => {}}
			onSelectionRangeMoveRequested={() => {}}
			onSelectionResetRequested={() => {}}
			onSelectionStartCommitRequested={() => {}}
			playheadUs={0}
			selection={selection}
			source={source}
			waveformLaneLoader={async () => ({
				samples: [0.4, 0.7, 0.2],
				status: "ready",
			})}
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
		audio: [
			{
				channels: 2,
				codec: "aac",
				id: "audio-1",
				kind: "audio",
				label: "Voice",
				language: "eng",
				sampleRate: 48_000,
			},
			{
				channels: 2,
				codec: "aac",
				id: "audio-2",
				kind: "audio",
				label: "Game audio",
				language: "spa",
				sampleRate: 48_000,
			},
		],
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

function mockTimelineGeometry() {
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
		function getBoundingClientRect(this: HTMLElement) {
			if (
				this instanceof HTMLElement &&
				this.dataset.testid === "selection-timeline-track"
			) {
				return {
					bottom: 80,
					height: 80,
					left: 0,
					right: 1200,
					toJSON: () => ({}),
					top: 0,
					width: 1200,
					x: 0,
					y: 0,
				};
			}

			return {
				bottom: 0,
				height: 0,
				left: 0,
				right: 0,
				toJSON: () => ({}),
				top: 0,
				width: 0,
				x: 0,
				y: 0,
			};
		},
	);
}

function mockTimelineScroll(
	element: HTMLElement,
	{
		clientWidth,
		scrollWidth,
	}: {
		clientWidth: number;
		scrollWidth: number;
	},
) {
	const scrollTo = vi.fn((options: ScrollToOptions) => {
		element.scrollLeft = Number(options.left ?? 0);
	});

	Object.defineProperty(element, "clientWidth", {
		configurable: true,
		value: clientWidth,
	});
	Object.defineProperty(element, "scrollWidth", {
		configurable: true,
		value: scrollWidth,
	});
	Object.defineProperty(element, "scrollTo", {
		configurable: true,
		value: scrollTo,
	});

	return scrollTo;
}
