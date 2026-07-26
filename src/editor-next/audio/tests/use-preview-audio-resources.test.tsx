/* @vitest-environment jsdom */

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReadyMediaAsset } from "@/editor-core/model";

import {
	type ActiveMediaAssetCleanupScope,
	createActiveMediaAssetCleanupScopeController,
} from "../../media-work/scopes/active-media-asset-cleanup-scope";
import {
	type PreviewAudioResourcesResult,
	preparePreviewAudioResources,
	revokePreviewAudioResources,
} from "../engine/preview-audio-resources";
import {
	type PreviewAudioResourcesState,
	usePreviewAudioResources,
} from "../engine/use-preview-audio-resources";
import type { PreviewAudioResource } from "../types/preview-audio-resources.types";

vi.mock("../engine/preview-audio-resources", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../engine/preview-audio-resources")>();

	return {
		...actual,
		preparePreviewAudioResources: vi.fn(),
		revokePreviewAudioResources: vi.fn(),
	};
});

const preparePreviewAudioResourcesMock = vi.mocked(
	preparePreviewAudioResources,
);
const revokePreviewAudioResourcesMock = vi.mocked(revokePreviewAudioResources);

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
	it("prepares decision-agnostic audio tracks once and reuses them across owner rerenders", async () => {
		const prepareRuns: Array<{
			deferred: Deferred<PreviewAudioResourcesResult>;
			request: PrepareRequest;
		}> = [];

		preparePreviewAudioResourcesMock.mockImplementation((request) => {
			const deferred = createDeferred<PreviewAudioResourcesResult>();
			prepareRuns.push({ deferred, request });

			return deferred.promise;
		});

		const { rerender } = render(<PreviewAudioResourcesProbe />);

		await waitFor(() => {
			expect(readState()).toBe("loading|preparing:audio-1,audio-2|resources:");
		});
		expect(prepareRuns).toHaveLength(1);
		expect(Array.from(prepareRuns[0].request.trackIds ?? [])).toEqual([
			"audio-1",
			"audio-2",
		]);
		expect(prepareRuns[0].request).not.toHaveProperty("audioMix");

		prepareRuns[0].deferred.resolve(
			createPreparedResourcesResult(prepareRuns[0].request),
		);

		await waitFor(() => {
			expect(readState()).toBe(
				"ready|resources:blob:audio-1:resource,blob:audio-2:resource",
			);
		});

		rerender(<PreviewAudioResourcesProbe />);

		await waitFor(() => {
			expect(readState()).toBe(
				"ready|resources:blob:audio-1:resource,blob:audio-2:resource",
			);
		});
		expect(prepareRuns).toHaveLength(1);

		rerender(<PreviewAudioResourcesProbe />);

		await waitFor(() => {
			expect(readState()).toBe(
				"ready|resources:blob:audio-1:resource,blob:audio-2:resource",
			);
		});
		expect(prepareRuns).toHaveLength(1);
		expect(revokePreviewAudioResourcesMock).not.toHaveBeenCalled();
	});

	it("prepares only a newly discovered track for the same Media asset source", async () => {
		const prepareRuns: Array<{
			deferred: Deferred<PreviewAudioResourcesResult>;
			request: PrepareRequest;
		}> = [];
		const expandedAsset = {
			...readyAsset,
			tracks: {
				...readyAsset.tracks,
				audio: [
					...readyAsset.tracks.audio,
					{
						codec: "aac",
						id: "audio-3",
						kind: "audio",
						label: "Music",
					},
				],
			},
		} satisfies ReadyMediaAsset;

		preparePreviewAudioResourcesMock.mockImplementation((request) => {
			const deferred = createDeferred<PreviewAudioResourcesResult>();
			prepareRuns.push({ deferred, request });

			return deferred.promise;
		});

		const { rerender } = render(<PreviewAudioResourcesProbe />);

		await waitFor(() => {
			expect(prepareRuns).toHaveLength(1);
		});
		prepareRuns[0].deferred.resolve(
			createPreparedResourcesResult(prepareRuns[0].request),
		);

		await waitFor(() => {
			expect(readState()).toBe(
				"ready|resources:blob:audio-1:resource,blob:audio-2:resource",
			);
		});

		rerender(<PreviewAudioResourcesProbe asset={expandedAsset} />);

		await waitFor(() => {
			expect(prepareRuns).toHaveLength(2);
		});
		expect(Array.from(prepareRuns[1].request.trackIds ?? [])).toEqual([
			"audio-3",
		]);
		expect(readState()).toBe(
			"loading|preparing:audio-3|resources:blob:audio-1:resource,blob:audio-2:resource",
		);

		prepareRuns[1].deferred.resolve(
			createPreparedResourcesResult(prepareRuns[1].request),
		);

		await waitFor(() => {
			expect(readState()).toBe(
				"ready|resources:blob:audio-1:resource,blob:audio-2:resource,blob:audio-3:resource",
			);
		});
	});

	it("keeps video-only media on the disabled path without preparing resources", () => {
		const videoOnlyAsset = {
			...readyAsset,
			tracks: {
				...readyAsset.tracks,
				audio: [],
			},
		} satisfies ReadyMediaAsset;

		render(
			<PreviewAudioResourcesProbe asset={videoOnlyAsset} enabled={false} />,
		);

		expect(readState()).toBe("disabled");
		expect(preparePreviewAudioResourcesMock).not.toHaveBeenCalled();
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
			/>,
		);

		await waitFor(() => {
			expect(readState()).toBe(
				"ready|resources:blob:audio-1:resource,blob:audio-2:resource",
			);
		});

		cleanupScope.dispose();
		cleanup();

		expect(revokedUrls()).toEqual([
			"blob:audio-1:resource",
			"blob:audio-2:resource",
		]);
	});

	it("aborts active preparation on cleanup and revokes a late result exactly once", async () => {
		const controller = createActiveMediaAssetCleanupScopeController();
		const cleanupScope = controller.replaceCurrentScope(readyAsset.id);
		const deferred = createDeferred<PreviewAudioResourcesResult>();

		preparePreviewAudioResourcesMock.mockImplementation(() => deferred.promise);

		render(
			<PreviewAudioResourcesProbe
				activeMediaAssetCleanupScope={cleanupScope}
			/>,
		);

		await waitFor(() => {
			expect(preparePreviewAudioResourcesMock).toHaveBeenCalledTimes(1);
		});
		const request = preparePreviewAudioResourcesMock.mock.calls[0]?.[0];

		if (!request) {
			throw new Error("Expected an active Preview audio resource request.");
		}

		cleanupScope.dispose();
		expect(request.signal.aborted).toBe(true);

		deferred.resolve({
			failures: [],
			resources: [
				createPreviewResource({ trackId: "audio-1", trackIndex: 0 }),
				createPreviewResource({ trackId: "audio-2", trackIndex: 1 }),
			],
		});

		await waitFor(() => {
			expect(revokedUrls()).toEqual([
				"blob:audio-1:resource",
				"blob:audio-2:resource",
			]);
		});

		cleanup();
		expect(revokedUrls()).toEqual([
			"blob:audio-1:resource",
			"blob:audio-2:resource",
		]);
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
			<PreviewAudioResourcesProbe activeMediaAssetCleanupScope={firstScope} />,
		);

		await waitFor(() => {
			expect(readState()).toBe("loading|preparing:audio-1,audio-2|resources:");
		});

		const nextScope = controller.replaceCurrentScope(nextAsset.id);
		rerender(
			<PreviewAudioResourcesProbe
				activeMediaAssetCleanupScope={nextScope}
				asset={nextAsset}
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

		render(<PreviewAudioResourcesProbe />);

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

	it("replaces only an explicitly retried track resource and revokes each URL once", async () => {
		const prepareRuns: Array<{
			deferred: Deferred<PreviewAudioResourcesResult>;
			request: PrepareRequest;
		}> = [];

		preparePreviewAudioResourcesMock.mockImplementation((request) => {
			const deferred = createDeferred<PreviewAudioResourcesResult>();
			prepareRuns.push({ deferred, request });

			return deferred.promise;
		});

		render(<PreviewAudioResourcesProbe />);

		await waitFor(() => {
			expect(prepareRuns).toHaveLength(1);
		});
		prepareRuns[0].deferred.resolve(
			createPreparedResourcesResult(prepareRuns[0].request),
		);

		await waitFor(() => {
			expect(readState()).toContain("ready|resources:");
		});

		fireEvent.click(screen.getByRole("button", { name: "Retry audio-2" }));

		await waitFor(() => {
			expect(prepareRuns).toHaveLength(2);
		});
		expect(Array.from(prepareRuns[1].request.trackIds ?? [])).toEqual([
			"audio-2",
		]);
		prepareRuns[1].deferred.resolve({
			failures: [],
			resources: [
				{
					...createPreviewResource({ trackId: "audio-2", trackIndex: 1 }),
					url: "blob:audio-2:replacement",
				},
			],
		});

		await waitFor(() => {
			expect(readState()).toBe(
				"ready|resources:blob:audio-1:resource,blob:audio-2:replacement",
			);
		});
		expect(revokedUrls()).toEqual(["blob:audio-2:resource"]);

		cleanup();

		expect(revokedUrls()).toEqual([
			"blob:audio-2:resource",
			"blob:audio-1:resource",
			"blob:audio-2:replacement",
		]);
	});

	it("keeps unrelated track failures visible while retrying one failed track", async () => {
		const prepareRuns: Array<{
			deferred: Deferred<PreviewAudioResourcesResult>;
			request: PrepareRequest;
		}> = [];
		const asset = {
			...readyAsset,
			tracks: {
				...readyAsset.tracks,
				audio: [
					...readyAsset.tracks.audio,
					{
						codec: "aac",
						id: "audio-3",
						kind: "audio",
						label: "Music",
					},
				],
			},
		} satisfies ReadyMediaAsset;

		preparePreviewAudioResourcesMock.mockImplementation((request) => {
			const deferred = createDeferred<PreviewAudioResourcesResult>();
			prepareRuns.push({ deferred, request });

			return deferred.promise;
		});

		const { rerender } = render(<PreviewAudioResourcesProbe asset={asset} />);

		await waitFor(() => {
			expect(prepareRuns).toHaveLength(1);
		});

		prepareRuns[0].deferred.resolve({
			failures: [
				createPreviewFailure(asset, "audio-2"),
				createPreviewFailure(asset, "audio-3"),
			],
			resources: [createPreviewResource({ trackId: "audio-1", trackIndex: 0 })],
		});

		await waitFor(() => {
			expect(readFailures()).toBe("audio-2,audio-3");
		});

		fireEvent.click(screen.getByRole("button", { name: "Retry audio-2" }));

		await waitFor(() => {
			expect(prepareRuns).toHaveLength(2);
		});
		prepareRuns[1].deferred.resolve({
			failures: [],
			resources: [createPreviewResource({ trackId: "audio-2", trackIndex: 1 })],
		});

		await waitFor(() => {
			expect(readFailures()).toBe("audio-3");
		});

		rerender(<PreviewAudioResourcesProbe asset={{ ...asset }} />);

		await waitFor(() => {
			expect(prepareRuns).toHaveLength(2);
		});
	});
});

