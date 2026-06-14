import type { Quality } from "mediabunny";

export type BrowserVideoTrack = {
	computePacketStats: (targetPacketCount?: number) => Promise<{
		averagePacketRate: number;
	}>;
	displayHeight: number;
	displayWidth: number;
};

export type BrowserAudioTrack = {
	numberOfChannels: number;
	sampleRate: number;
};

export type CanEncodeDefaultProfileOptions = {
	audioTracks: BrowserAudioTrack[];
	canEncodeAudio: (
		codec: "aac",
		options: {
			bitrate: number;
			numberOfChannels: number;
			sampleRate: number;
		},
	) => Promise<boolean>;
	canEncodeVideo: (
		codec: "avc",
		options: {
			bitrate: number | Quality;
			height: number;
			width: number;
		},
	) => Promise<boolean>;
	qualityHigh: Quality;
	videoTracks: BrowserVideoTrack[];
};
