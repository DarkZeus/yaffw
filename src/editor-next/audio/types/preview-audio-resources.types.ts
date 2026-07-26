import type { AudioMediaTrack } from "@/editor-core/model";

export type PreviewAudioResource = {
	blob: Blob;
	byteLength: number;
	downloadName: string;
	mimeType: string;
	startPositionSeconds: number;
	strategy: "decoded-wav-fallback" | "same-codec-remux";
	track: AudioMediaTrack;
	trackId: string;
	trackIndex: number;
	url: string;
};

export type PreviewAudioResourceFailure = {
	reason: string;
	track: AudioMediaTrack;
	trackId: string;
	trackIndex: number;
};
