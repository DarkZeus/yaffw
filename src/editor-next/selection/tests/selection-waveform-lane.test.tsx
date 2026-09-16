/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PreviewAudioMonitoringProvider } from "../../audio/engine/preview-audio-monitoring-provider";
import { WaveformLane } from "../waveform/selection-waveform-lane";

afterEach(() => {
	cleanup();
});

describe("WaveformLane", () => {
	it("updates output inclusion and preview solo from lane controls", () => {
		const onAudioTrackIncludedChange = vi.fn();

		render(
			<PreviewAudioMonitoringProvider assetId="asset-with-voice">
				<WaveformLane
					audioDecision={{
						channelMode: "preserve",
						include: true,
						trackId: "audio-voice",
						volumePercent: 64,
					}}
					audioPreviewPreparing={true}
					durationUs={12_000_000}
					lane={{
						status: "loading",
						track: {
							channels: 2,
							codec: "aac",
							id: "audio-voice",
							kind: "audio",
							label: "Voice",
						},
					}}
					laneHeaderWidthPx={168}
					minimumSelectionDurationUs={33_333}
					onAudioTrackIncludedChange={onAudioTrackIncludedChange}
					onPlayheadSeekRequested={() => {}}
					onPointerDown={() => {}}
					onSelectionCommitRequested={() => {}}
					onSelectionPreviewRequested={() => {}}
					selection={{
						endUs: 12_000_000,
						startUs: 0,
					}}
					selectionEditingDisabled={false}
					selectionEditInProgress={false}
					trackIndex={0}
				/>
			</PreviewAudioMonitoringProvider>,
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Exclude Voice from output" }),
		);
		expect(onAudioTrackIncludedChange).toHaveBeenCalledWith(
			"audio-voice",
			false,
		);

		expect(screen.getByText("Preparing audio")).toBeTruthy();
		fireEvent.click(
			screen.getByRole("button", { name: "Solo Voice for preview" }),
		);
		expect(
			screen.getByRole("button", { name: "Clear Voice preview solo" }),
		).toBeTruthy();
	});
});
