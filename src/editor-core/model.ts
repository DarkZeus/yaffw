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

export type OutputContainerSetting =
	| {
			kind: "default-output-profile";
	  }
	| {
			container: string;
			kind: "documented-container";
	  };

export type OutputCodecSetting =
	| {
			kind: "default-output-profile";
	  }
	| {
			kind: "preserve-source";
	  }
	| {
			codec: string;
			kind: "documented-codec";
	  };

export type OutputResolutionSetting =
	| {
			kind: "preserve-source";
	  }
	| {
			height: number;
			kind: "target-dimensions";
			width: number;
	  };

export type OutputQualitySetting =
	| {
			kind: "preserve-source";
	  }
	| {
			kind: "subjective-quality";
			quality: string;
	  }
	| {
			bitrateBps: number;
			kind: "custom-bitrate";
	  };

export type OutputSettings = {
	audioCodec: OutputCodecSetting;
	audioQuality: OutputQualitySetting;
	container: OutputContainerSetting;
	resolution: OutputResolutionSetting;
	videoCodec: OutputCodecSetting;
	videoQuality: OutputQualitySetting;
};

export function createDefaultOutputSettings(): OutputSettings {
	return {
		audioCodec: {
			kind: "default-output-profile",
		},
		audioQuality: {
			kind: "preserve-source",
		},
		container: {
			kind: "default-output-profile",
		},
		resolution: {
			kind: "preserve-source",
		},
		videoCodec: {
			kind: "default-output-profile",
		},
		videoQuality: {
			kind: "preserve-source",
		},
	};
}

export function areOutputSettingsEqual(
	left: OutputSettings,
	right: OutputSettings,
): boolean {
	return (
		areOutputContainerSettingsEqual(left.container, right.container) &&
		areOutputCodecSettingsEqual(left.videoCodec, right.videoCodec) &&
		areOutputCodecSettingsEqual(left.audioCodec, right.audioCodec) &&
		areOutputResolutionSettingsEqual(left.resolution, right.resolution) &&
		areOutputQualitySettingsEqual(left.videoQuality, right.videoQuality) &&
		areOutputQualitySettingsEqual(left.audioQuality, right.audioQuality)
	);
}

function areOutputContainerSettingsEqual(
	left: OutputSettings["container"],
	right: OutputSettings["container"],
): boolean {
	if (left.kind !== right.kind) {
		return false;
	}

	if (
		left.kind === "documented-container" &&
		right.kind === "documented-container"
	) {
		return left.container === right.container;
	}

	return true;
}

function areOutputCodecSettingsEqual(
	left: OutputSettings["videoCodec"],
	right: OutputSettings["videoCodec"],
): boolean {
	if (left.kind !== right.kind) {
		return false;
	}

	if (left.kind === "documented-codec" && right.kind === "documented-codec") {
		return left.codec === right.codec;
	}

	return true;
}

function areOutputResolutionSettingsEqual(
	left: OutputSettings["resolution"],
	right: OutputSettings["resolution"],
): boolean {
	if (left.kind !== right.kind) {
		return false;
	}

	if (left.kind === "target-dimensions" && right.kind === "target-dimensions") {
		return left.width === right.width && left.height === right.height;
	}

	return true;
}

function areOutputQualitySettingsEqual(
	left: OutputSettings["videoQuality"],
	right: OutputSettings["videoQuality"],
): boolean {
	if (left.kind !== right.kind) {
		return false;
	}

	if (left.kind === "custom-bitrate" && right.kind === "custom-bitrate") {
		return left.bitrateBps === right.bitrateBps;
	}

	if (
		left.kind === "subjective-quality" &&
		right.kind === "subjective-quality"
	) {
		return left.quality === right.quality;
	}

	return true;
}

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
