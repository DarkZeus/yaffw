/* @vitest-environment jsdom */

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import type {
	AudioMix,
	AudioTrackChannelMode,
	ReadyMediaAsset,
} from "@/editor-core/model";

import {
	type ActiveMediaAssetCleanupScope,
	createActiveMediaAssetCleanupScopeController,
} from "./active-media-asset-cleanup-scope";
import {
	prepareBrowserAudioPreviewSources,
	revokeBrowserAudioPreviewSources,
} from "./browser-audio-preview-sources";
import type {
	BrowserAudioPreviewSource,
	BrowserAudioPreviewSourcesResult,
} from "./browser-audio-preview-sources.types";
import { useBrowserAudioPreviewSources } from "./use-browser-audio-preview-sources";
import type { BrowserAudioPreviewSourcesState } from "./use-browser-audio-preview-sources.types";

vi.mock("./browser-audio-preview-sources", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("./browser-audio-preview-sources")>();

	return {
		...actual,
		prepareBrowserAudioPreviewSources: vi.fn(),
		revokeBrowserAudioPreviewSources: vi.fn(),
	};
});

const prepareBrowserAudioPreviewSourcesMock = vi.mocked(
	prepareBrowserAudioPreviewSources,
);
const revokeBrowserAudioPreviewSourcesMock = vi.mocked(
	revokeBrowserAudioPreviewSources,
);

type PrepareRequest = Parameters<typeof prepareBrowserAudioPreviewSources>[0];

