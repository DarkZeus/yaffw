/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	WaveformLane,
	createWaveformLaneIdentityViewModel,
} from "./selection-waveform-lane";

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

	it("emits compact audio mix and preview controls from the lane header", () => {
		const onAudioTrackChannelModeChange = vi.fn();
		const onAudioTrackIncludedChange = vi.fn();
		const onAudioTrackVolumePercentChange = vi.fn();
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
				minimumSelectionDurationUs={33_333}
				onAudioTrackChannelModeChange={onAudioTrackChannelModeChange}
				onAudioTrackIncludedChange={onAudioTrackIncludedChange}
				onAudioTrackVolumePercentChange={onAudioTrackVolumePercentChange}
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

		fireEvent.click(
			screen.getByRole("button", { name: "Exclude Voice from mix" }),
		);
		expect(onAudioTrackIncludedChange).toHaveBeenCalledWith(
			"audio-voice",
			false,
		);

		fireEvent.change(screen.getByLabelText("Voice volume"), {
			target: { value: "37" },
		});
		expect(onAudioTrackVolumePercentChange).toHaveBeenCalledWith(
			"audio-voice",
			37,
		);
		expect(screen.getByText("Keep as recorded")).toBeTruthy();
		expect(screen.getByText("Preparing audio")).toBeTruthy();
		expect(screen.queryByText("Copy left to both")).toBeNull();
		expect(screen.queryByText("Copy right to both")).toBeNull();
		fireEvent.change(screen.getByLabelText("Voice channel fix"), {
			target: { value: "auto-one-sided-stereo" },
		});
		expect(onAudioTrackChannelModeChange).toHaveBeenCalledWith(
			"audio-voice",
			"auto-one-sided-stereo",
		);
		fireEvent.click(screen.getByRole("button", { name: "Solo Voice" }));
		expect(onSoloedAudioTrackChange).toHaveBeenCalledWith("audio-voice");
		expect(screen.getByText("64%")).toBeTruthy();
	});
});