function PreviewAudioResourcesProbe({
	activeMediaAssetCleanupScope,
	asset = readyAsset,
	enabled = true,
	source: sourceBlob = source,
}: {
	activeMediaAssetCleanupScope?: ActiveMediaAssetCleanupScope;
	asset?: ReadyMediaAsset;
	enabled?: boolean;
	source?: Blob;
}) {
	const state = usePreviewAudioResources({
		activeMediaAssetCleanupScope,
		asset,
		enabled,
		source: sourceBlob,
	});

	return (
		<>
			<output aria-label="audio preview state">{formatState(state)}</output>
			<output aria-label="audio preview failures">
				{state.status === "ready" || state.status === "failed"
					? state.failures.map((failure) => failure.trackId).join(",")
					: ""}
			</output>
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

function readFailures() {
	return screen.getByLabelText("audio preview failures").textContent;
}

function revokedUrls() {
	return revokePreviewAudioResourcesMock.mock.calls.flatMap(([{ resources }]) =>
		resources.map((resource) => resource.url),
	);
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

function createPreviewFailure(asset: ReadyMediaAsset, trackId: string) {
	const trackIndex = asset.tracks.audio.findIndex(
		(track) => track.id === trackId,
	);
	const track = asset.tracks.audio[trackIndex];

	if (!track) {
		throw new Error(`Expected ${trackId} in the test Media asset.`);
	}

	return {
		reason: `${trackId} failed`,
		track,
		trackId,
		trackIndex,
	};
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
