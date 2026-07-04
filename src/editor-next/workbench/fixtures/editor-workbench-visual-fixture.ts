import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import type { ReadyMediaAsset } from "@/editor-core/model";
import type { RuntimeSupport } from "@/editor-core/runtime-capabilities";
import type { EditorWorkbenchVisualFixture } from "../types/editor-workbench-visual-fixture.types";

export const EDITOR_WORKBENCH_VISUAL_FIXTURE_PREVIEW_POSTER_SRC =
	"/editor-workbench-prototype-frame.jpg";

export function createEditorWorkbenchVisualFixture(
	runtime: RuntimeSupport,
): EditorWorkbenchVisualFixture {
	const asset: ReadyMediaAsset = {
		durationUs: 13_500_000,
		exportCapability: {
			profile: {
				audioCodec: "aac",
				container: "mp4",
				videoCodec: "h264",
			},
			supported: true,
		},
		frameTiming: {
			fps: 60,
			frameDurationUs: 16_667,
			source: "known",
		},
		id: "asset-editor-next-visual-fixture",
		label: "stalker-patch-1.5-teaser.mp4",
		provenance: {
			fileName: "stalker-patch-1.5-teaser.mp4",
			mimeType: "video/mp4",
			sizeBytes: 30_000_000,
		},
		tracks: {
			audio: [
				{
					channels: 2,
					codec: "aac",
					id: "audio-fixture-voice",
					kind: "audio",
					label: "Voice",
					language: "en",
					sampleRate: 48_000,
				},
				{
					channels: 2,
					codec: "aac",
					id: "audio-fixture-desktop",
					kind: "audio",
					label: "Desktop",
					language: "und",
					sampleRate: 48_000,
				},
			],
			video: [
				{
					codec: "h264",
					height: 2160,
					id: "video-fixture-main",
					kind: "video",
					label: "Video 1",
					width: 3840,
				},
			],
		},
	};

	return {
		session: {
			asset,
			audioMix: createDefaultAudioMix(asset),
			export: {
				status: "reviewing",
			},
			importEnabled: false,
			runtime,
			selection: {
				endUs: 9_860_000,
				startUs: 2_440_000,
			},
			status: "ready",
		},
		source: new Blob(["editor-next visual fixture"], {
			type: "video/mp4",
		}),
	};
}

export function shouldUseEditorWorkbenchVisualFixtureFromUrl(
	search = typeof window === "undefined" ? "" : window.location.search,
): boolean {
	return new URLSearchParams(search).get("mockUploadedMedia") === "1";
}
