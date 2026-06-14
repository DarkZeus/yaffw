/* @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import type {
	AudioMix,
	AudioTrackChannelMode,
	ReadyMediaAsset,
} from "@/editor-core/model";

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
	it("prepares only missing track variants and reuses the recorded source when switching back to preserve", async () => {
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
				"ready|sources:blob:audio-1:preserve,blob:audio-2:preserve",
			);
		});

		rerender(
			<AudioPreviewSourcesProbe
				audioMix={createAudioMix({ "audio-1": "use-left-as-mono" })}
			/>,
		);

		await waitFor(() => {
			expect(readState()).toBe(
				"loading|preparing:audio-1|sources:blob:audio-2:preserve",
			);
		});
		expect(prepareRuns).toHaveLength(2);
		expect(Array.from(prepareRuns[1].request.trackIds ?? [])).toEqual([
			"audio-1",
		]);

		prepareRuns[1].deferred.resolve(
			createPreparedSourcesResult(prepareRuns[1].request),
		);

		await waitFor(() => {
			expect(readState()).toBe(
				"ready|sources:blob:audio-1:use-left-as-mono,blob:audio-2:preserve",
			);
		});

		rerender(<AudioPreviewSourcesProbe audioMix={createAudioMix()} />);

		await waitFor(() => {
			expect(readState()).toBe(
				"ready|sources:blob:audio-1:preserve,blob:audio-2:preserve",
			);
		});
		expect(prepareRuns).toHaveLength(2);
		expect(revokeBrowserAudioPreviewSourcesMock).not.toHaveBeenCalled();
	});
});

function AudioPreviewSourcesProbe({ audioMix }: { audioMix: AudioMix }) {
	const state = useBrowserAudioPreviewSources({
		asset: readyAsset,
		audioMix,
		enabled: true,
		source,
	});

	return <output aria-label="audio preview state">{formatState(state)}</output>;
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
		new Set(readyAsset.tracks.audio.map((track) => track.id));

	return {
		failures: [],
		sources: readyAsset.tracks.audio
			.filter((track) => trackIds.has(track.id))
			.map((track, trackIndex) =>
				createPreviewSource({
					channelMode:
						request.audioMix.tracks[track.id]?.channelMode ?? "preserve",
					trackId: track.id,
					trackIndex,
				}),
			),
	};
}

function createPreviewSource({
	channelMode,
	trackId,
	trackIndex,
}: {
	channelMode: AudioTrackChannelMode;
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
		url: `blob:${trackId}:${channelMode}`,
	};
}

function createAudioMix(
	channelModes: Partial<Record<string, AudioTrackChannelMode>> = {},
) {
	const audioMix = createDefaultAudioMix(readyAsset);

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
