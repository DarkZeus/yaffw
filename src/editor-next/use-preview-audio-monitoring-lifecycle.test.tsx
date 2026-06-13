/* @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MediaTimeUs } from "@/editor-core/model";

import type { BrowserAudioPreviewSource } from "./browser-audio-preview-sources";
import type { BrowserAudioPreviewSourcesState } from "./use-browser-audio-preview-sources";
import { usePreviewAudioMonitoringLifecycle } from "./use-preview-audio-monitoring-lifecycle";

const createMultitrackMock = vi.fn();
const createdMultitracks: MultitrackSpy[] = [];

vi.mock("wavesurfer-multitrack", () => ({
	default: {
		create: createMultitrackMock,
	},
}));

beforeEach(() => {
	createMultitrackMock.mockImplementation(() => {
		const multitrack = createMultitrackSpy();
		createdMultitracks.push(multitrack);
		return multitrack;
	});
	createdMultitracks.length = 0;
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("usePreviewAudioMonitoringLifecycle", () => {
	it("creates a multitrack adapter, reports readiness, and syncs playhead and playback speed on canplay", async () => {
		render(
			<PreviewAudioMonitoringProbe
				getPlaybackRate={() => 1.5}
				getPlayheadUs={() => 5_250_000}
				state={readyAudioSourcesState([createAudioPreviewSource("audio-1")])}
			/>,
		);

		await waitFor(() => {
			expect(createMultitrackMock).toHaveBeenCalledTimes(1);
		});
		expect(screen.getByLabelText("audio monitoring ready").textContent).toBe(
			"not-ready",
		);
		expect(createdMultitracks[0].setTime).not.toHaveBeenCalled();

		createdMultitracks[0].emitCanPlay();

		await waitFor(() => {
			expect(screen.getByLabelText("audio monitoring ready").textContent).toBe(
				"ready",
			);
		});
		expect(createdMultitracks[0].setTime).toHaveBeenCalledWith(5.25);
		expect(createdMultitracks[0].setAudioRate).toHaveBeenCalledWith(1.5);
	});

	it("destroys the previous adapter and clears hidden container content when prepared sources change", async () => {
		const { rerender } = render(
			<PreviewAudioMonitoringProbe
				state={readyAudioSourcesState([createAudioPreviewSource("audio-1")])}
			/>,
		);

		await waitFor(() => {
			expect(createMultitrackMock).toHaveBeenCalledTimes(1);
		});
		screen
			.getByTestId("audio-monitoring-container")
			.append(document.createElement("wave"));

		rerender(
			<PreviewAudioMonitoringProbe
				state={readyAudioSourcesState([createAudioPreviewSource("audio-2")])}
			/>,
		);

		await waitFor(() => {
			expect(createMultitrackMock).toHaveBeenCalledTimes(2);
		});
		expect(createdMultitracks[0].destroy).toHaveBeenCalledTimes(1);
		expect(
			screen.getByTestId("audio-monitoring-container").childElementCount,
		).toBe(0);
		expect(screen.getByLabelText("audio monitoring ready").textContent).toBe(
			"not-ready",
		);
	});

	it("cleans up when audio source preparation restarts for a new source or asset", async () => {
		const { rerender } = render(
			<PreviewAudioMonitoringProbe
				state={readyAudioSourcesState([createAudioPreviewSource("audio-1")])}
			/>,
		);

		await waitFor(() => {
			expect(createMultitrackMock).toHaveBeenCalledTimes(1);
		});
		createdMultitracks[0].emitCanPlay();
		await waitFor(() => {
			expect(screen.getByLabelText("audio monitoring ready").textContent).toBe(
				"ready",
			);
		});
		screen
			.getByTestId("audio-monitoring-container")
			.append(document.createElement("wave"));

		rerender(
			<PreviewAudioMonitoringProbe state={loadingAudioSourcesState()} />,
		);

		await waitFor(() => {
			expect(screen.getByLabelText("audio monitoring ready").textContent).toBe(
				"not-ready",
			);
		});
		expect(createdMultitracks[0].destroy).toHaveBeenCalledTimes(1);
		expect(
			screen.getByTestId("audio-monitoring-container").childElementCount,
		).toBe(0);
	});

	it("unsubscribes readiness listeners and destroys the adapter on cleanup", async () => {
		const { unmount } = render(
			<PreviewAudioMonitoringProbe
				state={readyAudioSourcesState([createAudioPreviewSource("audio-1")])}
			/>,
		);

		await waitFor(() => {
			expect(createMultitrackMock).toHaveBeenCalledTimes(1);
		});

		unmount();

		expect(createdMultitracks[0].unsubscribeCanPlay).toHaveBeenCalledTimes(1);
		expect(createdMultitracks[0].destroy).toHaveBeenCalledTimes(1);
	});
});

function PreviewAudioMonitoringProbe({
	getPlaybackRate = () => 1,
	getPlayheadUs = () => 0,
	state,
}: {
	getPlaybackRate?: () => number;
	getPlayheadUs?: () => MediaTimeUs;
	state: BrowserAudioPreviewSourcesState;
}) {
	const audioMonitoring = usePreviewAudioMonitoringLifecycle({
		audioPreviewSources: state,
		getPlaybackRate,
		getPlayheadUs,
	});

	return (
		<div>
			<div
				data-testid="audio-monitoring-container"
				ref={audioMonitoring.multitrackContainerRef}
			/>
			<output aria-label="audio monitoring ready">
				{audioMonitoring.ready ? "ready" : "not-ready"}
			</output>
		</div>
	);
}

function readyAudioSourcesState(
	sources: BrowserAudioPreviewSource[],
): BrowserAudioPreviewSourcesState {
	return {
		failures: [],
		sources,
		status: "ready",
	};
}

function loadingAudioSourcesState(): BrowserAudioPreviewSourcesState {
	return {
		preparingTrackIds: new Set(["audio-1"]),
		sources: [],
		status: "loading",
	};
}

function createAudioPreviewSource(trackId: string): BrowserAudioPreviewSource {
	return {
		blob: new Blob(["audio"], { type: "audio/mp4" }),
		byteLength: 5,
		downloadName: `${trackId}.m4a`,
		mimeType: "audio/mp4",
		startPositionSeconds: 0,
		strategy: "same-codec-remux",
		track: {
			id: trackId,
			kind: "audio",
		},
		trackId,
		trackIndex: 0,
		url: `blob:${trackId}`,
	};
}

type MultitrackSpy = ReturnType<typeof createMultitrackSpy>;

function createMultitrackSpy() {
	let canPlayHandler: (() => void) | undefined;
	const unsubscribeCanPlay = vi.fn();

	return {
		destroy: vi.fn(),
		emitCanPlay: () => {
			canPlayHandler?.();
		},
		on: vi.fn((eventName: string, handler: () => void) => {
			if (eventName === "canplay") {
				canPlayHandler = handler;
			}

			return unsubscribeCanPlay;
		}),
		setAudioRate: vi.fn(),
		setTime: vi.fn(),
		unsubscribeCanPlay,
	};
}
