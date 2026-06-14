import type {
	AudioMix,
	AudioTrackChannelMode,
	Selection,
} from "@/editor-core/model";

export type BrowserAudioMixRequest = {
	audioMix: AudioMix;
	selection: Selection;
	signal: AbortSignal;
	source: Blob;
};

export type BrowserAudioMixResult = {
	audioBuffer: AudioBuffer;
	includedTrackCount: number;
};

export type ChannelAnalysis = {
	channels: { peak: number; rms: number }[];
	oneSidedStereo: "left-active" | "right-active" | null;
	reason: string;
};

export type ResolvedChannelTransform = {
	analysis: ChannelAnalysis;
	requestedMode: AudioTrackChannelMode;
	resolvedMode: Exclude<AudioTrackChannelMode, "auto-one-sided-stereo">;
};
