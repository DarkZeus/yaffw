/* @vitest-environment jsdom */

import { cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import type {
	AudioMix,
	MediaTimeUs,
	ReadyMediaAsset,
} from "@/editor-core/model";

import {
	type PreviewAudioEngineFactory,
	usePreviewAudioMonitoringLifecycle,
} from "../engine/use-preview-audio-monitoring-lifecycle";
import type { PreviewAudioResourcesState } from "../engine/use-preview-audio-resources";
import type { PreviewAudioEngineMeterSnapshot } from "../types/preview-audio-engine.types";
import type { PreviewAudioEngine } from "../types/preview-audio-engine.types";
import type { PreviewAudioResource } from "../types/preview-audio-resources.types";
import { createPreviewAudioProviderStub } from "./preview-audio-test-fixtures";

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
	it("destroys late async Preview audio engines after cleanup", async () => {
		const deferred = createDeferred<PreviewAudioEngineSpy>();
		createPreviewAudioEngineMock.mockReturnValueOnce(
			deferred.promise as ReturnType<PreviewAudioEngineFactory>,
		);
		const previewAudioEngine = createPreviewAudioEngineSpy();
		const { unmount } = render(
			<PreviewAudioMonitoringProbe
				state={readyPreviewAudioResourcesState([
					createPreviewAudioResource("audio-1"),
				])}
			/>,
		);

		unmount();
		deferred.resolve(previewAudioEngine);
		await deferred.promise;
		await Promise.resolve();

		expect(previewAudioEngine.destroy).toHaveBeenCalledTimes(1);
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
	state: PreviewAudioResourcesState;
	volume?: number;
}) {
	const previewAudioEngineRef = useRef<PreviewAudioEngine | null>(null);
	usePreviewAudioMonitoringLifecycle({
		audioMix,
		previewAudioResources: state,
		createPreviewAudioEngine: createPreviewAudioEngineMock,
		getPlaybackRate,
		getPlayheadUs,
		muted,
		previewAudioEngineRef,
		soloedAudioTrackId,
		volume,
	});

	return null;
}

function readyPreviewAudioResourcesState(
	resources: PreviewAudioResource[],
): PreviewAudioResourcesState {
	return {
		provider: createPreviewAudioProviderStub(
			resources.map((resource) => resource.trackId),
		),
		resources,
		status: "ready",
	};
}

function createPreviewAudioResource(trackId: string): PreviewAudioResource {
	return {
		numberOfChannels: 2,
		trackId,
	};
}

type PreviewAudioEngineSpy = ReturnType<typeof createPreviewAudioEngineSpy>;

function createPreviewAudioEngineSpy({
	status = "ready",
}: {
	status?: "degraded" | "ready" | "preparing" | "failed";
} = {}) {
	return {
		destroy: vi.fn(),
		getCurrentTime: vi.fn(() => 0),
		getPresentationTime: vi.fn(() => 0),
		getStatus: vi.fn(() => status),
		getPlaybackState: vi.fn(() => "paused" as const),
		getMetrics: vi.fn(),
		retryTrack: vi.fn(async () => {}),
		setPlaybackEnd: vi.fn(),
		subscribe: vi.fn((_listener: () => void) => vi.fn()),
		pause: vi.fn(),
		play: vi.fn(),
		readMeterSnapshot: vi.fn(() => emptyMeterSnapshot),
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
	frameTiming: {
		analysis: {
			averageFrameRate: 30,
			frameRateIsConstant: true,
			maxFrameRate: 30,
			medianFrameRate: 30,
			minFrameRate: 30,
			probedPacketCount: 256,
			underlyingFrameRate: 30,
		},
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
