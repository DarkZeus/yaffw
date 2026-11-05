/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	DEFAULT_OUTPUT_PROFILE,
	type FrameTiming,
	type ReadyMediaAsset,
	type Selection,
} from "@/editor-core/model";
import { MediaAssetContextPanel } from "../panel/media-asset-context";

const constantAnalysis = {
	underlyingFrameRate: 30,
	frameRateIsConstant: true,
	probedPacketCount: 256,
	minFrameRate: 30,
	maxFrameRate: 30,
	averageFrameRate: 30,
	medianFrameRate: 30,
};

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

	it("shows unavailable analysis as a 30 fps fallback with its reason", () => {
		render(
			<MediaAssetContextPanel
				asset={{
					...readyAsset,
					frameTiming: {
						analysis: null,
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

		expect(screen.getAllByText("30 fps fallback")).toHaveLength(2);
		expect(
			screen.getByText("Container metadata did not expose frame timing."),
		).toBeTruthy();
		expect(
			screen.getByText("30 fps fallback; analysis unavailable"),
		).toBeTruthy();
		expect(screen.queryByText("Observed rates")).toBeNull();
	});

	it.each([
		{
			label: "variable frame rate with a non-30 intended estimate",
			timing: {
				analysis: {
					...constantAnalysis,
					underlyingFrameRate: null,
					frameRateIsConstant: false,
					minFrameRate: 15,
					maxFrameRate: 31,
					averageFrameRate: 22,
					medianFrameRate: 23,
				},
				fps: 23,
				frameDurationUs: 43_478,
				source: "estimated",
				reason:
					"No consistent underlying frame rate was detected in the probe.",
			} satisfies FrameTiming,
			compact: "23 fps estimated",
			underlying: "Not detected",
			spacing: "Variable in probe",
			range: "15–31 fps",
			averages: "22 / 23 fps",
			coverage: "256 packets (target 256)",
		},
		{
			label: "dropped-frame CFR with a detected underlying rate",
			timing: {
				analysis: {
					...constantAnalysis,
					frameRateIsConstant: false,
					minFrameRate: 15,
					averageFrameRate: 25,
				},
				fps: 30,
				frameDurationUs: 33_333,
				source: "known",
			} satisfies FrameTiming,
			compact: "30 fps · variable",
			underlying: "30 fps detected",
			spacing: "Variable in probe",
			range: "15–30 fps",
			averages: "25 / 30 fps",
			coverage: "256 packets (target 256)",
		},
		{
			label: "fractional rate with a short constant probe",
			timing: {
				analysis: {
					underlyingFrameRate: 30_000 / 1_001,
					frameRateIsConstant: true,
					minFrameRate: 30_000 / 1_001,
					maxFrameRate: 30_000 / 1_001,
					averageFrameRate: 30_000 / 1_001,
					medianFrameRate: 30_000 / 1_001,
					probedPacketCount: 12,
				},
				fps: 30_000 / 1_001,
				frameDurationUs: 33_367,
				source: "known",
			} satisfies FrameTiming,
			compact: "29.97 fps",
			underlying: "29.97 fps detected",
			spacing: "Constant in probe",
			range: "29.97–29.97 fps",
			averages: "29.97 / 29.97 fps",
			coverage: "12 packets (limited; target 256)",
		},
	])(
		"exposes confidence, spacing and probe coverage for $label",
		({ timing, compact, underlying, spacing, range, averages, coverage }) => {
			render(
				<MediaAssetContextPanel
					asset={{ ...readyAsset, frameTiming: timing }}
					closeFileDisabled={false}
					onCloseFileRequested={() => undefined}
					selection={fullSelection}
				/>,
			);
			expect(screen.getAllByText(compact)).toHaveLength(2);
			const analysis = screen.getByLabelText("Frame timing analysis");
			for (const value of [underlying, spacing, range, averages, coverage]) {
				expect(within(analysis).getByText(value)).toBeTruthy();
			}
			expect(
				within(analysis).getByText(
					"Sampled timestamps; whole-file timing may differ.",
				),
			).toBeTruthy();
			expect(
				within(analysis).getByText(
					"Nominal time steps; variable spacing may skip or repeat frames.",
				),
			).toBeTruthy();
			if (timing.source === "estimated")
				expect(within(analysis).getByText(timing.reason)).toBeTruthy();
		},
	);

	it("shows declared track bitrates in Analysis facts", () => {
		render(
			<MediaAssetContextPanel
				asset={{
					...readyAsset,
					tracks: {
						audio: [{ ...readyAsset.tracks.audio[0], bitrate: 192_000 }],
						video: [{ ...readyAsset.tracks.video[0], bitrate: 8_500_000 }],
					},
				}}
				closeFileDisabled={false}
				onCloseFileRequested={() => undefined}
				selection={fullSelection}
			/>,
		);

		expect(screen.getByText("8.5 Mbps")).toBeTruthy();
		expect(screen.getByText("192 kbps")).toBeTruthy();
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
		analysis: constantAnalysis,
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
