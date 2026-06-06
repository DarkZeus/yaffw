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
	SelectionTimeline,
	addAudioBufferToBuckets,
	createWaveformLaneIdentityViewModel,
} from "./selection-timeline";

beforeEach(() => {
	mockTimelineGeometry();
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("SelectionTimeline", () => {
	it("formats waveform lane identity from media-track facts and lane status", () => {
		expect(
			createWaveformLaneIdentityViewModel({
				status: "ready",
				track: {
					channels: 2,
					codec: "aac",
					id: "audio-voice",
					kind: "audio",
					label: "Voice",
					language: "eng",
					sampleRate: 48_000,
				},
				trackIndex: 0,
			}),
		).toEqual({
			metadata: ["Language eng", "AAC", "2 channels"],
			status: {
				label: "Waveform ready",
				tone: "ready",
			},
			title: "Voice",
		});

		expect(
			createWaveformLaneIdentityViewModel({
				status: "loading",
				track: {
					id: "audio-unnamed",
					kind: "audio",
					language: "und",
				},
				trackIndex: 1,
			}),
		).toEqual({
			metadata: ["Language unknown", "Codec unknown", "Channels unknown"],
			status: {
				label: "Loading waveform",
				tone: "pending",
			},
			title: "Unnamed audio lane 2",
		});

		expect(
			createWaveformLaneIdentityViewModel({
				status: "unavailable",
				track: {
					channels: 1,
					codec: "opus",
					id: "audio-desktop",
					kind: "audio",
					label: "Desktop",
				},
				trackIndex: 2,
			}),
		).toEqual({
			metadata: ["Language unknown", "OPUS", "1 channel"],
			status: {
				label: "Waveform unavailable",
				tone: "unavailable",
			},
			title: "Desktop",
		});
	});

	it("loads every audio lane progressively, exposes unavailable lanes, and avoids mix controls", async () => {
		renderTimeline({
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
		expect(screen.getByText("Language eng")).toBeTruthy();
		expect(screen.getByText("Language spa")).toBeTruthy();
		expect(screen.getAllByText("AAC").length).toBeGreaterThan(0);
		expect(screen.getAllByText("2 channels").length).toBeGreaterThan(0);

		await waitFor(() => {
			expect(screen.getByText("Waveform ready")).toBeTruthy();
			expect(
				screen.getAllByText("Waveform unavailable").length,
			).toBeGreaterThan(0);
		});
		expect(screen.getByLabelText("Voice waveform detail")).toBeTruthy();
		expect(screen.getByLabelText("Move selection range").parentElement).toBe(
			screen.getByTestId("selection-timeline-lane-surface"),
		);
		expect(
			screen.getByTestId("waveform-lane-header-audio-1").nextElementSibling,
		).toBe(screen.getByLabelText("Seek Voice waveform lane"));
		expect(screen.getByTestId("selection-range-outline").className).toContain(
			"bg-transparent",
		);
		expect(screen.getByTestId("selection-range-outline").className).toContain(
			"border-y-2",
		);
		expect(screen.getByTestId("selection-range-outline").className).toContain(
			"transition-[left,width]",
		);
		expect(screen.getByTestId("selection-range-outline").className).toContain(
			"ease-out",
		);
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
		expect(screen.getByLabelText("Move selection range").className).toContain(
			"bg-transparent",
		);
		expect(
			screen.getByTestId("selection-start-handle-rail").className,
		).toContain("w-0.5");
		expect(screen.getByTestId("selection-end-handle-rail").className).toContain(
			"w-0.5",
		);

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

	it("maps waveform samples by media timestamps instead of lane-local offsets", () => {
		const delayedBuckets = new Array<number>(10).fill(0);

		addAudioBufferToBuckets({
			buckets: delayedBuckets,
			buffer: createAudioBufferLike([[0.5, 1, 0.25, 0.75]], 2),
			mediaDurationSeconds: 10,
			timestampSeconds: 4,
		});

		expect(delayedBuckets).toEqual([0, 0, 0, 0, 1, 0.75, 0, 0, 0, 0]);

		const clippedBuckets = new Array<number>(4).fill(0);

		addAudioBufferToBuckets({
			buckets: clippedBuckets,
			buffer: createAudioBufferLike([[1, 0.5, 0.25, 0.125]], 2),
			mediaDurationSeconds: 4,
			timestampSeconds: -0.5,
		});

		expect(clippedBuckets).toEqual([0.5, 0.125, 0, 0]);
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

function createAudioBufferLike(
	channels: number[][],
	sampleRate: number,
): AudioBuffer {
	return {
		getChannelData: (index: number) => Float32Array.from(channels[index] ?? []),
		length: channels[0]?.length ?? 0,
		numberOfChannels: channels.length,
		sampleRate,
	} as AudioBuffer;
}
