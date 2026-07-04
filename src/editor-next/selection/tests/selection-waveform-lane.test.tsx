/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WaveformLane } from "../waveform/selection-waveform-lane";
import { createWaveformLaneIdentityViewModel } from "../waveform/selection-waveform-lane.identity";

afterEach(() => {
	cleanup();
});

describe("createWaveformLaneIdentityViewModel", () => {
	it("formats waveform lane identity from media-track facts and lane status", () => {
		expect(
			createWaveformLaneIdentityViewModel({
				status: "ready",
				track: {
					channels: 2,
					codec: "aac",
					id: "audio-voice",
					kind: "audio",
					label: "Voice",
					language: "eng",
					sampleRate: 48_000,
				},
				trackIndex: 0,
			}),
		).toEqual({
			metadata: ["AAC", "2 channels"],
			status: {
				label: "Waveform ready",
				tone: "ready",
			},
			title: "Voice",
		});

		expect(
			createWaveformLaneIdentityViewModel({
				status: "loading",
				track: {
					id: "audio-unnamed",
					kind: "audio",
					language: "und",
				},
				trackIndex: 1,
			}),
		).toEqual({
			metadata: ["Codec unknown", "Channels unknown"],
			status: {
				label: "Loading waveform",
				tone: "pending",
			},
			title: "Unnamed audio lane 2",
		});

		expect(
			createWaveformLaneIdentityViewModel({
				status: "unavailable",
				track: {
					channels: 1,
					codec: "opus",
					id: "audio-desktop",
					kind: "audio",
					label: "Desktop",
				},
				trackIndex: 2,
			}),
		).toEqual({
			metadata: ["OPUS", "1 channel"],
			status: {
				label: "Waveform generation failed",
				tone: "unavailable",
			},
			title: "Desktop",
		});
	});

	it("keeps only quick output and preview-solo controls in the lane header", () => {
		const onAudioTrackIncludedChange = vi.fn();
		const onSoloedAudioTrackChange = vi.fn();

		render(
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
				onSoloedAudioTrackChange={onSoloedAudioTrackChange}
				selection={{
					endUs: 12_000_000,
					startUs: 0,
				}}
				selectionEditingDisabled={false}
				selectionEditInProgress={false}
				trackIndex={0}
			/>,
		);

		const laneHeader = screen.getByTestId("waveform-lane-header-audio-voice");
		expect(laneHeader.className).toContain("min-h-14");
		expect(laneHeader.className).not.toContain("min-h-24");
		expect(
			screen.getByLabelText("Seek Voice waveform lane").className,
		).toContain("min-h-14");
		expect(
			screen.getByLabelText("Seek Voice waveform lane").className,
		).not.toContain("min-h-24");

		fireEvent.click(
			screen.getByRole("button", { name: "Exclude Voice from output" }),
		);
		expect(onAudioTrackIncludedChange).toHaveBeenCalledWith(
			"audio-voice",
			false,
		);

		expect(screen.getByText("Preparing audio")).toBeTruthy();
		expect(screen.queryByLabelText("Voice track volume")).toBeNull();
		expect(screen.queryByLabelText("Voice channel handling")).toBeNull();
		expect(screen.queryByText("64%")).toBeNull();
		fireEvent.click(
			screen.getByRole("button", { name: "Solo Voice for preview" }),
		);
		expect(onSoloedAudioTrackChange).toHaveBeenCalledWith("audio-voice");
	});
});
