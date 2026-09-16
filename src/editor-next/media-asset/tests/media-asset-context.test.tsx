/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	DEFAULT_OUTPUT_PROFILE,
	type ReadyMediaAsset,
	type Selection,
} from "@/editor-core/model";
import { MediaAssetContextPanel } from "../panel/media-asset-context";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("MediaAssetContextPanel", () => {
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

	it("visibly distinguishes estimated Frame timing in compact and Analysis facts", () => {
		render(
			<MediaAssetContextPanel
				asset={{
					...readyAsset,
					frameTiming: {
						fps: 30,
						frameDurationUs: 33_333,
						reason: "Container metadata did not expose frame timing.",
						source: "estimated",
					},
				}}
				closeFileDisabled={false}
				onCloseFileRequested={() => undefined}
				selection={fullSelection}
			/>,
		);

		expect(screen.getAllByText("30 fps estimated")).toHaveLength(2);
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
