import { describe, expect, it, vi } from "vitest";

import {
	remuxCandidatesForAudioPreviewCodec,
	revokePreviewAudioResources,
	shouldPrepareTransformedPreviewAudioResource,
} from "../engine/preview-audio-resources";
import type { PreviewAudioResource } from "../types/preview-audio-resources.types";

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

describe("shouldPrepareTransformedPreviewAudioResource", () => {
	it("keeps preview resources source-derived for every channel mode", () => {
		expect(shouldPrepareTransformedPreviewAudioResource("preserve")).toBe(
			false,
		);
		expect(
			shouldPrepareTransformedPreviewAudioResource("auto-one-sided-stereo"),
		).toBe(false);
		expect(
			shouldPrepareTransformedPreviewAudioResource("use-left-as-mono"),
		).toBe(false);
	});
});

describe("revokePreviewAudioResources", () => {
	it("revokes every prepared object URL", () => {
		const revokeObjectURL = vi.fn();

		revokePreviewAudioResources({
			revokeObjectURL,
			resources: [
				createPreviewResource("blob:track-1"),
				createPreviewResource("blob:track-2"),
			],
		});

		expect(revokeObjectURL).toHaveBeenCalledWith("blob:track-1");
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:track-2");
	});
});

function createPreviewResource(url: string): PreviewAudioResource {
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
