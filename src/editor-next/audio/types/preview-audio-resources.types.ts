import type { AudioMediaTrack } from "@/editor-core/model";

export type PreviewAudioResource = {
	audioBuffer: AudioBuffer;
	startPositionSeconds: number;
	track: AudioMediaTrack;
	trackId: string;
	trackIndex: number;
};

export type PreviewAudioResourceFailure = {
	reason: string;
	track: AudioMediaTrack;
	trackId: string;
	trackIndex: number;
};
