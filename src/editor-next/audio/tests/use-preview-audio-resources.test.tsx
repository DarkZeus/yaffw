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
	};
});

const preparePreviewAudioResourcesMock = vi.mocked(
	preparePreviewAudioResources,
);
type PrepareRequest = Parameters<typeof preparePreviewAudioResources>[0];

beforeEach(() => {
	preparePreviewAudioResourcesMock.mockReset();
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
			expect(readState()).toBe("ready|resources:audio-1@1,audio-2@1");
		});

		rerender(<PreviewAudioResourcesProbe />);

		await waitFor(() => {
			expect(readState()).toBe("ready|resources:audio-1@1,audio-2@1");
		});
		expect(prepareRuns).toHaveLength(1);

		rerender(<PreviewAudioResourcesProbe />);

		await waitFor(() => {
			expect(readState()).toBe("ready|resources:audio-1@1,audio-2@1");
		});
		expect(prepareRuns).toHaveLength(1);
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
			expect(readState()).toBe("ready|resources:audio-1@1,audio-2@1");
		});

		rerender(<PreviewAudioResourcesProbe asset={expandedAsset} />);

		await waitFor(() => {
			expect(prepareRuns).toHaveLength(2);
		});
		expect(Array.from(prepareRuns[1].request.trackIds ?? [])).toEqual([
			"audio-3",
		]);
		expect(readState()).toBe(
			"loading|preparing:audio-3|resources:audio-1@1,audio-2@1",
		);

		prepareRuns[1].deferred.resolve(
			createPreparedResourcesResult(prepareRuns[1].request),
		);

		await waitFor(() => {
			expect(readState()).toBe("ready|resources:audio-1@1,audio-2@1,audio-3@1");
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

	it("releases cached resources when the active Media asset cleanup scope is disposed", async () => {
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
			expect(readState()).toBe("ready|resources:audio-1@1,audio-2@1");
		});

		cleanupScope.dispose();
		cleanup();
	});

	it("aborts active preparation on cleanup and ignores a late result", async () => {
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

		cleanup();
	});

	it("ignores stale prepared resources after media asset replacement", async () => {
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

		await Promise.resolve();
		expect(readState()).toBe("loading|preparing:audio-1,audio-2|resources:");

		prepareRuns[1].deferred.resolve(
			createPreparedResourcesResult(prepareRuns[1].request),
		);

		await waitFor(() => {
			expect(readState()).toBe("ready|resources:audio-1@1,audio-2@1");
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
			expect(readState()).toBe("ready|resources:audio-1@1");
		});

		fireEvent.click(screen.getByRole("button", { name: "Retry audio-2" }));

		await waitFor(() => {
			expect(prepareRuns).toHaveLength(2);
		});
		expect(Array.from(prepareRuns[1].request.trackIds ?? [])).toEqual([
			"audio-2",
		]);
		expect(readState()).toBe("loading|preparing:audio-2|resources:audio-1@1");

		prepareRuns[1].deferred.resolve({
			failures: [],
			resources: [createPreviewResource({ trackId: "audio-2", trackIndex: 1 })],
		});

		await waitFor(() => {
			expect(readState()).toBe("ready|resources:audio-1@1,audio-2@1");
		});
	});

	it("replaces only an explicitly retried track resource", async () => {
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
				createPreviewResource({
					duration: 2,
					trackId: "audio-2",
					trackIndex: 1,
				}),
			],
		});

		await waitFor(() => {
			expect(readState()).toBe("ready|resources:audio-1@1,audio-2@2");
		});
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
			`resources:${state.resources.map(formatResource).join(",")}`,
		].join("|");
	}

	if (state.status === "ready") {
		return `ready|resources:${state.resources.map(formatResource).join(",")}`;
	}

	return state.status;
}

function readState() {
	return screen.getByLabelText("audio preview state").textContent;
}

function readFailures() {
	return screen.getByLabelText("audio preview failures").textContent;
}

function formatResource(resource: PreviewAudioResource) {
	return `${resource.trackId}@${resource.audioBuffer.duration}`;
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
	duration = 1,
	trackId,
	trackIndex,
}: {
	duration?: number;
	trackId: string;
	trackIndex: number;
}): PreviewAudioResource {
	return {
		audioBuffer: {
			duration,
			length: Math.round(duration * 48_000),
			numberOfChannels: 2,
			sampleRate: 48_000,
		} as AudioBuffer,
		startPositionSeconds: 0,
		track: {
			id: trackId,
			kind: "audio",
		},
		trackId,
		trackIndex,
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
