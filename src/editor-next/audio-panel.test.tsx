/* @vitest-environment jsdom */

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import {
	DEFAULT_OUTPUT_PROFILE,
	type ReadyMediaAsset,
} from "@/editor-core/model";
import { AudioPanel } from "./audio-panel";
import type {
	PreviewMeteringPreparedTrack,
	PreviewMeteringTrackStates,
} from "./preview-metering-preparation.types";

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
			within(voiceStrip).getByLabelText("Voice preview meter"),
		).toBeTruthy();
		expect(
			within(voiceStrip).getByRole("meter", { name: "Left level" }),
		).toBeTruthy();
		expect(within(desktopStrip).getByText("Desktop")).toBeTruthy();
		expect(
			within(desktopStrip).getByLabelText("Desktop preview meter"),
		).toBeTruthy();
		expect(within(combinedStrip).getByText("Combined preview")).toBeTruthy();
		expect(within(combinedStrip).getByText("Monitored output")).toBeTruthy();
		expect(
			within(combinedStrip).getByLabelText("Combined preview output meter"),
		).toBeTruthy();
		expect(within(audioPanel).queryByText("Scaffold")).toBeNull();
		expect(within(combinedStrip).queryByText(/track volume/i)).toBeNull();
		expect(within(combinedStrip).queryByText(/channel handling/i)).toBeNull();
		expect(within(audioPanel).queryByText(/master gain/i)).toBeNull();
		expect(within(audioPanel).queryByText(/master fader/i)).toBeNull();
		expect(within(audioPanel).queryByText(/routing/i)).toBeNull();
		expect(within(audioPanel).queryByText(/bus/i)).toBeNull();
	});

	it("exposes per-track Audio mix and preview monitoring controls", () => {
		const audioMix = createDefaultAudioMix(readyAsset);
		const voiceDecision = audioMix.tracks["audio-voice"];

		if (!voiceDecision) {
			throw new Error("Expected Voice audio decision.");
		}

		voiceDecision.channelMode = "use-left-as-mono";
		voiceDecision.volumePercent = 64;

		const onAudioTrackChannelModeChange = vi.fn();
		const onAudioTrackIncludedChange = vi.fn();
		const onAudioTrackVolumePercentChange = vi.fn();
		const onSoloedAudioTrackChange = vi.fn();

		render(
			<AudioPanel
				asset={readyAsset}
				audioMix={audioMix}
				onAudioTrackChannelModeChange={onAudioTrackChannelModeChange}
				onAudioTrackIncludedChange={onAudioTrackIncludedChange}
				onAudioTrackVolumePercentChange={onAudioTrackVolumePercentChange}
				onSoloedAudioTrackChange={onSoloedAudioTrackChange}
				soloedAudioTrackId="audio-desktop"
			/>,
		);

		const voiceStrip = screen.getByLabelText("Audio track strip Voice");
		const desktopStrip = screen.getByLabelText("Audio track strip Desktop");
		const voiceVolume = within(voiceStrip).getByRole("slider", {
			name: "Voice track volume",
		});
		const voiceChannelHandling = within(voiceStrip).getByLabelText(
			"Voice channel handling",
		);

		expect((voiceVolume as HTMLInputElement).value).toBe("64");
		expect(within(voiceStrip).getByText("64%")).toBeTruthy();
		expect((voiceChannelHandling as HTMLSelectElement).value).toBe(
			"use-left-as-mono",
		);

		fireEvent.change(voiceVolume, { target: { value: "37" } });
		expect(onAudioTrackVolumePercentChange).toHaveBeenCalledWith(
			"audio-voice",
			37,
		);

		fireEvent.change(voiceChannelHandling, {
			target: { value: "auto-one-sided-stereo" },
		});
		expect(onAudioTrackChannelModeChange).toHaveBeenCalledWith(
			"audio-voice",
			"auto-one-sided-stereo",
		);

		fireEvent.click(
			within(voiceStrip).getByRole("button", {
				name: "Exclude Voice from output",
			}),
		);
		expect(onAudioTrackIncludedChange).toHaveBeenCalledWith(
			"audio-voice",
			false,
		);

		fireEvent.click(
			within(voiceStrip).getByRole("button", {
				name: "Solo Voice for preview",
			}),
		);
		expect(onSoloedAudioTrackChange).toHaveBeenCalledWith("audio-voice");

		fireEvent.click(
			within(desktopStrip).getByRole("button", {
				name: "Clear Desktop preview solo",
			}),
		);
		expect(onSoloedAudioTrackChange).toHaveBeenLastCalledWith(null);
	});

	it("renders controlled preview metering ready and preparing states without live peak values yet", () => {
		const previewMetering = {
			trackStates: {
				"audio-desktop": {
					status: "preparing",
					trackId: "audio-desktop",
				},
				"audio-voice": {
					prepared: createPreparedTrack("audio-voice", ["Left", "Right"]),
					status: "ready",
					trackId: "audio-voice",
				},
			} satisfies PreviewMeteringTrackStates,
		};

		render(<AudioPanel asset={readyAsset} previewMetering={previewMetering} />);

		const voiceMeter = screen.getByLabelText("Voice preview meter");
		const voiceStrip = screen.getByLabelText("Audio track strip Voice");
		const desktopMeter = screen.getByLabelText("Desktop preview meter");

		expect(voiceMeter.getAttribute("data-state")).toBe("ready");
		expect(
			within(voiceMeter)
				.getByRole("meter", { name: "Left level" })
				.getAttribute("aria-valuenow"),
		).toBe("-72");
		expect(within(voiceStrip).getByText("Ready")).toBeTruthy();
		expect(desktopMeter.getAttribute("data-state")).toBe("preparing");
		expect(
			within(desktopMeter).getByText("Preparing decoded samples"),
		).toBeTruthy();
	});

	it("keeps unavailable meter layout stable and owns retry outside the reusable meter", () => {
		const onTrackRetry = vi.fn();
		const previewMetering = {
			onTrackRetry,
			trackStates: {
				"audio-desktop": {
					reason: "Desktop decode failed",
					status: "unavailable",
					trackId: "audio-desktop",
				},
				"audio-voice": {
					prepared: createPreparedTrack("audio-voice", ["Left", "Right"]),
					status: "ready",
					trackId: "audio-voice",
				},
			} satisfies PreviewMeteringTrackStates,
		};

		render(
			<AudioPanel
				asset={readyAsset}
				onAudioTrackIncludedChange={() => {}}
				onAudioTrackVolumePercentChange={() => {}}
				previewMetering={previewMetering}
			/>,
		);

		const desktopStrip = screen.getByLabelText("Audio track strip Desktop");
		const desktopMeter = within(desktopStrip).getByLabelText(
			"Desktop preview meter",
		);

		expect(desktopStrip.className).toContain("min-h-40");
		expect(desktopMeter.getAttribute("data-state")).toBe("unavailable");
		expect(
			within(desktopStrip).getByText("Desktop decode failed"),
		).toBeTruthy();
		expect(within(desktopMeter).queryByRole("button")).toBeNull();
		expect(
			within(desktopStrip).getByRole("button", {
				name: "Exclude Desktop from output",
			}),
		).toHaveProperty("disabled", false);
		expect(
			within(desktopStrip).getByRole("slider", {
				name: "Desktop track volume",
			}),
		).toHaveProperty("disabled", false);

		fireEvent.click(
			within(desktopStrip).getByRole("button", {
				name: "Retry Desktop preview meter",
			}),
		);

		expect(onTrackRetry).toHaveBeenCalledWith("audio-desktop");
	});

	it("renders live prepared meter values through the Audio strip", async () => {
		const audioMix = createDefaultAudioMix(readyAsset);
		const voiceDecision = audioMix.tracks["audio-voice"];

		if (!voiceDecision) {
			throw new Error("Expected Voice audio decision.");
		}

		voiceDecision.channelMode = "use-left-as-mono";
		voiceDecision.volumePercent = 50;

		render(
			<AudioPanel
				asset={readyAsset}
				audioMix={audioMix}
				previewMetering={{
					clock: {
						getIsPlaying: () => true,
						getPlayheadUs: () => 100_000,
					},
					trackStates: {
						"audio-voice": {
							prepared: createPreparedTrack("audio-voice", ["Left", "Right"]),
							status: "ready",
							trackId: "audio-voice",
						},
					},
				}}
			/>,
		);

		const voiceMeter = screen.getByLabelText("Voice preview meter");

		await waitFor(() => {
			expect(
				Number(
					within(voiceMeter)
						.getByRole("meter", { name: "Mono level" })
						.getAttribute("aria-valuenow"),
				),
			).toBeCloseTo(-12.04, 2);
		});
		expect(
			within(voiceMeter).queryByRole("meter", { name: "Left level" }),
		).toBeNull();
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

function createPreparedTrack(
	trackId: "audio-voice" | "audio-desktop",
	channelLabels: string[],
): PreviewMeteringPreparedTrack {
	const trackIndex = trackId === "audio-voice" ? 0 : 1;

	return {
		audioBuffer: createTestAudioBuffer(channelLabels.length),
		channelLabels,
		startPositionSeconds: 0,
		track: readyAsset.tracks.audio[trackIndex],
		trackId,
		trackIndex,
	};
}

function createTestAudioBuffer(numberOfChannels: number): AudioBuffer {
	const length = 200;
	const channelData = Array.from(
		{ length: numberOfChannels },
		(_, channelIndex) => {
			const data = new Float32Array(length);
			data[100] = channelIndex === 0 ? 1 : 0.25;
			return data;
		},
	);

	return {
		copyFromChannel(destination, channelNumber, startInChannel = 0) {
			destination.set(
				channelData[channelNumber]?.subarray(
					startInChannel,
					startInChannel + destination.length,
				) ?? new Float32Array(destination.length),
			);
		},
		copyToChannel(source, channelNumber, startInChannel = 0) {
			channelData[channelNumber]?.set(source, startInChannel);
		},
		duration: length / 1_000,
		getChannelData(channelNumber) {
			const data = channelData[channelNumber];

			if (!data) {
				throw new Error(`Missing channel ${channelNumber}.`);
			}

			return data;
		},
		length,
		numberOfChannels,
		sampleRate: 1_000,
	} as AudioBuffer;
}
