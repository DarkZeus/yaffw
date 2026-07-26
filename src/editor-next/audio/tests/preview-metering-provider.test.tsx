/* @vitest-environment jsdom */

import {
	cleanup,
	fireEvent,
	render,
	screen,
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
import {
	PreviewMeteringProvider,
	type PreviewMeteringSource,
	usePreviewMeteringDisplay,
	usePreviewMeteringSource,
} from "../meters/preview-metering-provider";
import { AudioPanel } from "../panel/audio-panel";

afterEach(() => {
	cleanup();
});

describe("Preview metering ownership", () => {
	it("delivers engine meter states and isolated retry to Audio through the preview-owned interface", () => {
		const retryTrack = vi.fn();
		const source: PreviewMeteringSource = {
			getIsPlaying: () => true,
			getMeteringStatus: () => "degraded",
			readMeterSnapshot: () => meterSnapshot,
			retryTrack,
		};

		render(
			<PreviewAudioMonitoringProvider assetId={readyAsset.id}>
				<PreviewMeteringProvider
					asset={readyAsset}
					audioMix={createDefaultAudioMix(readyAsset)}
				>
					<PreviewMeteringSourceProbe source={source} />
					<AudioPanel asset={readyAsset} />
					<PreviewMeteringRetryProbe trackId="audio-voice" />
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

		fireEvent.click(
			screen.getByRole("button", {
				name: "Retry Desktop preview meter",
			}),
		);

		expect(retryTrack).toHaveBeenCalledTimes(1);
		expect(retryTrack).toHaveBeenCalledWith("audio-desktop");

		fireEvent.click(
			screen.getByRole("button", {
				name: "Request Voice preview meter retry",
			}),
		);

		expect(retryTrack).toHaveBeenCalledTimes(1);
	});
});

function PreviewMeteringSourceProbe({
	source,
}: {
	source: PreviewMeteringSource;
}) {
	usePreviewMeteringSource(source);
	return null;
}

function PreviewMeteringRetryProbe({ trackId }: { trackId: string }) {
	const previewMetering = usePreviewMeteringDisplay();

	return (
		<button
			aria-label="Request Voice preview meter retry"
			onClick={() => {
				previewMetering?.retryTrack?.(trackId);
			}}
			type="button"
		>
			Request retry
		</button>
	);
}

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

const meterSnapshot = {
	combinedState: {
		channels: [
			{ label: "Left", peak: 0.25 },
			{ label: "Right", peak: 0.25 },
		],
		partial: true,
		reason: "One track unavailable",
		status: "ready",
	},
	trackStates: {
		"audio-desktop": {
			reason: "Desktop source failed",
			status: "unavailable",
			trackId: "audio-desktop",
		},
		"audio-voice": {
			channels: [
				{ label: "Left", peak: 0.25 },
				{ label: "Right", peak: 0.25 },
			],
			status: "ready",
			trackId: "audio-voice",
		},
	},
} satisfies PreviewAudioEngineMeterSnapshot;
