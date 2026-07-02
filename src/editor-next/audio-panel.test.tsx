/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
	DEFAULT_OUTPUT_PROFILE,
	type ReadyMediaAsset,
} from "@/editor-core/model";
import { AudioPanel } from "./audio-panel";

afterEach(() => {
	cleanup();
});

describe("AudioPanel", () => {
	it("remains available with a clear empty state for video-only media assets", () => {
		render(<AudioPanel asset={videoOnlyAsset} />);

		const audioPanel = screen.getByLabelText("Audio panel");
		expect(audioPanel.className).toContain("bg-workbench-inspector");
		expect(within(audioPanel).getByText("No audio tracks")).toBeTruthy();
		expect(
			within(audioPanel).getByText(
				"This media asset has no audio tracks available for preview monitoring.",
			),
		).toBeTruthy();
		expect(
			within(audioPanel).queryByLabelText("Combined preview strip"),
		).toBeNull();
	});

	it("renders one per-track strip and one combined preview strip without mixer controls", () => {
		render(<AudioPanel asset={readyAsset} />);

		const audioPanel = screen.getByLabelText("Audio panel");
		const voiceStrip = within(audioPanel).getByLabelText(
			"Audio track strip Voice",
		);
		const desktopStrip = within(audioPanel).getByLabelText(
			"Audio track strip Desktop",
		);
		const combinedStrip = within(audioPanel).getByLabelText(
			"Combined preview strip",
		);

		expect(within(audioPanel).queryByText("No audio tracks")).toBeNull();
		expect(within(voiceStrip).getByText("Voice")).toBeTruthy();
		expect(within(voiceStrip).getByText("AAC / 2 channels / eng")).toBeTruthy();
		expect(
			within(voiceStrip).getByLabelText("Meter scaffold for Voice"),
		).toBeTruthy();
		expect(within(desktopStrip).getByText("Desktop")).toBeTruthy();
		expect(
			within(desktopStrip).getByLabelText("Meter scaffold for Desktop"),
		).toBeTruthy();
		expect(within(combinedStrip).getByText("Combined preview")).toBeTruthy();
		expect(within(combinedStrip).getByText("Monitored output")).toBeTruthy();
		expect(
			within(combinedStrip).getByLabelText(
				"Meter scaffold for combined preview output",
			),
		).toBeTruthy();
		expect(within(combinedStrip).queryByText(/track volume/i)).toBeNull();
		expect(within(combinedStrip).queryByText(/channel handling/i)).toBeNull();
		expect(within(audioPanel).queryByText(/master gain/i)).toBeNull();
		expect(within(audioPanel).queryByText(/master fader/i)).toBeNull();
		expect(within(audioPanel).queryByText(/routing/i)).toBeNull();
		expect(within(audioPanel).queryByText(/bus/i)).toBeNull();
	});
});

const videoOnlyAsset = {
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
	id: "asset-video-only",
	label: "video-only.webm",
	provenance: {
		fileName: "video-only.webm",
		mimeType: "video/webm",
		sizeBytes: 5,
	},
	tracks: {
		audio: [],
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

const readyAsset = {
	...videoOnlyAsset,
	id: "asset-with-audio",
	label: "with-audio.mp4",
	provenance: {
		...videoOnlyAsset.provenance,
		fileName: "with-audio.mp4",
		mimeType: "video/mp4",
	},
	tracks: {
		...videoOnlyAsset.tracks,
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
				channels: 2,
				codec: "aac",
				id: "audio-desktop",
				kind: "audio",
				label: "Desktop",
				language: "und",
				sampleRate: 48_000,
			},
		],
	},
} satisfies ReadyMediaAsset;