beforeEach(() => {
	prepareBrowserAudioPreviewSourcesMock.mockReset();
	revokeBrowserAudioPreviewSourcesMock.mockReset();
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("useBrowserAudioPreviewSources", () => {
	it("prepares source tracks once and reuses them across channel decisions", async () => {
		const prepareRuns: Array<{
			deferred: Deferred<BrowserAudioPreviewSourcesResult>;
			request: PrepareRequest;
		}> = [];

		prepareBrowserAudioPreviewSourcesMock.mockImplementation((request) => {
			const deferred = createDeferred<BrowserAudioPreviewSourcesResult>();
			prepareRuns.push({ deferred, request });

			return deferred.promise;
		});

		const { rerender } = render(
			<AudioPreviewSourcesProbe audioMix={createAudioMix()} />,
		);

		await waitFor(() => {
			expect(readState()).toBe("loading|preparing:audio-1,audio-2|sources:");
		});
		expect(prepareRuns).toHaveLength(1);
		expect(Array.from(prepareRuns[0].request.trackIds ?? [])).toEqual([
			"audio-1",
			"audio-2",
		]);

		prepareRuns[0].deferred.resolve(
			createPreparedSourcesResult(prepareRuns[0].request),
		);

		await waitFor(() => {
			expect(readState()).toBe(
				"ready|sources:blob:audio-1:source,blob:audio-2:source",
			);
		});

		rerender(
			<AudioPreviewSourcesProbe
				audioMix={createAudioMix({ "audio-1": "use-left-as-mono" })}
			/>,
		);

		await waitFor(() => {
			expect(readState()).toBe(
				"ready|sources:blob:audio-1:source,blob:audio-2:source",
			);
		});
		expect(prepareRuns).toHaveLength(1);

		rerender(<AudioPreviewSourcesProbe audioMix={createAudioMix()} />);

		await waitFor(() => {
			expect(readState()).toBe(
				"ready|sources:blob:audio-1:source,blob:audio-2:source",
			);
		});
		expect(prepareRuns).toHaveLength(1);
		expect(revokeBrowserAudioPreviewSourcesMock).not.toHaveBeenCalled();
	});

	it("revokes cached sources when the active Media asset cleanup scope is disposed", async () => {
		const controller = createActiveMediaAssetCleanupScopeController();
		const cleanupScope = controller.replaceCurrentScope(readyAsset.id);

		prepareBrowserAudioPreviewSourcesMock.mockImplementation(async (request) =>
			createPreparedSourcesResult(request),
		);

		render(
			<AudioPreviewSourcesProbe
				activeMediaAssetCleanupScope={cleanupScope}
				audioMix={createAudioMix()}
			/>,
		);

		await waitFor(() => {
			expect(readState()).toBe(
				"ready|sources:blob:audio-1:source,blob:audio-2:source",
			);
		});

		cleanupScope.dispose();

		expect(revokeBrowserAudioPreviewSourcesMock).toHaveBeenCalledWith({
			sources: [
				expect.objectContaining({ url: "blob:audio-1:source" }),
				expect.objectContaining({ url: "blob:audio-2:source" }),
			],
		});
	});

	it("revokes stale prepared sources after media asset replacement", async () => {
		const prepareRuns: Array<{
			deferred: Deferred<BrowserAudioPreviewSourcesResult>;
			request: PrepareRequest;
		}> = [];
		const controller = createActiveMediaAssetCleanupScopeController();
		const firstScope = controller.replaceCurrentScope(readyAsset.id);
		const nextAsset = {
			...readyAsset,
			id: "asset-2",
			label: "next.mp4",
			provenance: {
				...readyAsset.provenance,
				fileName: "next.mp4",
			},
		} satisfies ReadyMediaAsset;
		const nextSource = new File(["next"], "next.mp4", { type: "video/mp4" });

		prepareBrowserAudioPreviewSourcesMock.mockImplementation((request) => {
			const deferred = createDeferred<BrowserAudioPreviewSourcesResult>();
			prepareRuns.push({ deferred, request });

			return deferred.promise;
		});

		const { rerender } = render(
			<AudioPreviewSourcesProbe
				activeMediaAssetCleanupScope={firstScope}
				audioMix={createAudioMix()}
			/>,
		);

		await waitFor(() => {
			expect(readState()).toBe("loading|preparing:audio-1,audio-2|sources:");
		});

		const nextScope = controller.replaceCurrentScope(nextAsset.id);
		rerender(
			<AudioPreviewSourcesProbe
				activeMediaAssetCleanupScope={nextScope}
				asset={nextAsset}
				audioMix={createAudioMix({}, nextAsset)}
				source={nextSource}
			/>,
		);

		await waitFor(() => {
			expect(prepareRuns).toHaveLength(2);
		});

		prepareRuns[0].deferred.resolve(
			createPreparedSourcesResult(prepareRuns[0].request),
		);

		await waitFor(() => {
			expect(revokeBrowserAudioPreviewSourcesMock).toHaveBeenCalledWith({
				sources: [
					expect.objectContaining({ url: "blob:audio-1:source" }),
					expect.objectContaining({ url: "blob:audio-2:source" }),
				],
			});
		});
		expect(readState()).toBe("loading|preparing:audio-1,audio-2|sources:");

		prepareRuns[1].deferred.resolve(
			createPreparedSourcesResult(prepareRuns[1].request),
		);

		await waitFor(() => {
			expect(readState()).toBe(
				"ready|sources:blob:audio-1:source,blob:audio-2:source",
			);
		});
	});

	it("retries only the failed requested track while preserving successful cached sources", async () => {
		const prepareRuns: Array<{
			deferred: Deferred<BrowserAudioPreviewSourcesResult>;
			request: PrepareRequest;
		}> = [];
		const failedTrack = readyAsset.tracks.audio[1];

		if (!failedTrack) {
			throw new Error("Expected Desktop audio track.");
		}

		prepareBrowserAudioPreviewSourcesMock.mockImplementation((request) => {
			const deferred = createDeferred<BrowserAudioPreviewSourcesResult>();
			prepareRuns.push({ deferred, request });

			return deferred.promise;
		});

		render(<AudioPreviewSourcesProbe audioMix={createAudioMix()} />);

		await waitFor(() => {
			expect(readState()).toBe("loading|preparing:audio-1,audio-2|sources:");
		});

		prepareRuns[0].deferred.resolve({
			failures: [
				{
					reason: "Desktop source failed",
					track: failedTrack,
					trackId: "audio-2",
					trackIndex: 1,
				},
			],
			sources: [createPreviewSource({ trackId: "audio-1", trackIndex: 0 })],
		});

		await waitFor(() => {
			expect(readState()).toBe("ready|sources:blob:audio-1:source");
		});

		fireEvent.click(screen.getByRole("button", { name: "Retry audio-2" }));

		await waitFor(() => {
			expect(prepareRuns).toHaveLength(2);
		});
		expect(Array.from(prepareRuns[1].request.trackIds ?? [])).toEqual([
			"audio-2",
		]);
		expect(readState()).toBe(
			"loading|preparing:audio-2|sources:blob:audio-1:source",
		);

		prepareRuns[1].deferred.resolve({
			failures: [],
			sources: [createPreviewSource({ trackId: "audio-2", trackIndex: 1 })],
		});

		await waitFor(() => {
			expect(readState()).toBe(
				"ready|sources:blob:audio-1:source,blob:audio-2:source",
			);
		});
		expect(revokeBrowserAudioPreviewSourcesMock).not.toHaveBeenCalled();
	});
});

function AudioPreviewSourcesProbe({
	activeMediaAssetCleanupScope,
	asset = readyAsset,
	audioMix,
	source: sourceBlob = source,
}: {
	activeMediaAssetCleanupScope?: ActiveMediaAssetCleanupScope;
	asset?: ReadyMediaAsset;
	audioMix: AudioMix;
	source?: Blob;
}) {
	const state = useBrowserAudioPreviewSources({
		activeMediaAssetCleanupScope,
		asset,
		audioMix,
		enabled: true,
		source: sourceBlob,
	});

	return (
		<>
			<output aria-label="audio preview state">{formatState(state)}</output>
			<button
				onClick={() => {
					state.retryTrack("audio-2");
				}}
				type="button"
			>
				Retry audio-2
			</button>
		</>
	);
}

function formatState(state: BrowserAudioPreviewSourcesState) {
	if (state.status === "loading") {
		return [
			"loading",
			`preparing:${Array.from(state.preparingTrackIds).join(",")}`,
			`sources:${state.sources.map((source) => source.url).join(",")}`,
		].join("|");
	}

	if (state.status === "ready") {
		return `ready|sources:${state.sources
			.map((source) => source.url)
			.join(",")}`;
	}

	return state.status;
}

function readState() {
	return screen.getByLabelText("audio preview state").textContent;
}

function createPreparedSourcesResult(
	request: PrepareRequest,
): BrowserAudioPreviewSourcesResult {
	const trackIds =
		request.trackIds ??
		new Set(request.asset.tracks.audio.map((track) => track.id));

	return {
		failures: [],
		sources: request.asset.tracks.audio
			.filter((track) => trackIds.has(track.id))
			.map((track, trackIndex) =>
				createPreviewSource({
					trackId: track.id,
					trackIndex,
				}),
			),
	};
}

function createPreviewSource({
	trackId,
	trackIndex,
}: {
	trackId: string;
	trackIndex: number;
}): BrowserAudioPreviewSource {
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
		trackIndex,
		url: `blob:${trackId}:source`,
	};
}

function createAudioMix(
	channelModes: Partial<Record<string, AudioTrackChannelMode>> = {},
	asset: ReadyMediaAsset = readyAsset,
) {
	const audioMix = createDefaultAudioMix(asset);

	for (const [trackId, channelMode] of Object.entries(channelModes)) {
		const decision = audioMix.tracks[trackId];

		if (decision && channelMode) {
			decision.channelMode = channelMode;
		}
	}

	return audioMix;
}

type Deferred<T> = {
	promise: Promise<T>;
	resolve: (value: T) => void;
};

function createDeferred<T>(): Deferred<T> {
	let resolve: (value: T) => void = () => {};
	const promise = new Promise<T>((promiseResolve) => {
		resolve = promiseResolve;
	});

	return {
		promise,
		resolve,
	};
}

const source = new File(["video"], "clip.mp4", { type: "video/mp4" });

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
		video: [
			{
				id: "video-1",
				kind: "video",
			},
		],
	},
} satisfies ReadyMediaAsset;
