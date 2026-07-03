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
	preparePreviewAudioResources,
	revokePreviewAudioResources,
} from "./preview-audio-resources";
import type {
	PreviewAudioResource,
	PreviewAudioResourcesResult,
} from "./preview-audio-resources.types";
import { usePreviewAudioResources } from "./use-preview-audio-resources";
import type { PreviewAudioResourcesState } from "./use-preview-audio-resources.types";

vi.mock("./preview-audio-resources", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("./preview-audio-resources")>();

	return {
		...actual,
		preparePreviewAudioResources: vi.fn(),
		revokePreviewAudioResources: vi.fn(),
	};
});

const preparePreviewAudioResourcesMock = vi.mocked(
	preparePreviewAudioResources,
);
const revokePreviewAudioResourcesMock = vi.mocked(
	revokePreviewAudioResources,
);

type PrepareRequest = Parameters<typeof preparePreviewAudioResources>[0];

beforeEach(() => {
	preparePreviewAudioResourcesMock.mockReset();
	revokePreviewAudioResourcesMock.mockReset();
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("usePreviewAudioResources", () => {
	it("prepares audio tracks once and reuses them across channel decisions", async () => {
		const prepareRuns: Array<{
			deferred: Deferred<PreviewAudioResourcesResult>;
			request: PrepareRequest;
		}> = [];

		preparePreviewAudioResourcesMock.mockImplementation((request) => {
			const deferred = createDeferred<PreviewAudioResourcesResult>();
			prepareRuns.push({ deferred, request });

			return deferred.promise;
		});

		const { rerender } = render(
			<PreviewAudioResourcesProbe audioMix={createAudioMix()} />,
		);

		await waitFor(() => {
			expect(readState()).toBe("loading|preparing:audio-1,audio-2|resources:");
		});
		expect(prepareRuns).toHaveLength(1);
		expect(Array.from(prepareRuns[0].request.trackIds ?? [])).toEqual([
			"audio-1",
			"audio-2",
		]);

		prepareRuns[0].deferred.resolve(
			createPreparedResourcesResult(prepareRuns[0].request),
		);

		await waitFor(() => {
			expect(readState()).toBe(
				"ready|resources:blob:audio-1:resource,blob:audio-2:resource",
			);
		});

		rerender(
			<PreviewAudioResourcesProbe
				audioMix={createAudioMix({ "audio-1": "use-left-as-mono" })}
			/>,
		);

		await waitFor(() => {
			expect(readState()).toBe(
				"ready|resources:blob:audio-1:resource,blob:audio-2:resource",
			);
		});
		expect(prepareRuns).toHaveLength(1);

		rerender(<PreviewAudioResourcesProbe audioMix={createAudioMix()} />);

		await waitFor(() => {
			expect(readState()).toBe(
				"ready|resources:blob:audio-1:resource,blob:audio-2:resource",
			);
		});
		expect(prepareRuns).toHaveLength(1);
		expect(revokePreviewAudioResourcesMock).not.toHaveBeenCalled();
	});

	it("revokes cached resources when the active Media asset cleanup scope is disposed", async () => {
		const controller = createActiveMediaAssetCleanupScopeController();
		const cleanupScope = controller.replaceCurrentScope(readyAsset.id);

		preparePreviewAudioResourcesMock.mockImplementation(async (request) =>
			createPreparedResourcesResult(request),
		);

		render(
			<PreviewAudioResourcesProbe
				activeMediaAssetCleanupScope={cleanupScope}
				audioMix={createAudioMix()}
			/>,
		);

		await waitFor(() => {
			expect(readState()).toBe(
				"ready|resources:blob:audio-1:resource,blob:audio-2:resource",
			);
		});

		cleanupScope.dispose();

		expect(revokePreviewAudioResourcesMock).toHaveBeenCalledWith({
			resources: [
				expect.objectContaining({ url: "blob:audio-1:resource" }),
				expect.objectContaining({ url: "blob:audio-2:resource" }),
			],
		});
	});

	it("revokes stale prepared resources after media asset replacement", async () => {
		const prepareRuns: Array<{
			deferred: Deferred<PreviewAudioResourcesResult>;
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

		preparePreviewAudioResourcesMock.mockImplementation((request) => {
			const deferred = createDeferred<PreviewAudioResourcesResult>();
			prepareRuns.push({ deferred, request });

			return deferred.promise;
		});

		const { rerender } = render(
			<PreviewAudioResourcesProbe
				activeMediaAssetCleanupScope={firstScope}
				audioMix={createAudioMix()}
			/>,
		);

		await waitFor(() => {
			expect(readState()).toBe("loading|preparing:audio-1,audio-2|resources:");
		});

		const nextScope = controller.replaceCurrentScope(nextAsset.id);
		rerender(
			<PreviewAudioResourcesProbe
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
			createPreparedResourcesResult(prepareRuns[0].request),
		);

		await waitFor(() => {
			expect(revokePreviewAudioResourcesMock).toHaveBeenCalledWith({
				resources: [
					expect.objectContaining({ url: "blob:audio-1:resource" }),
					expect.objectContaining({ url: "blob:audio-2:resource" }),
				],
			});
		});
		expect(readState()).toBe("loading|preparing:audio-1,audio-2|resources:");

		prepareRuns[1].deferred.resolve(
			createPreparedResourcesResult(prepareRuns[1].request),
		);

		await waitFor(() => {
			expect(readState()).toBe(
				"ready|resources:blob:audio-1:resource,blob:audio-2:resource",
			);
		});
	});

	it("retries only the failed requested track while preserving successful cached resources", async () => {
		const prepareRuns: Array<{
			deferred: Deferred<PreviewAudioResourcesResult>;
			request: PrepareRequest;
		}> = [];
		const failedTrack = readyAsset.tracks.audio[1];

		if (!failedTrack) {
			throw new Error("Expected Desktop audio track.");
		}

		preparePreviewAudioResourcesMock.mockImplementation((request) => {
			const deferred = createDeferred<PreviewAudioResourcesResult>();
			prepareRuns.push({ deferred, request });

			return deferred.promise;
		});

		render(<PreviewAudioResourcesProbe audioMix={createAudioMix()} />);

		await waitFor(() => {
			expect(readState()).toBe("loading|preparing:audio-1,audio-2|resources:");
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
			resources: [createPreviewResource({ trackId: "audio-1", trackIndex: 0 })],
		});

		await waitFor(() => {
			expect(readState()).toBe("ready|resources:blob:audio-1:resource");
		});

		fireEvent.click(screen.getByRole("button", { name: "Retry audio-2" }));

		await waitFor(() => {
			expect(prepareRuns).toHaveLength(2);
		});
		expect(Array.from(prepareRuns[1].request.trackIds ?? [])).toEqual([
			"audio-2",
		]);
		expect(readState()).toBe(
			"loading|preparing:audio-2|resources:blob:audio-1:resource",
		);

		prepareRuns[1].deferred.resolve({
			failures: [],
			resources: [createPreviewResource({ trackId: "audio-2", trackIndex: 1 })],
		});

		await waitFor(() => {
			expect(readState()).toBe(
				"ready|resources:blob:audio-1:resource,blob:audio-2:resource",
			);
		});
		expect(revokePreviewAudioResourcesMock).not.toHaveBeenCalled();
	});
});

function PreviewAudioResourcesProbe({
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
	const state = usePreviewAudioResources({
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

function formatState(state: PreviewAudioResourcesState) {
	if (state.status === "loading") {
		return [
			"loading",
			`preparing:${Array.from(state.preparingTrackIds).join(",")}`,
			`resources:${state.resources.map((resource) => resource.url).join(",")}`,
		].join("|");
	}

	if (state.status === "ready") {
		return `ready|resources:${state.resources
			.map((resource) => resource.url)
			.join(",")}`;
	}

	return state.status;
}

function readState() {
	return screen.getByLabelText("audio preview state").textContent;
}

function createPreparedResourcesResult(
	request: PrepareRequest,
): PreviewAudioResourcesResult {
	const trackIds =
		request.trackIds ??
		new Set(request.asset.tracks.audio.map((track) => track.id));

	return {
		failures: [],
		resources: request.asset.tracks.audio
			.filter((track) => trackIds.has(track.id))
			.map((track, trackIndex) =>
				createPreviewResource({
					trackId: track.id,
					trackIndex,
				}),
			),
	};
}

function createPreviewResource({
	trackId,
	trackIndex,
}: {
	trackId: string;
	trackIndex: number;
}): PreviewAudioResource {
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
		url: `blob:${trackId}:resource`,
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
