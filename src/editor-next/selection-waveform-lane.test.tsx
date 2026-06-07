/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";

import { createWaveformLaneIdentityViewModel } from "./selection-waveform-lane";

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
});
