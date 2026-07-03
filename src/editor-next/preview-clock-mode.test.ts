import { describe, expect, it } from "vitest";

import type { ReadyMediaAsset } from "@/editor-core/model";

import { resolvePreviewClockMode } from "./preview-clock-mode";
import type { BrowserAudioPreviewSourcesState } from "./use-browser-audio-preview-sources.types";

describe("resolvePreviewClockMode", () => {
	it("uses audio-master after preview audio sources and monitoring are ready", () => {
		expect(
			resolvePreviewClockMode({
				asset: readyAssetWithAudio,
				audioMonitoringReady: true,
				audioPreviewSources: readyAudioSourcesState(),
				audioPreviewTransportSupported: true,
			}),
		).toBe("audio-master");
	});

	it("uses audio-master for multi-track assets when preview audio is ready", () => {
		expect(
			resolvePreviewClockMode({
				asset: readyAssetWithTwoAudioTracks,
				audioMonitoringReady: true,
				audioPreviewSources: readyAudioSourcesState(),
				audioPreviewTransportSupported: true,
			}),
		).toBe("audio-master");
	});

	it("keeps audio assets pending while preview audio sources are loading", () => {
		expect(
			resolvePreviewClockMode({
				asset: readyAssetWithAudio,
				audioMonitoringReady: false,
				audioPreviewSources: {
					preparingTrackIds: new Set(["audio-1"]),
					sources: [],
					status: "loading",
				},
				audioPreviewTransportSupported: true,
			}),
		).toBe("audio-master-pending");
	});

	it("keeps audio assets pending while the audio monitoring adapter is not ready", () => {
		expect(
			resolvePreviewClockMode({
				asset: readyAssetWithAudio,
				audioMonitoringReady: false,
				audioPreviewSources: readyAudioSourcesState(),
				audioPreviewTransportSupported: true,
			}),
		).toBe("audio-master-pending");
	});

	it("uses explicit native-video fallback when audio preview preparation fails", () => {
		expect(
			resolvePreviewClockMode({
				asset: readyAssetWithAudio,
				audioMonitoringReady: false,
				audioPreviewSources: {
					failures: [],
					reason: "Audio preview is unavailable.",
					status: "failed",
				},
				audioPreviewTransportSupported: true,
			}),
		).toBe("native-video");
	});

	it("uses explicit native-video fallback for unsupported audio preview transport", () => {
		expect(
			resolvePreviewClockMode({
				asset: readyAssetWithAudio,
				audioMonitoringReady: false,
				audioPreviewSources: { status: "disabled" },
				audioPreviewTransportSupported: false,
			}),
		).toBe("native-video");
	});

	it("uses explicit native-video fallback for media assets without audio", () => {
		expect(
			resolvePreviewClockMode({
				asset: readyAssetWithoutAudio,
				audioMonitoringReady: false,
				audioPreviewSources: { status: "disabled" },
				audioPreviewTransportSupported: false,
			}),
		).toBe("native-video");
	});
});

function readyAudioSourcesState(): BrowserAudioPreviewSourcesState {
	return {
		failures: [],
		sources: [
			{
				blob: new Blob(["audio"], { type: "audio/mp4" }),
				byteLength: 5,
				downloadName: "audio-1.m4a",
				mimeType: "audio/mp4",
				startPositionSeconds: 0,
				strategy: "same-codec-remux",
				track: {
					id: "audio-1",
					kind: "audio",
				},
				trackId: "audio-1",
				trackIndex: 0,
				url: "blob:audio-1",
			},
		],
		status: "ready",
	};
}

const readyAssetWithoutAudio = {
	durationUs: 12_000_000,
	exportCapability: {
		profile: {
			audioCodec: "aac",
			container: "mp4",
			videoCodec: "h264",
		},
		supported: true,
	},
	frameTiming: {
		fps: 30,
		frameDurationUs: 33_333,
		source: "known",
	},
	id: "asset-1",
	label: "clip.mp4",
	provenance: {
		fileName: "clip.mp4",
		mimeType: "video/mp4",
		sizeBytes: 1_024,
	},
	tracks: {
		audio: [],
		video: [
			{
				id: "video-1",
				kind: "video",
			},
		],
	},
} satisfies ReadyMediaAsset;

const readyAssetWithAudio = {
	...readyAssetWithoutAudio,
	tracks: {
		...readyAssetWithoutAudio.tracks,
		audio: [
			{
				codec: "aac",
				id: "audio-1",
				kind: "audio",
				label: "Voice",
			},
		],
	},
} satisfies ReadyMediaAsset;

const readyAssetWithTwoAudioTracks = {
	...readyAssetWithoutAudio,
	tracks: {
		...readyAssetWithoutAudio.tracks,
		audio: [
			{
				codec: "aac",
				id: "audio-1",
				kind: "audio",
				label: "Voice",
			},
			{
				codec: "aac",
				id: "audio-2",
				kind: "audio",
				label: "Desktop",
			},
		],
	},
} satisfies ReadyMediaAsset;
