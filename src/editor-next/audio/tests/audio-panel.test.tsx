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
import type { PreviewAudioEngineMeterSnapshot } from "../engine/preview-audio-engine";
import { PreviewAudioMonitoringProvider } from "../engine/preview-audio-monitoring-provider";
import type { LivePreviewMeteringClock } from "../meters/preview-metering-live";
import {
	PreviewMeteringProvider,
	type PreviewMeteringSource,
	usePreviewMeteringSource,
} from "../meters/preview-metering-provider";
import { AudioPanel, type AudioPanelProps } from "../panel/audio-panel";

afterEach(() => {
	cleanup();
});

describe("AudioPanel", () => {
	it("remains available with a clear empty state for video-only media assets", () => {
		renderAudioPanel({ asset: videoOnlyAsset });

		const audioPanel = screen.getByLabelText("Audio panel");
		expect(audioPanel.className).toContain("bg-workbench-inspector");
		expect(within(audioPanel).getByText("No audio tracks")).toBeTruthy();
		expect(
			within(audioPanel).getByText(
				"This media asset has no audio tracks available for preview monitoring.",
			),
		).toBeTruthy();
		expect(within(audioPanel).queryByLabelText("Master strip")).toBeNull();
	});

	it("renders one per-track strip and one master strip without mixer controls", () => {
		renderAudioPanel({ asset: readyAsset });

		const audioPanel = screen.getByLabelText("Audio panel");
		const voiceStrip = within(audioPanel).getByLabelText(
			"Audio track strip Voice",
		);
		const desktopStrip = within(audioPanel).getByLabelText(
			"Audio track strip Desktop",
		);
		const combinedStrip = within(audioPanel).getByLabelText("Master strip");
		const stripBank = within(audioPanel).getByLabelText(
			"Audio channel strip bank",
		);

		expect(within(audioPanel).queryByText("No audio tracks")).toBeNull();
		expect(stripBank.className).toContain("flex");
		expect(stripBank.className).toContain("w-max");
		expect(stripBank.className).not.toContain("min-w-full");
		expect(voiceStrip.className).toContain("w-32");
		expect(voiceStrip.className).toContain("h-[24rem]");
		expect(combinedStrip.className).toContain("w-28");
		expect(combinedStrip.className).toContain("h-[24rem]");
		expect(within(voiceStrip).getByText("Voice")).toBeTruthy();
		expect(within(voiceStrip).getByText("AAC / 2 channels / eng")).toBeTruthy();
		expect(
			within(voiceStrip).getByLabelText("Voice preview meter"),
		).toBeTruthy();
		const voiceMeterChannels = within(voiceStrip).getByLabelText(
			"Voice preview meter channels",
		);
		expect(
			(voiceMeterChannels.firstElementChild as HTMLElement).style
				.gridTemplateColumns,
		).toBe("repeat(2, 0.7rem)");
		expect(
			within(voiceStrip).getByRole("meter", { name: "Left level" }),
		).toBeTruthy();
		const voiceMeter = within(voiceStrip).getByLabelText("Voice preview meter");
		expect(within(voiceMeter).queryByText("Left")).toBeNull();
		expect(within(voiceMeter).queryByText("Right")).toBeNull();
		expect(within(voiceMeter).getByText("dBFS")).toBeTruthy();
		expect(within(voiceMeter).getByText("0")).toBeTruthy();
		expect(within(voiceMeter).getByText("-4")).toBeTruthy();
		expect(within(voiceMeter).getByText("-90")).toBeTruthy();
		expect(within(desktopStrip).getByText("Desktop")).toBeTruthy();
		expect(
			within(desktopStrip).getByLabelText("Desktop preview meter"),
		).toBeTruthy();
		expect(within(combinedStrip).getByText("Master")).toBeTruthy();
		expect(within(combinedStrip).getByText("Monitored output")).toBeTruthy();
		expect(
			within(combinedStrip).getByLabelText("Master output meter"),
		).toBeTruthy();
		expect(within(audioPanel).queryByText("Scaffold")).toBeNull();
		expect(within(combinedStrip).queryByText(/track volume/i)).toBeNull();
		expect(within(combinedStrip).queryByText(/channel handling/i)).toBeNull();
		expect(within(audioPanel).queryByText(/master gain/i)).toBeNull();
		expect(within(audioPanel).queryByText(/master fader/i)).toBeNull();
		expect(within(audioPanel).queryByText(/routing/i)).toBeNull();
		expect(within(audioPanel).queryByText(/bus/i)).toBeNull();
		expect(within(audioPanel).queryByText("A1")).toBeNull();
		expect(within(audioPanel).queryByText("Mix")).toBeNull();
		expect(within(audioPanel).queryByText("Out")).toBeNull();
		expect(within(audioPanel).queryByText("Solo")).toBeNull();
		expect(within(audioPanel).queryByText("vol")).toBeNull();
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

		renderAudioPanel({
			asset: readyAsset,
			audioMix,
			onAudioTrackChannelModeChange,
			onAudioTrackIncludedChange,
			onAudioTrackVolumePercentChange,
		});

		const voiceStrip = screen.getByLabelText("Audio track strip Voice");
		const desktopStrip = screen.getByLabelText("Audio track strip Desktop");
		const voiceVolume = within(voiceStrip).getByRole("slider", {
			name: "Voice track volume",
		});
		const voiceMeter = within(voiceStrip).getByLabelText("Voice preview meter");
		const voiceControls = within(voiceStrip).getByLabelText(
			"Voice audio controls",
		);
		const voiceChannelHandling = within(voiceStrip).getByLabelText(
			"Voice channel handling",
		);

		expect((voiceVolume as HTMLInputElement).value).toBe("64");
		expect(within(voiceStrip).getByText("64%")).toBeTruthy();
		expect((voiceChannelHandling as HTMLSelectElement).value).toBe(
			"use-left-as-mono",
		);
		expect(
			voiceMeter.compareDocumentPosition(voiceControls) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

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
			within(desktopStrip).getByRole("button", {
				name: "Solo Desktop for preview",
			}),
		);
		expect(
			within(desktopStrip).getByRole("button", {
				name: "Clear Desktop preview solo",
			}),
		).toBeTruthy();

		fireEvent.click(
			within(voiceStrip).getByRole("button", {
				name: "Solo Voice for preview",
			}),
		);
		expect(
			within(voiceStrip).getByRole("button", {
				name: "Clear Voice preview solo",
			}),
		).toBeTruthy();
		expect(
			within(desktopStrip).getByRole("button", {
				name: "Solo Desktop for preview",
			}),
		).toBeTruthy();

		fireEvent.click(
			within(voiceStrip).getByRole("button", {
				name: "Clear Voice preview solo",
			}),
		);
		expect(
			within(voiceStrip).getByRole("button", {
				name: "Solo Voice for preview",
			}),
		).toBeTruthy();
	});

	it("renders controlled preview metering ready and preparing states without live peak values yet", () => {
		const clock = createMeteringClock({
			snapshot: {
				combinedState: {
					channels: [
						{ label: "Left", peak: 0 },
						{ label: "Right", peak: 0 },
					],
					partial: false,
					status: "ready",
				},
				trackStates: {
					"audio-voice": {
						channels: [
							{ label: "Left", peak: 0 },
							{ label: "Right", peak: 0 },
						],
						status: "ready",
						trackId: "audio-voice",
					},
				},
			},
		});

		renderMeteredAudioPanel({
			asset: readyAsset,
			clock,
		});

		const voiceMeter = screen.getByLabelText("Voice preview meter");
		const voiceStrip = screen.getByLabelText("Audio track strip Voice");
		const desktopMeter = screen.getByLabelText("Desktop preview meter");

		expect(voiceMeter.getAttribute("data-state")).toBe("ready");
		expect(
			within(voiceMeter)
				.getByRole("meter", { name: "Left level" })
				.getAttribute("aria-valuenow"),
		).toBe("-90");
		expect(within(voiceMeter).queryByText("Left")).toBeNull();
		expect(within(voiceMeter).queryByText("Right")).toBeNull();
		expect(within(voiceMeter).getByText("-90")).toBeTruthy();
		expect(within(voiceStrip).queryByText("Ready")).toBeNull();
		expect(desktopMeter.getAttribute("data-state")).toBe("preparing");
		expect(
			within(screen.getByLabelText("Audio track strip Desktop")).getByText(
				"Preparing",
			),
		).toBeTruthy();
		expect(
			within(desktopMeter).getByText("Preparing preview meters"),
		).toBeTruthy();
	});

	it("keeps unavailable meter layout stable and owns retry outside the reusable meter", () => {
		const onTrackRetry = vi.fn();
		const clock = createMeteringClock({
			snapshot: {
				combinedState: {
					channels: [
						{ label: "Left", peak: 0 },
						{ label: "Right", peak: 0 },
					],
					partial: true,
					reason:
						"Some monitored tracks are unavailable: Desktop decode failed",
					status: "ready",
				},
				trackStates: {
					"audio-desktop": {
						reason: "Desktop decode failed",
						status: "unavailable",
						trackId: "audio-desktop",
					},
					"audio-voice": {
						channels: [
							{ label: "Left", peak: 0 },
							{ label: "Right", peak: 0 },
						],
						status: "ready",
						trackId: "audio-voice",
					},
				},
			},
		});

		renderMeteredAudioPanel({
			asset: readyAsset,
			clock,
			onAudioTrackIncludedChange: () => {},
			onAudioTrackVolumePercentChange: () => {},
			onTrackRetry,
		});

		const desktopStrip = screen.getByLabelText("Audio track strip Desktop");
		const desktopMeter = within(desktopStrip).getByLabelText(
			"Desktop preview meter",
		);

		expect(desktopStrip.className).toContain("h-[24rem]");
		expect(desktopMeter.getAttribute("data-state")).toBe("unavailable");
		expect(
			within(desktopStrip).getByText("Desktop decode failed"),
		).toBeTruthy();
		expect(within(desktopStrip).getByText("Unavailable")).toBeTruthy();
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

		renderMeteredAudioPanel({
			asset: readyAsset,
			audioMix,
			clock: createMeteringClock({
				snapshot: createMeterSnapshot({
					combinedPeaks: [0.25, 0.25],
					trackPeaks: {
						"audio-voice": [0.25, 0.25],
					},
				}),
			}),
		});

		const voiceMeter = screen.getByLabelText("Voice preview meter");

		await waitFor(() => {
			expect(
				Number(
					within(voiceMeter)
						.getByRole("meter", { name: "Left level" })
						.getAttribute("aria-valuenow"),
				),
			).toBeCloseTo(-12.04, 2);
		});
		expect(
			Number(
				within(voiceMeter)
					.getByRole("meter", { name: "Right level" })
					.getAttribute("aria-valuenow"),
			),
		).toBeCloseTo(-12.04, 2);
	});

	it("renders live combined Preview output meter values as stereo channels", async () => {
		renderMeteredAudioPanel({
			asset: readyAsset,
			clock: createMeteringClock({
				snapshot: createMeterSnapshot({
					combinedPeaks: [1, 0.5],
					trackPeaks: {
						"audio-desktop": [0.5, 0.25],
						"audio-voice": [0.5, 0.25],
					},
				}),
			}),
		});

		const combinedStrip = screen.getByLabelText("Master strip");
		const combinedMeter = within(combinedStrip).getByLabelText(
			"Master output meter",
		);

		await waitFor(() => {
			expect(
				Number(
					within(combinedMeter)
						.getByRole("meter", { name: "Left level" })
						.getAttribute("aria-valuenow"),
				),
			).toBe(0);
		});
		expect(
			Number(
				within(combinedMeter)
					.getByRole("meter", { name: "Right level" })
					.getAttribute("aria-valuenow"),
			),
		).toBeCloseTo(-6.02, 2);
		expect(within(combinedStrip).queryByText("Ready")).toBeNull();
		expect(within(combinedStrip).queryByText(/track volume/i)).toBeNull();
		expect(within(combinedStrip).queryByText(/channel handling/i)).toBeNull();
		expect(within(combinedStrip).queryByText(/master gain/i)).toBeNull();
		expect(within(combinedStrip).queryByText(/master fader/i)).toBeNull();
		expect(within(combinedStrip).queryByText(/routing/i)).toBeNull();
	});

	it("shows a partial master output meter when an audible track is unavailable without blocking track controls", async () => {
		const onAudioTrackIncludedChange = vi.fn();
		const onAudioTrackVolumePercentChange = vi.fn();

		renderMeteredAudioPanel({
			asset: readyAsset,
			clock: createMeteringClock({
				snapshot: {
					combinedState: {
						channels: [
							{ label: "Left", peak: 0.5 },
							{ label: "Right", peak: 0 },
						],
						partial: true,
						reason:
							"Some monitored tracks are unavailable: Desktop decode failed",
						status: "ready",
					},
					trackStates: {
						"audio-desktop": {
							reason: "Desktop decode failed",
							status: "unavailable",
							trackId: "audio-desktop",
						},
						"audio-voice": {
							channels: [
								{ label: "Left", peak: 0.5 },
								{ label: "Right", peak: 0 },
							],
							status: "ready",
							trackId: "audio-voice",
						},
					},
				},
			}),
			onAudioTrackIncludedChange,
			onAudioTrackVolumePercentChange,
		});

		const combinedStrip = screen.getByLabelText("Master strip");
		const combinedMeter = within(combinedStrip).getByLabelText(
			"Master output meter",
		);
		const desktopStrip = screen.getByLabelText("Audio track strip Desktop");

		await waitFor(() => {
			expect(within(combinedStrip).getByText("Partial")).toBeTruthy();
		});
		expect(combinedMeter.getAttribute("data-state")).toBe("ready");
		expect(
			within(combinedStrip).getByText(
				"Some monitored tracks are unavailable: Desktop decode failed",
			),
		).toBeTruthy();
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

function createMeteringClock({
	isPlaying = true,
	snapshot,
	status = "ready",
}: {
	isPlaying?: boolean;
	snapshot: PreviewAudioEngineMeterSnapshot | null;
	status?: ReturnType<LivePreviewMeteringClock["getMeteringStatus"]>;
}): LivePreviewMeteringClock {
	return {
		getIsPlaying: () => isPlaying,
		getMeteringStatus: () => status,
		readMeterSnapshot: () => snapshot,
	};
}

function renderMeteredAudioPanel({
	clock,
	onTrackRetry = () => undefined,
	...panelProps
}: AudioPanelProps & {
	clock: LivePreviewMeteringClock;
	onTrackRetry?: (trackId: string) => void;
}) {
	const audioMix =
		panelProps.audioMix ?? createDefaultAudioMix(panelProps.asset);
	const source: PreviewMeteringSource = {
		...clock,
		retryTrack: onTrackRetry,
	};

	return render(
		<PreviewAudioMonitoringProvider assetId={panelProps.asset.id}>
			<PreviewMeteringProvider asset={panelProps.asset} audioMix={audioMix}>
				<PreviewMeteringSourceProbe source={source} />
				<AudioPanel {...panelProps} />
			</PreviewMeteringProvider>
		</PreviewAudioMonitoringProvider>,
	);
}

function renderAudioPanel(panelProps: AudioPanelProps) {
	return render(
		<PreviewAudioMonitoringProvider assetId={panelProps.asset.id}>
			<AudioPanel {...panelProps} />
		</PreviewAudioMonitoringProvider>,
	);
}

function PreviewMeteringSourceProbe({
	source,
}: {
	source: PreviewMeteringSource;
}) {
	usePreviewMeteringSource(source);
	return null;
}

function createMeterSnapshot({
	combinedPeaks,
	trackPeaks,
}: {
	combinedPeaks: [number, number];
	trackPeaks: Partial<
		Record<"audio-voice" | "audio-desktop", [number, number]>
	>;
}): PreviewAudioEngineMeterSnapshot {
	return {
		combinedState: {
			channels: createMeterChannels(combinedPeaks),
			partial: false,
			status: "ready",
		},
		trackStates: Object.fromEntries(
			Object.entries(trackPeaks).map(([trackId, peaks]) => [
				trackId,
				{
					channels: createMeterChannels(peaks),
					status: "ready",
					trackId,
				},
			]),
		),
	};
}

function createMeterChannels(peaks: [number, number]) {
	return [
		{ label: "Left", peak: peaks[0] },
		{ label: "Right", peak: peaks[1] },
	];
}
