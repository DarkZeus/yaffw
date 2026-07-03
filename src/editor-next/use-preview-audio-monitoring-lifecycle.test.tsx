/* @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import type {
	AudioMix,
	MediaTimeUs,
	ReadyMediaAsset,
} from "@/editor-core/model";

import type { PreviewAudioResource } from "./preview-audio-resources.types";
import type { PreviewAudioEngineMeterSnapshot } from "./preview-audio-engine";
import type { PreviewAudioEngineFactory } from "./use-preview-audio-monitoring-lifecycle.types";
import type { PreviewAudioResourcesState } from "./use-preview-audio-resources.types";
import { usePreviewAudioMonitoringLifecycle } from "./use-preview-audio-monitoring-lifecycle";

const createPreviewAudioEngineMock = vi.fn<PreviewAudioEngineFactory>();
const createdPreviewAudioEngines: PreviewAudioEngineSpy[] = [];
const DEFAULT_GET_PLAYBACK_RATE = () => 1;
const DEFAULT_GET_PLAYHEAD_US = () => 0;

beforeEach(() => {
	createdPreviewAudioEngines.length = 0;
	createPreviewAudioEngineMock.mockImplementation(async () => {
		const previewAudioEngine = createPreviewAudioEngineSpy();
		createdPreviewAudioEngines.push(previewAudioEngine);

		return previewAudioEngine;
	});
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("usePreviewAudioMonitoringLifecycle", () => {
	it("creates a Preview audio engine, reports readiness, and syncs playhead and playback speed", async () => {
		render(
			<PreviewAudioMonitoringProbe
				getPlaybackRate={() => 1.5}
				getPlayheadUs={() => 5_250_000}
				state={readyPreviewAudioResourcesState([createPreviewAudioResource("audio-1")])}
			/>,
		);

		await waitFor(() => {
			expect(createPreviewAudioEngineMock).toHaveBeenCalledTimes(1);
			expect(screen.getByLabelText("audio monitoring ready").textContent).toBe(
				"ready",
			);
		});
		expect(createPreviewAudioEngineMock).toHaveBeenCalledWith(
			expect.objectContaining({
				resources: [expect.objectContaining({ trackId: "audio-1" })],
			}),
		);
		expect(createdPreviewAudioEngines[0]?.setTime).toHaveBeenCalledWith(5.25);
		expect(createdPreviewAudioEngines[0]?.setPlaybackRate).toHaveBeenCalledWith(
			1.5,
		);
		expect(createdPreviewAudioEngines[0]?.setOutputGain).toHaveBeenCalledWith(
			1,
		);
		expect(
			createdPreviewAudioEngines[0]?.setTrackChannelMode,
		).toHaveBeenCalledWith(0, "preserve");
	});

	it("destroys the previous engine when prepared resources change", async () => {
		const { rerender } = render(
			<PreviewAudioMonitoringProbe
				state={readyPreviewAudioResourcesState([createPreviewAudioResource("audio-1")])}
			/>,
		);

		await waitFor(() => {
			expect(createPreviewAudioEngineMock).toHaveBeenCalledTimes(1);
		});

		rerender(
			<PreviewAudioMonitoringProbe
				state={readyPreviewAudioResourcesState([createPreviewAudioResource("audio-2")])}
			/>,
		);

		await waitFor(() => {
			expect(createPreviewAudioEngineMock).toHaveBeenCalledTimes(2);
		});
		expect(createdPreviewAudioEngines[0]?.destroy).toHaveBeenCalledTimes(1);
		expect(screen.getByLabelText("audio monitoring ready").textContent).toBe(
			"ready",
		);
	});

	it("cleans up when audio source preparation restarts for a new source or asset", async () => {
		const { rerender } = render(
			<PreviewAudioMonitoringProbe
				state={readyPreviewAudioResourcesState([createPreviewAudioResource("audio-1")])}
			/>,
		);

		await waitFor(() => {
			expect(screen.getByLabelText("audio monitoring ready").textContent).toBe(
				"ready",
			);
		});

		rerender(
			<PreviewAudioMonitoringProbe state={loadingPreviewAudioResourcesState()} />,
		);

		await waitFor(() => {
			expect(screen.getByLabelText("audio monitoring ready").textContent).toBe(
				"not-ready",
			);
		});
		expect(createdPreviewAudioEngines[0]?.destroy).toHaveBeenCalledTimes(1);
	});

	it("cleans up the engine when audio source preparation fails", async () => {
		const { rerender } = render(
			<PreviewAudioMonitoringProbe
				state={readyPreviewAudioResourcesState([createPreviewAudioResource("audio-1")])}
			/>,
		);

		await waitFor(() => {
			expect(screen.getByLabelText("audio monitoring ready").textContent).toBe(
				"ready",
			);
		});

		rerender(<PreviewAudioMonitoringProbe state={failedPreviewAudioResourcesState()} />);

		await waitFor(() => {
			expect(screen.getByLabelText("audio monitoring ready").textContent).toBe(
				"not-ready",
			);
		});
		expect(createPreviewAudioEngineMock).toHaveBeenCalledTimes(1);
		expect(createdPreviewAudioEngines[0]?.destroy).toHaveBeenCalledTimes(1);
	});

	it("reports failed status when the Preview audio engine cannot be created", async () => {
		createPreviewAudioEngineMock.mockRejectedValueOnce(
			new Error("decode failed"),
		);

		render(
			<PreviewAudioMonitoringProbe
				state={readyPreviewAudioResourcesState([createPreviewAudioResource("audio-1")])}
			/>,
		);

		await waitFor(() => {
			expect(screen.getByLabelText("audio monitoring status").textContent).toBe(
				"failed",
			);
		});
		expect(screen.getByLabelText("audio monitoring ready").textContent).toBe(
			"not-ready",
		);
	});

	it("reports degraded status as ready when the Preview audio engine has explicit failed tracks", async () => {
		createPreviewAudioEngineMock.mockImplementationOnce(async () => {
			const previewAudioEngine = createPreviewAudioEngineSpy({
				status: "degraded",
			});
			createdPreviewAudioEngines.push(previewAudioEngine);

			return previewAudioEngine;
		});
		const failedSourcesState = {
			failures: [
				{
					reason: "Desktop source failed",
					track: {
						id: "audio-2",
						kind: "audio",
					},
					trackId: "audio-2",
					trackIndex: 1,
				},
			],
			resources: [createPreviewAudioResource("audio-1")],
			status: "ready",
		} satisfies PreviewAudioResourcesState;

		render(<PreviewAudioMonitoringProbe state={failedSourcesState} />);

		await waitFor(() => {
			expect(screen.getByLabelText("audio monitoring status").textContent).toBe(
				"degraded",
			);
		});
		expect(screen.getByLabelText("audio monitoring ready").textContent).toBe(
			"ready",
		);
		expect(createPreviewAudioEngineMock).toHaveBeenCalledWith({
			failures: failedSourcesState.failures,
			resources: [expect.objectContaining({ trackId: "audio-1" })],
		});
	});

	it("destroys the engine on cleanup", async () => {
		const { unmount } = render(
			<PreviewAudioMonitoringProbe
				state={readyPreviewAudioResourcesState([createPreviewAudioResource("audio-1")])}
			/>,
		);

		await waitFor(() => {
			expect(createPreviewAudioEngineMock).toHaveBeenCalledTimes(1);
		});

		unmount();

		expect(createdPreviewAudioEngines[0]?.destroy).toHaveBeenCalledTimes(1);
	});

	it("destroys late async Preview audio engines after cleanup", async () => {
		const deferred = createDeferred<PreviewAudioEngineSpy>();
		createPreviewAudioEngineMock.mockReturnValueOnce(
			deferred.promise as ReturnType<PreviewAudioEngineFactory>,
		);
		const previewAudioEngine = createPreviewAudioEngineSpy();
		const { unmount } = render(
			<PreviewAudioMonitoringProbe
				state={readyPreviewAudioResourcesState([createPreviewAudioResource("audio-1")])}
			/>,
		);

		unmount();
		deferred.resolve(previewAudioEngine);
		await deferred.promise;
		await Promise.resolve();

		expect(previewAudioEngine.destroy).toHaveBeenCalledTimes(1);
		expect(screen.queryByLabelText("audio monitoring ready")).toBeNull();
	});

	it("applies audio mix decisions, channel handling, and preview-only monitoring inside the lifecycle", async () => {
		const audioMix = createAudioMix({
			"audio-1": {
				channelMode: "use-left-as-mono",
				include: true,
				volumePercent: 50,
			},
			"audio-2": {
				channelMode: "preserve",
				include: false,
				volumePercent: 25,
			},
		});
		const resources = [
			createPreviewAudioResource("audio-1"),
			createPreviewAudioResource("audio-2"),
		];
		const readyResources = readyPreviewAudioResourcesState(resources);

		const { rerender } = render(
			<PreviewAudioMonitoringProbe
				audioMix={audioMix}
				state={readyResources}
				volume={0.8}
			/>,
		);

		await waitFor(() => {
			expect(
				createdPreviewAudioEngines[0]?.setTrackVolumeGain,
			).toHaveBeenCalledWith(0, 0.25);
			expect(
				createdPreviewAudioEngines[0]?.setTrackMonitorGain,
			).toHaveBeenCalledWith(0, 1);
			expect(
				createdPreviewAudioEngines[0]?.setTrackVolumeGain,
			).toHaveBeenCalledWith(1, 0.0625);
			expect(
				createdPreviewAudioEngines[0]?.setTrackMonitorGain,
			).toHaveBeenCalledWith(1, 0);
		});
		expect(
			createdPreviewAudioEngines[0]?.setTrackChannelMode,
		).toHaveBeenCalledWith(0, "use-left-as-mono");
		expect(createdPreviewAudioEngines[0]?.setOutputGain).toHaveBeenCalledWith(
			0.8,
		);

		rerender(
			<PreviewAudioMonitoringProbe
				audioMix={audioMix}
				muted={true}
				state={readyResources}
				volume={0.8}
			/>,
		);

		await waitFor(() => {
			expect(lastOutputGain(createdPreviewAudioEngines[0])).toBe(0);
		});
		expect(lastTrackGain(createdPreviewAudioEngines[0], 0)).toBeCloseTo(0.25);
		expect(lastTrackGain(createdPreviewAudioEngines[0], 1)).toBe(0);

		rerender(
			<PreviewAudioMonitoringProbe
				audioMix={audioMix}
				soloedAudioTrackId="audio-2"
				state={readyResources}
				volume={0.8}
			/>,
		);

		await waitFor(() => {
			expect(lastOutputGain(createdPreviewAudioEngines[0])).toBe(0.8);
			expect(lastTrackGain(createdPreviewAudioEngines[0], 0)).toBe(0);
			expect(lastTrackGain(createdPreviewAudioEngines[0], 1)).toBeCloseTo(
				0.0625,
			);
		});
		expect(audioMix.tracks["audio-2"]?.include).toBe(false);
	});

	it("applies initial track gains before reporting audio monitoring ready", async () => {
		const onReadyChange = vi.fn((nextReady: boolean) => {
			if (!nextReady) {
				return;
			}

			expect(lastTrackGain(createdPreviewAudioEngines[0], 0)).toBe(1);
			expect(lastTrackGain(createdPreviewAudioEngines[0], 1)).toBe(1);
		});

		render(
			<PreviewAudioMonitoringProbe
				onReadyChange={onReadyChange}
				state={readyPreviewAudioResourcesState([
					createPreviewAudioResource("audio-1"),
					createPreviewAudioResource("audio-2"),
				])}
			/>,
		);

		await waitFor(() => {
			expect(onReadyChange).toHaveBeenCalledWith(true);
		});
	});
});

function PreviewAudioMonitoringProbe({
	audioMix = createDefaultAudioMix(readyAssetWithAudio),
	getPlaybackRate = DEFAULT_GET_PLAYBACK_RATE,
	getPlayheadUs = DEFAULT_GET_PLAYHEAD_US,
	muted = false,
	onReadyChange,
	soloedAudioTrackId = null,
	state,
	volume = 1,
}: {
	audioMix?: AudioMix;
	getPlaybackRate?: () => number;
	getPlayheadUs?: () => MediaTimeUs;
	muted?: boolean;
	onReadyChange?: (ready: boolean) => void;
	soloedAudioTrackId?: string | null;
	state: PreviewAudioResourcesState;
	volume?: number;
}) {
	const audioMonitoring = usePreviewAudioMonitoringLifecycle({
		audioMix,
		previewAudioResources: state,
		createPreviewAudioEngine: createPreviewAudioEngineMock,
		getPlaybackRate,
		getPlayheadUs,
		muted,
		onReadyChange,
		soloedAudioTrackId,
		volume,
	});

	return (
		<>
			<output aria-label="audio monitoring ready">
				{audioMonitoring.ready ? "ready" : "not-ready"}
			</output>
			<output aria-label="audio monitoring status">
				{audioMonitoring.status}
			</output>
		</>
	);
}

function readyPreviewAudioResourcesState(
	resources: PreviewAudioResource[],
): PreviewAudioResourcesState {
	return {
		failures: [],
		resources,
		status: "ready",
	};
}

function loadingPreviewAudioResourcesState(): PreviewAudioResourcesState {
	return {
		preparingTrackIds: new Set(["audio-1"]),
		resources: [],
		status: "loading",
	};
}

function failedPreviewAudioResourcesState(): PreviewAudioResourcesState {
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
	decisions: Record<
		string,
		{
			channelMode?: AudioMix["tracks"][string]["channelMode"];
			include: boolean;
			volumePercent: number;
		}
	>,
) {
	const audioMix = createDefaultAudioMix(readyAssetWithAudio);

	for (const [trackId, decision] of Object.entries(decisions)) {
		const audioDecision = audioMix.tracks[trackId];

		if (!audioDecision) {
			throw new Error(`Expected ${trackId} audio mix decision.`);
		}

		audioDecision.include = decision.include;
		audioDecision.channelMode =
			decision.channelMode ?? audioDecision.channelMode;
		audioDecision.volumePercent = decision.volumePercent;
	}

	return audioMix;
}

function createPreviewAudioResource(trackId: string): PreviewAudioResource {
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

function lastTrackGain(
	previewAudioEngine: PreviewAudioEngineSpy | undefined,
	trackIndex: number,
) {
	return (
		lastTrackVolumeGain(previewAudioEngine, trackIndex) *
		lastTrackMonitorGain(previewAudioEngine, trackIndex)
	);
}

function lastTrackVolumeGain(
	previewAudioEngine: PreviewAudioEngineSpy | undefined,
	trackIndex: number,
) {
	const calls =
		previewAudioEngine?.setTrackVolumeGain.mock.calls.filter(
			([candidateTrackIndex]) => candidateTrackIndex === trackIndex,
		) ?? [];
	const lastCall = calls.at(-1);

	if (!lastCall) {
		throw new Error(`No volume gain call found for track ${trackIndex}.`);
	}

	return lastCall[1];
}

function lastTrackMonitorGain(
	previewAudioEngine: PreviewAudioEngineSpy | undefined,
	trackIndex: number,
) {
	const calls =
		previewAudioEngine?.setTrackMonitorGain.mock.calls.filter(
			([candidateTrackIndex]) => candidateTrackIndex === trackIndex,
		) ?? [];
	const lastCall = calls.at(-1);

	if (!lastCall) {
		throw new Error(`No monitor gain call found for track ${trackIndex}.`);
	}

	return lastCall[1];
}

function lastOutputGain(previewAudioEngine: PreviewAudioEngineSpy | undefined) {
	const lastCall = previewAudioEngine?.setOutputGain.mock.calls.at(-1);

	if (!lastCall) {
		throw new Error("No output gain call found.");
	}

	return lastCall[0];
}

type PreviewAudioEngineSpy = ReturnType<typeof createPreviewAudioEngineSpy>;

function createPreviewAudioEngineSpy({
	status = "ready",
}: {
	status?: "degraded" | "ready";
} = {}) {
	return {
		destroy: vi.fn(),
		getCurrentTime: vi.fn(() => 0),
		getStatus: vi.fn(() => status),
		pause: vi.fn(),
		play: vi.fn(),
		readMeterSnapshot: vi.fn(() => emptyMeterSnapshot),
		retryTrackResource: vi.fn(async () => status),
		setOutputGain: vi.fn(),
		setPlaybackRate: vi.fn(),
		setTime: vi.fn(),
		setTrackChannelMode: vi.fn(),
		setTrackMonitorGain: vi.fn(),
		setTrackVolumeGain: vi.fn(),
	};
}

const emptyMeterSnapshot: PreviewAudioEngineMeterSnapshot = {
	combinedState: {
		channels: [],
		partial: false,
		status: "ready",
	},
	trackStates: {},
};

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
