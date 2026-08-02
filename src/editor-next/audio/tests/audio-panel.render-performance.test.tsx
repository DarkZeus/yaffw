/* @vitest-environment jsdom */

import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { AudioPanel } from "../panel/audio-panel";

const buttonRenderStats = vi.hoisted(() => ({
	renderCount: 0,
}));

vi.mock("@/components/ui/button", async () => {
	const React = await import("react");

	type MockButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
		size?: string;
		variant?: string;
	};

	return {
		Button: React.forwardRef<HTMLButtonElement, MockButtonProps>(
			function MockButton(
				{ children, size: _size, variant: _variant, ...props },
				ref,
			) {
				buttonRenderStats.renderCount += 1;

				return React.createElement("button", { ...props, ref }, children);
			},
		),
	};
});

beforeEach(() => {
	buttonRenderStats.renderCount = 0;
	vi.useFakeTimers();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe("AudioPanel live meter render isolation", () => {
	it("updates meter levels without re-rendering static track control buttons", async () => {
		let voicePeak = 0.25;
		const audioMix = createDefaultAudioMix(readyAsset);
		const clock = createMeteringClock(() =>
			createMeterSnapshot({
				combinedPeaks: [voicePeak, voicePeak],
				trackPeaks: {
					"audio-desktop": [0.1, 0.1],
					"audio-voice": [voicePeak, voicePeak],
				},
			}),
		);

		render(
			<PreviewAudioMonitoringProvider assetId={readyAsset.id}>
				<PreviewMeteringProvider asset={readyAsset} audioMix={audioMix}>
					<PreviewMeteringSourceProbe
						source={{ ...clock, retryTrack: () => undefined }}
					/>
					<AudioPanel
						asset={readyAsset}
						audioMix={audioMix}
						onAudioTrackIncludedChange={() => {}}
						onAudioTrackVolumePercentChange={() => {}}
					/>
				</PreviewMeteringProvider>
			</PreviewAudioMonitoringProvider>,
		);

		const voiceMeter = screen.getByLabelText("Voice preview meter");

		expect(
			Number(
				within(voiceMeter)
					.getByRole("meter", { name: "Left level" })
					.getAttribute("aria-valuenow"),
			),
		).toBeCloseTo(-12.04, 2);
		const buttonRenderCountAfterInitialMeters = buttonRenderStats.renderCount;

		voicePeak = 1;
		act(() => {
			vi.advanceTimersByTime(50);
		});
		act(() => {
			vi.advanceTimersByTime(16);
		});

		const updatedLeftPeakDb = Number(
			within(voiceMeter)
				.getByRole("meter", { name: "Left level" })
				.getAttribute("aria-valuenow"),
		);
		expect(updatedLeftPeakDb).toBeGreaterThan(-8);
		expect(updatedLeftPeakDb).not.toBeCloseTo(-12.04, 2);
		expect(buttonRenderStats.renderCount).toBe(
			buttonRenderCountAfterInitialMeters,
		);
	});
});

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
				channels: 2,
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

function createMeteringClock(
	readMeterSnapshot: () => PreviewAudioEngineMeterSnapshot,
): LivePreviewMeteringClock {
	return {
		getIsPlaying: () => true,
		getMeteringStatus: () => "ready",
		readMeterSnapshot,
		subscribeToPlaybackStateChange: () => () => undefined,
	};
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
	trackPeaks: Record<"audio-desktop" | "audio-voice", [number, number]>;
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
