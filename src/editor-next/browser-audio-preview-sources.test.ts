import { describe, expect, it, vi } from "vitest";

import {
	remuxCandidatesForAudioPreviewCodec,
	revokeBrowserAudioPreviewSources,
	shouldPrepareTransformedAudioPreviewSource,
} from "./browser-audio-preview-sources";
import type { BrowserAudioPreviewSource } from "./browser-audio-preview-sources.types";

describe("remuxCandidatesForAudioPreviewCodec", () => {
	it("prefers fast browser-playable audio containers by codec", () => {
		expect(
			remuxCandidatesForAudioPreviewCodec("aac").map(
				(candidate) => candidate.label,
			),
		).toEqual(["audio-only-mp4", "adts-aac"]);
		expect(
			remuxCandidatesForAudioPreviewCodec("mp3").map(
				(candidate) => candidate.label,
			),
		).toEqual(["mp3", "audio-only-mp4"]);
		expect(
			remuxCandidatesForAudioPreviewCodec("opus").map(
				(candidate) => candidate.label,
			),
		).toEqual(["audio-only-webm", "ogg"]);
		expect(
			remuxCandidatesForAudioPreviewCodec("pcm-s16").map(
				(candidate) => candidate.label,
			),
		).toEqual(["wav-same-codec"]);
		expect(remuxCandidatesForAudioPreviewCodec(null)).toEqual([]);
	});
});

describe("shouldPrepareTransformedAudioPreviewSource", () => {
	it("uses decoded preview sources for explicit channel fixes, including auto-fix", () => {
		expect(shouldPrepareTransformedAudioPreviewSource("preserve")).toBe(false);
		expect(
			shouldPrepareTransformedAudioPreviewSource("auto-one-sided-stereo"),
		).toBe(true);
		expect(shouldPrepareTransformedAudioPreviewSource("use-left-as-mono")).toBe(
			true,
		);
	});
});

describe("revokeBrowserAudioPreviewSources", () => {
	it("revokes every prepared object URL", () => {
		const revokeObjectURL = vi.fn();

		revokeBrowserAudioPreviewSources({
			revokeObjectURL,
			sources: [
				createPreviewSource("blob:track-1"),
				createPreviewSource("blob:track-2"),
			],
		});

		expect(revokeObjectURL).toHaveBeenCalledWith("blob:track-1");
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:track-2");
	});
});

function createPreviewSource(url: string): BrowserAudioPreviewSource {
	return {
		blob: new Blob(["audio"], { type: "audio/mp4" }),
		byteLength: 5,
		downloadName: "track.m4a",
		mimeType: "audio/mp4",
		startPositionSeconds: 0,
		strategy: "same-codec-remux",
		track: {
			id: "audio-1",
			kind: "audio",
		},
		trackId: "audio-1",
		trackIndex: 0,
		url,
	};
}
