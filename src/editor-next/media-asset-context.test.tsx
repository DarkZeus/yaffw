/* @vitest-environment jsdom */

import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	DEFAULT_OUTPUT_PROFILE,
	type ReadyMediaAsset,
	type Selection,
} from "@/editor-core/model";
import { MediaAssetContextPanel } from "./media-asset-context";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("MediaAssetContextPanel", () => {
	it("renders source, media-track, selection, and analytics context for the loaded media asset", () => {
		render(
			<MediaAssetContextPanel
				asset={readyAsset}
				closeFileDisabled={false}
				onCloseFileRequested={() => undefined}
				selection={fullSelection}
			/>,
		);

		const mediaAssetContext = screen.getByLabelText("Media asset context");
		expect(mediaAssetContext.className).toContain("overflow-x-hidden");
		expect(mediaAssetContext.className).toContain("rounded-md");
		expect(mediaAssetContext.className).toContain("bg-workbench-inspector");

		const loadedMediaAsset =
			within(mediaAssetContext).getByLabelText("Loaded media asset");
		expect(within(loadedMediaAsset).getByText("picked.mp4")).toBeTruthy();
		expect(loadedMediaAsset.className).toContain("rounded");

		expect(within(mediaAssetContext).getByText("Source")).toBeTruthy();
		expect(within(mediaAssetContext).getByText("Tracks")).toBeTruthy();
		expect(within(mediaAssetContext).getByText("Selection")).toBeTruthy();
		expect(
			within(mediaAssetContext).queryByText("Workbench intent"),
		).toBeNull();
		expect(
			within(mediaAssetContext).queryByText("Runtime readiness"),
		).toBeNull();
		expect(within(mediaAssetContext).queryByText("Default export")).toBeNull();

		expect(
			within(mediaAssetContext).getAllByText("Size").length,
		).toBeGreaterThanOrEqual(1);
		expect(
			within(mediaAssetContext).getAllByText("5 B").length,
		).toBeGreaterThanOrEqual(1);
		expect(
			within(mediaAssetContext).getAllByText("Duration").length,
		).toBeGreaterThanOrEqual(2);
		expect(
			within(mediaAssetContext).getAllByText("Codec").length,
		).toBeGreaterThanOrEqual(1);
		expect(within(mediaAssetContext).getByText("AVC / AAC")).toBeTruthy();
		expect(
			within(mediaAssetContext).getAllByText("Frames").length,
		).toBeGreaterThanOrEqual(1);
		expect(
			within(mediaAssetContext).getAllByText("30 fps").length,
		).toBeGreaterThanOrEqual(1);
		expect(
			within(mediaAssetContext).getAllByText("Main").length,
		).toBeGreaterThanOrEqual(1);
		expect(within(mediaAssetContext).getByText("1920 x 1080")).toBeTruthy();
		expect(
			within(mediaAssetContext).getAllByText("Voice").length,
		).toBeGreaterThanOrEqual(1);
		expect(
			within(mediaAssetContext).getAllByText("eng").length,
		).toBeGreaterThanOrEqual(1);
		expect(within(mediaAssetContext).getByText("Start")).toBeTruthy();
		expect(within(mediaAssetContext).getByText("End")).toBeTruthy();
		expect(within(mediaAssetContext).getByText("Coverage")).toBeTruthy();
		expect(
			within(mediaAssetContext).getAllByText("00:00:00.000").length,
		).toBeGreaterThan(0);
		expect(
			within(mediaAssetContext).getAllByText("00:00:12.000").length,
		).toBeGreaterThan(0);
		expect(
			within(mediaAssetContext).getAllByText("100%").length,
		).toBeGreaterThanOrEqual(1);

		const mediaAnalytics =
			within(mediaAssetContext).getByLabelText("Media analytics");
		expect(within(mediaAnalytics).getByText("Analytics")).toBeTruthy();
		expect(within(mediaAnalytics).getByText("Source context")).toBeTruthy();
		expect(within(mediaAnalytics).getByText("Video facts")).toBeTruthy();
		expect(within(mediaAnalytics).getByText("Audio facts")).toBeTruthy();
		expect(within(mediaAnalytics).getByText("Selection facts")).toBeTruthy();
		expect(within(mediaAnalytics).getByText("Asset identity")).toBeTruthy();
		expect(within(mediaAnalytics).getByText("Asset coverage")).toBeTruthy();
		expect(within(mediaAnalytics).queryByText("Source file")).toBeNull();
	});

	it("updates selection readouts from the selection prop", () => {
		render(
			<MediaAssetContextPanel
				asset={readyAsset}
				closeFileDisabled={false}
				onCloseFileRequested={() => undefined}
				selection={{
					endUs: 12_000_000,
					startUs: 10_000_000,
				}}
			/>,
		);

		const mediaAssetContext = screen.getByLabelText("Media asset context");
		expect(
			within(mediaAssetContext).getAllByText("00:00:10.000").length,
		).toBeGreaterThan(0);
		expect(
			within(mediaAssetContext).getAllByText("00:00:02.000").length,
		).toBeGreaterThan(0);
		expect(
			within(mediaAssetContext).getAllByText("16.67%").length,
		).toBeGreaterThan(0);
	});

	it("forwards close requests and reflects disabled close state", () => {
		const onCloseFileRequested = vi.fn();

		const { rerender } = render(
			<MediaAssetContextPanel
				asset={readyAsset}
				closeFileDisabled={false}
				onCloseFileRequested={onCloseFileRequested}
				selection={fullSelection}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Close file" }));
		expect(onCloseFileRequested).toHaveBeenCalledTimes(1);

		rerender(
			<MediaAssetContextPanel
				asset={readyAsset}
				closeFileDisabled
				onCloseFileRequested={onCloseFileRequested}
				selection={fullSelection}
			/>,
		);

		expect(
			(screen.getByRole("button", { name: "Close file" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
	});

	it("renders an explicit no-audio track row for video-only media assets", () => {
		render(
			<MediaAssetContextPanel
				asset={videoOnlyAsset}
				closeFileDisabled={false}
				onCloseFileRequested={() => undefined}
				selection={fullSelection}
			/>,
		);

		const mediaAssetContext = screen.getByLabelText("Media asset context");
		expect(within(mediaAssetContext).getByText("Tracks")).toBeTruthy();
		expect(within(mediaAssetContext).getByText("No audio tracks")).toBeTruthy();
		expect(within(mediaAssetContext).getByText("none")).toBeTruthy();
	});
});

const fullSelection = {
	endUs: 12_000_000,
	startUs: 0,
} satisfies Selection;

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
	id: "asset-picked",
	label: "picked.mp4",
	provenance: {
		fileName: "picked.mp4",
		mimeType: "video/mp4",
		sizeBytes: 5,
	},
	tracks: {
		audio: [
			{
				channels: 2,
				codec: "aac",
				id: "audio-main",
				kind: "audio",
				label: "Voice",
				language: "eng",
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

const videoOnlyAsset = {
	...readyAsset,
	id: "asset-video-only",
	label: "video-only.webm",
	provenance: {
		...readyAsset.provenance,
		fileName: "video-only.webm",
		mimeType: "video/webm",
	},
	tracks: {
		...readyAsset.tracks,
		audio: [],
	},
} satisfies ReadyMediaAsset;
