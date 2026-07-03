/* @vitest-environment jsdom */

import {
	act,
	cleanup,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import type { ReadyMediaAsset, Selection } from "@/editor-core/model";
import { SelectionTimeline } from "./selection-timeline";

const buttonRenderStats = vi.hoisted(() => ({
	renderCount: 0,
}));

vi.mock("@/components/ui/button", async () => {
	const React = await import("react");

	type MockButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
		size?: string;
		variant?: string;
	};

	return {
		Button: React.forwardRef<HTMLButtonElement, MockButtonProps>(
			function MockButton(
				{ children, size: _size, variant: _variant, ...props },
				ref,
			) {
				buttonRenderStats.renderCount += 1;

				return React.createElement("button", { ...props, ref }, children);
			},
		),
	};
});

beforeEach(() => {
	buttonRenderStats.renderCount = 0;
	mockTimelineGeometry();
	mockThumbnailObjectUrls();
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("SelectionTimeline live playhead render isolation", () => {
	it("updates the playhead without re-rendering static toolbar buttons", async () => {
		const view = render(createTimelineElement({ playheadUs: 0 }));

		await waitFor(() => {
			expect(screen.getByLabelText("Voice waveform detail")).toBeTruthy();
		});
		const buttonRenderCountAfterReady = buttonRenderStats.renderCount;

		view.rerender(createTimelineElement({ playheadUs: 500_000 }));

		expect(screen.getByLabelText("Playhead handle").style.left).toBe(
			"4.166666666666666%",
		);
		expect(buttonRenderStats.renderCount).toBe(buttonRenderCountAfterReady);
	});

	it("moves the live playhead handle on animation frames without React rerenders", async () => {
		let livePlayheadUs = 0;
		const { frameCallbacks, requestAnimationFrame } =
			stubTimelineAnimationFrames();
		const view = render(
			createTimelineElement({
				playheadUs: 0,
				readLivePlayheadUs: () => livePlayheadUs,
			}),
		);

		await waitFor(() => {
			expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
		});
		await waitFor(() => {
			expect(screen.getByLabelText("Voice waveform detail")).toBeTruthy();
		});
		const buttonRenderCountAfterReady = buttonRenderStats.renderCount;
		const playheadHandle = screen.getByLabelText("Playhead handle");

		livePlayheadUs = 600_000;
		act(() => {
			runNextTimelineFrame(frameCallbacks);
		});

		expect(playheadHandle.style.left).toBe("5%");
		expect(buttonRenderStats.renderCount).toBe(buttonRenderCountAfterReady);

		view.unmount();
	});
});

const source = new File(["video"], "clip.mp4", { type: "video/mp4" });
const selection = {
	endUs: 12_000_000,
	startUs: 0,
} satisfies Selection;
const timelineCallbacks = {
	onPlayheadSeekRequested: () => {},
	onSelectionEndCommitRequested: () => {},
	onSelectionRangeMoveRequested: () => {},
	onSelectionResetRequested: () => {},
	onSelectionStartCommitRequested: () => {},
};

function createTimelineElement({
	playheadUs,
	readLivePlayheadUs,
}: {
	playheadUs: number;
	readLivePlayheadUs?: () => number;
}) {
	return (
		<SelectionTimeline
			asset={readyAsset}
			audioMix={audioMix}
			onPlayheadSeekRequested={timelineCallbacks.onPlayheadSeekRequested}
			onSelectionEndCommitRequested={
				timelineCallbacks.onSelectionEndCommitRequested
			}
			onSelectionRangeMoveRequested={
				timelineCallbacks.onSelectionRangeMoveRequested
			}
			onSelectionResetRequested={timelineCallbacks.onSelectionResetRequested}
			onSelectionStartCommitRequested={
				timelineCallbacks.onSelectionStartCommitRequested
			}
			playheadUpdatesAreLive
			playheadUs={playheadUs}
			readLivePlayheadUs={readLivePlayheadUs}
			selection={selection}
			source={source}
			videoStripThumbnailLoader={videoStripThumbnailLoader}
			waveformLaneLoader={waveformLaneLoader}
		/>
	);
}

const videoStripThumbnailLoader: ComponentProps<
	typeof SelectionTimeline
>["videoStripThumbnailLoader"] = async ({ timestampsUs }) => ({
	frames: timestampsUs.slice(0, 3).map((timestampUs, index) => ({
		imageBlob: new Blob([`thumbnail-${index}`], { type: "image/jpeg" }),
		index,
		timestampUs,
	})),
	status: "ready",
	thumbnailHeightPx: 54,
	thumbnailWidthPx: 96,
});

const waveformLaneLoader: ComponentProps<
	typeof SelectionTimeline
>["waveformLaneLoader"] = async () => ({
	samples: [0.4, 0.7, 0.2],
	status: "ready",
});

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
		],
		video: [
			{
				id: "video-1",
				kind: "video",
			},
		],
	},
} satisfies ReadyMediaAsset;
const audioMix = createDefaultAudioMix(readyAsset);

function mockTimelineGeometry() {
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
		function getBoundingClientRect(this: HTMLElement) {
			if (this.dataset.testid === "selection-timeline-track") {
				return {
					bottom: 80,
					height: 80,
					left: 0,
					right: 1_200,
					toJSON: () => ({}),
					top: 0,
					width: 1_200,
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

function mockThumbnailObjectUrls() {
	let objectUrlIndex = 0;

	Object.defineProperty(URL, "createObjectURL", {
		configurable: true,
		value: vi.fn(() => {
			objectUrlIndex += 1;
			return `blob:thumbnail-${objectUrlIndex}`;
		}),
	});
	Object.defineProperty(URL, "revokeObjectURL", {
		configurable: true,
		value: vi.fn(),
	});
}

function stubTimelineAnimationFrames() {
	const frameCallbacks: FrameRequestCallback[] = [];
	const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
		frameCallbacks.push(callback);
		return frameCallbacks.length;
	});
	const cancelAnimationFrame = vi.fn();

	vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
	vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);

	return {
		frameCallbacks,
		requestAnimationFrame,
	};
}

function runNextTimelineFrame(frameCallbacks: FrameRequestCallback[]) {
	const callback = frameCallbacks.shift();

	if (!callback) {
		throw new Error("Expected a pending timeline animation frame");
	}

	callback(16);
}
