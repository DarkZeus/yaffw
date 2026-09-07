import type { AudioMediaTrack } from "@/editor-core/model";

export type PreviewAudioResource = {
	numberOfChannels: number;
	sampleRate: number;
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
