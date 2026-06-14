/* @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import type { AudioMix, MediaTimeUs, ReadyMediaAsset } from "@/editor-core/model";

import type { BrowserAudioPreviewSource } from "./browser-audio-preview-sources";
import type { BrowserAudioPreviewSourcesState } from "./use-browser-audio-preview-sources";
import { usePreviewAudioMonitoringLifecycle } from "./use-preview-audio-monitoring-lifecycle";

const createMultitrackMock = vi.fn();
const createdMultitracks: MultitrackSpy[] = [];
const DEFAULT_GET_PLAYBACK_RATE = () => 1;
const DEFAULT_GET_PLAYHEAD_US = () => 0;

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

	it("cleans up the adapter and hidden container when audio source preparation fails", async () => {
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
			<PreviewAudioMonitoringProbe state={failedAudioSourcesState()} />,
		);

		await waitFor(() => {
			expect(screen.getByLabelText("audio monitoring ready").textContent).toBe(
				"not-ready",
			);
		});
		expect(createMultitrackMock).toHaveBeenCalledTimes(1);
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

	it("applies preview volume, audio mix volume, include decisions, mute, and preview-only solo inside the lifecycle", async () => {
		const audioMix = createAudioMix({
			"audio-1": {
				include: true,
				volumePercent: 50,
			},
			"audio-2": {
				include: false,
				volumePercent: 25,
			},
		});
		const sources = [
			createAudioPreviewSource("audio-1"),
			createAudioPreviewSource("audio-2"),
		];
		const readySources = readyAudioSourcesState(sources);

		const { rerender } = render(
			<PreviewAudioMonitoringProbe
				audioMix={audioMix}
				state={readySources}
				volume={0.8}
			/>,
		);

		await waitFor(() => {
			expect(createMultitrackMock).toHaveBeenCalledTimes(1);
		});
		createdMultitracks[0].emitCanPlay();

		await waitFor(() => {
			expect(createdMultitracks[0].setTrackVolume).toHaveBeenCalledWith(0, 0.2);
		});
		expect(createdMultitracks[0].setTrackVolume).toHaveBeenCalledWith(1, 0);

		rerender(
			<PreviewAudioMonitoringProbe
				audioMix={audioMix}
				muted={true}
				state={readySources}
				volume={0.8}
			/>,
		);

		await waitFor(() => {
			expect(lastTrackVolume(createdMultitracks[0], 0)).toBe(0);
			expect(lastTrackVolume(createdMultitracks[0], 1)).toBe(0);
		});

		rerender(
			<PreviewAudioMonitoringProbe
				audioMix={audioMix}
				soloedAudioTrackId="audio-2"
				state={readySources}
				volume={0.8}
			/>,
		);

		await waitFor(() => {
			expect(lastTrackVolume(createdMultitracks[0], 0)).toBe(0);
			expect(lastTrackVolume(createdMultitracks[0], 1)).toBeCloseTo(0.05);
		});
		expect(audioMix.tracks["audio-2"]?.include).toBe(false);
	});
});

function PreviewAudioMonitoringProbe({
	audioMix = createDefaultAudioMix(readyAssetWithAudio),
	getPlaybackRate = DEFAULT_GET_PLAYBACK_RATE,
	getPlayheadUs = DEFAULT_GET_PLAYHEAD_US,
	muted = false,
	soloedAudioTrackId = null,
	state,
	volume = 1,
}: {
	audioMix?: AudioMix;
	getPlaybackRate?: () => number;
	getPlayheadUs?: () => MediaTimeUs;
	muted?: boolean;
	soloedAudioTrackId?: string | null;
	state: BrowserAudioPreviewSourcesState;
	volume?: number;
}) {
	const audioMonitoring = usePreviewAudioMonitoringLifecycle({
		audioMix,
		audioPreviewSources: state,
		getPlaybackRate,
		getPlayheadUs,
		muted,
		soloedAudioTrackId,
		volume,
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

function failedAudioSourcesState(): BrowserAudioPreviewSourcesState {
	return {
		failures: [
			{
				reason: "The analyzed audio track is no longer available.",
				track: {
					id: "audio-1",
					kind: "audio",
				},
				trackId: "audio-1",
				trackIndex: 0,
			},
		],
		reason: "The analyzed audio track is no longer available.",
		status: "failed",
	};
}

function createAudioMix(
	decisions: Record<string, { include: boolean; volumePercent: number }>,
) {
	const audioMix = createDefaultAudioMix(readyAssetWithAudio);

	for (const [trackId, decision] of Object.entries(decisions)) {
		const audioDecision = audioMix.tracks[trackId];

		if (!audioDecision) {
			throw new Error(`Expected ${trackId} audio mix decision.`);
		}

		audioDecision.include = decision.include;
		audioDecision.volumePercent = decision.volumePercent;
	}

	return audioMix;
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

const readyAssetWithAudio = {
	...readyAsset,
	tracks: {
		...readyAsset.tracks,
		audio: [
			{
				codec: "aac",
				id: "audio-1",
				kind: "audio",
				label: "Voice",
			},
			{
				codec: "aac",
				id: "audio-2",
				kind: "audio",
				label: "Desktop",
			},
		],
	},
} satisfies ReadyMediaAsset;

type MultitrackSpy = ReturnType<typeof createMultitrackSpy>;

function lastTrackVolume(multitrack: MultitrackSpy, trackIndex: number) {
	const calls = multitrack.setTrackVolume.mock.calls.filter(
		([candidateTrackIndex]) => candidateTrackIndex === trackIndex,
	);
	const lastCall = calls.at(-1);

	if (!lastCall) {
		throw new Error(`No volume call found for track ${trackIndex}.`);
	}

	return lastCall[1];
}

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
		setTrackVolume: vi.fn(),
		unsubscribeCanPlay,
	};
}
