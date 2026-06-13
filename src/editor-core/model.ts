export type MediaTimeUs = number;

export type Selection = {
	endUs: MediaTimeUs;
	startUs: MediaTimeUs;
};

export type LocalFileSource = {
	lastModified?: number;
	name: string;
	size: number;
	type: string;
};

export type LocalFileProvenance = {
	fileName: string;
	lastModifiedMs?: number;
	mimeType?: string;
	sizeBytes: number;
};

export type MediaAssetDraft = {
	id: string;
	kind: "local-file";
	label: string;
	provenance: LocalFileProvenance;
	source: LocalFileSource;
};

export type FrameTiming =
	| {
			fps: number;
			frameDurationUs: MediaTimeUs;
			source: "known";
	  }
	| {
			fps: 30;
			frameDurationUs: MediaTimeUs;
			reason: string;
			source: "estimated";
	  };

export type VideoMediaTrack = {
	codec?: string;
	height?: number;
	id: string;
	kind: "video";
	label?: string;
	width?: number;
};

export type AudioMediaTrack = {
	channels?: number;
	codec?: string;
	id: string;
	kind: "audio";
	label?: string;
	language?: string;
	sampleRate?: number;
};

export type AudioTrackChannelMode =
	| "auto-one-sided-stereo"
	| "average-to-mono"
	| "duplicate-left-to-stereo"
	| "duplicate-right-to-stereo"
	| "preserve"
	| "use-left-as-mono"
	| "use-right-as-mono";

export type AudioMixTrackDecision = {
	channelMode: AudioTrackChannelMode;
	include: boolean;
	trackId: string;
	volumePercent: number;
};

export type AudioMix = {
	finalPeakGuardDb: number;
	outputChannels: 2;
	tracks: Record<string, AudioMixTrackDecision>;
};

export type DefaultOutputProfile = {
	audioCodec: "aac";
	container: "mp4";
	videoCodec: "h264";
};

export const DEFAULT_OUTPUT_PROFILE: DefaultOutputProfile = {
	audioCodec: "aac",
	container: "mp4",
	videoCodec: "h264",
};

export type ExportCapability =
	| {
			profile: DefaultOutputProfile;
			supported: true;
	  }
	| {
			profile: DefaultOutputProfile;
			reason: string;
			supported: false;
			technicalDetails?: string;
	  };

export type ExportProgressPhase =
	| "encoding"
	| "finalizing"
	| "muxing"
	| "preparing";

export type ExportProgress = {
	completedRatio?: number;
	message?: string;
	phase: ExportProgressPhase;
};

export type GeneratedMedia = {
	assetId: string;
	createdAtMs: number;
	fileName: string;
	id: string;
	mimeType: string;
	profile: DefaultOutputProfile;
	selection: Selection;
	sizeBytes: number;
};

export type ReadyMediaAsset = {
	durationUs: MediaTimeUs;
	exportCapability: ExportCapability;
	frameTiming: FrameTiming;
	id: string;
	label: string;
	provenance: LocalFileProvenance;
	tracks: {
		audio: AudioMediaTrack[];
		video: VideoMediaTrack[];
	};
};

export type UnsupportedMediaFailure = {
	message: string;
	technicalDetails?: string;
};
