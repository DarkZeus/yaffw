/* @vitest-environment jsdom */

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	DEFAULT_OUTPUT_PROFILE,
	type ReadyMediaAsset,
} from "@/editor-core/model";
import { preparePreviewMeteringData } from "./preview-metering-preparation";
import type {
	PreviewMeteringPreparationResult,
	PreviewMeteringPreparedTrack,
	PreviewMeteringTrackStates,
} from "./preview-metering-preparation.types";
import { usePreviewMeteringPreparation } from "./use-preview-metering-preparation";

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("usePreviewMeteringPreparation", () => {
	it("prepares per-track metering data from the media source without waveform lane artifacts", async () => {
		const prepare = vi.fn<typeof preparePreviewMeteringData>();
		const firstRun = createDeferred<PreviewMeteringPreparationResult>();
		prepare.mockReturnValueOnce(firstRun.promise);

		render(<PreviewMeteringProbe prepare={prepare} />);

		await waitFor(() => {
			expect(readState()).toBe("audio-voice:preparing|audio-desktop:preparing");
		});
		expect(prepare).toHaveBeenCalledTimes(1);
		const firstRequest = prepare.mock.calls[0][0];
		expect(Object.keys(firstRequest).sort()).toEqual([
			"asset",
			"signal",
			"source",
			"trackIds",
		]);
		expect(Array.from(firstRequest.trackIds ?? [])).toEqual([
			"audio-voice",
			"audio-desktop",
		]);

		firstRun.resolve({
			failures: [
				{
					reason: "Desktop decode failed",
					track: readyAsset.tracks.audio[1],
					trackId: "audio-desktop",
					trackIndex: 1,
				},
			],
			tracks: [createPreparedTrack("audio-voice", ["Left", "Right"])],
		});

		await waitFor(() => {
			expect(readState()).toBe(
				"audio-voice:ready(Left,Right)|audio-desktop:unavailable(Desktop decode failed)",
			);
		});
	});

	it("retries only the requested unavailable track and leaves successful preparations intact", async () => {
		const prepare = vi.fn<typeof preparePreviewMeteringData>();
		const firstRun = createDeferred<PreviewMeteringPreparationResult>();
		const retryRun = createDeferred<PreviewMeteringPreparationResult>();
		prepare
			.mockReturnValueOnce(firstRun.promise)
			.mockReturnValueOnce(retryRun.promise);

		render(<PreviewMeteringProbe prepare={prepare} />);

		await waitFor(() => {
			expect(prepare).toHaveBeenCalledTimes(1);
		});
		firstRun.resolve({
			failures: [
				{
					reason: "Desktop decode failed",
					track: readyAsset.tracks.audio[1],
					trackId: "audio-desktop",
					trackIndex: 1,
				},
			],
			tracks: [createPreparedTrack("audio-voice", ["Left", "Right"])],
		});

		await waitFor(() => {
			expect(readState()).toBe(
				"audio-voice:ready(Left,Right)|audio-desktop:unavailable(Desktop decode failed)",
			);
		});

		fireEvent.click(screen.getByRole("button", { name: "Retry Desktop" }));

		await waitFor(() => {
			expect(prepare).toHaveBeenCalledTimes(2);
		});
		const retryRequest = prepare.mock.calls[1][0];
		expect(Array.from(retryRequest.trackIds ?? [])).toEqual(["audio-desktop"]);
		expect(readState()).toBe(
			"audio-voice:ready(Left,Right)|audio-desktop:preparing",
		);

		retryRun.resolve({
			failures: [],
			tracks: [createPreparedTrack("audio-desktop", ["Ch 1", "Ch 2"])],
		});

		await waitFor(() => {
			expect(readState()).toBe(
				"audio-voice:ready(Left,Right)|audio-desktop:ready(Ch 1,Ch 2)",
			);
		});
	});
});

function PreviewMeteringProbe({
	prepare,
}: {
	prepare: typeof preparePreviewMeteringData;
}) {
	const previewMetering = usePreviewMeteringPreparation({
		asset: readyAsset,
		enabled: true,
		prepare,
		source,
	});

	return (
		<div>
			<output aria-label="preview metering state">
				{formatTrackStates(previewMetering.trackStates)}
			</output>
			<button
				onClick={() => {
					previewMetering.retryTrack("audio-desktop");
				}}
				type="button"
			>
				Retry Desktop
			</button>
		</div>
	);
}

function formatTrackStates(trackStates: PreviewMeteringTrackStates) {
	return readyAsset.tracks.audio
		.map((track) => {
			const state = trackStates[track.id];

			if (!state) {
				return `${track.id}:missing`;
			}

			if (state.status === "ready") {
				return `${track.id}:ready(${state.prepared.channelLabels.join(",")})`;
			}

			if (state.status === "unavailable") {
				return `${track.id}:unavailable(${state.reason})`;
			}

			return `${track.id}:preparing`;
		})
		.join("|");
}

function readState() {
	return screen.getByLabelText("preview metering state").textContent;
}

function createPreparedTrack(
	trackId: "audio-voice" | "audio-desktop",
	channelLabels: string[],
): PreviewMeteringPreparedTrack {
	const trackIndex = trackId === "audio-voice" ? 0 : 1;

	return {
		audioBuffer: {
			length: 1_024,
			numberOfChannels: channelLabels.length,
			sampleRate: 48_000,
		} as unknown as AudioBuffer,
		channelLabels,
		startPositionSeconds: 0,
		track: readyAsset.tracks.audio[trackIndex],
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
		profile: DEFAULT_OUTPUT_PROFILE,
		supported: true,
	},
	frameTiming: {
		fps: 30,
		frameDurationUs: 33_333,
		source: "known",
	},
	id: "asset-with-audio",
	label: "with-audio.mp4",
	provenance: {
		fileName: "with-audio.mp4",
		mimeType: "video/mp4",
		sizeBytes: 5,
	},
	tracks: {
		audio: [
			{
				channels: 2,
				codec: "aac",
				id: "audio-voice",
				kind: "audio",
				label: "Voice",
				language: "eng",
				sampleRate: 48_000,
			},
			{
				codec: "aac",
				id: "audio-desktop",
				kind: "audio",
				label: "Desktop",
				language: "und",
				sampleRate: 48_000,
			},
		],
		video: [
			{
				codec: "avc",
				height: 1080,
				id: "video-main",
				kind: "video",
				label: "Main",
				width: 1920,
			},
		],
	},
} satisfies ReadyMediaAsset;
