import {
	createAudioMixPlan,
	includedAudioMixPlanTracks,
} from "./audio-mix-plan";
import {
	type AudioMix,
	DEFAULT_OUTPUT_PROFILE,
	type OutputQualitySetting,
	type OutputResolutionSetting,
	type OutputSettings,
	type OutputSubjectiveQuality,
	type ReadyMediaAsset,
	type ResolvedOutputPlan,
} from "./model";

const DOWNSCALE_HEIGHTS = [1440, 1080, 720, 480, 360] as const;

export const OUTPUT_SUBJECTIVE_QUALITY_CHOICES: ReadonlyArray<{
	label: string;
	value: OutputSubjectiveQuality;
}> = [
	{ label: "Very low", value: "very-low" },
	{ label: "Low", value: "low" },
	{ label: "Medium", value: "medium" },
	{ label: "High", value: "high" },
	{ label: "Very high", value: "very-high" },
];

const OUTPUT_SUBJECTIVE_QUALITIES = new Set<OutputSubjectiveQuality>(
	OUTPUT_SUBJECTIVE_QUALITY_CHOICES.map(({ value }) => value),
);

export type ResolvedOutputQuality =
	| {
			kind: "preserve-source";
	  }
	| {
			kind: "subjective-quality";
			quality: OutputSubjectiveQuality;
	  }
	| {
			bitrateBps: number;
			kind: "custom-bitrate";
	  }
	| {
			error: string;
			kind: "invalid";
	  };

export function resolveOutputQuality({
	mediaKind,
	setting,
}: {
	mediaKind: "audio" | "video";
	setting: OutputQualitySetting;
}): ResolvedOutputQuality {
	if (setting.kind === "preserve-source") {
		return setting;
	}

	if (setting.kind === "subjective-quality") {
		return OUTPUT_SUBJECTIVE_QUALITIES.has(setting.quality)
			? setting
			: {
					error: `Select a documented Mediabunny Subjective quality for ${mediaKind}.`,
					kind: "invalid",
				};
	}

	if (Number.isInteger(setting.bitrateBps) && setting.bitrateBps > 0) {
		return setting;
	}

	return {
		error: `Enter a positive whole-number ${mediaKind} bitrate in bits per second.`,
		kind: "invalid",
	};
}

export function formatOutputQualitySetting(
	setting: OutputQualitySetting,
): string {
	if (setting.kind === "custom-bitrate") {
		return formatOutputBitrate(setting.bitrateBps);
	}

	if (setting.kind === "subjective-quality") {
		return (
			OUTPUT_SUBJECTIVE_QUALITY_CHOICES.find(
				({ value }) => value === setting.quality,
			)?.label ?? setting.quality
		);
	}

	return "Preserve source";
}

function formatOutputBitrate(bitrateBps: number): string {
	if (!Number.isFinite(bitrateBps)) {
		return "Invalid custom bitrate";
	}

	if (bitrateBps >= 1_000_000) {
		return `${(bitrateBps / 1_000_000).toFixed(1)} Mbps`;
	}

	return `${Math.round(bitrateBps / 1_000)} Kbps`;
}

export type OutputResolutionChoice = {
	label: string;
	setting: OutputResolutionSetting;
};

export type ResolvedOutputResolution =
	| {
			conversionDimensions?: {
				height: number;
				width: number;
			};
			dimensions?: {
				height: number;
				width: number;
			};
			kind: "resolved";
	  }
	| {
			error: string;
			kind: "invalid";
	  };

export function resolveOutputResolution({
	asset,
	setting,
}: {
	asset: Pick<ReadyMediaAsset, "tracks">;
	setting: OutputResolutionSetting;
}): ResolvedOutputResolution {
	const source = sourceVideoDimensions(asset);

	if (setting.kind === "preserve-source") {
		return {
			dimensions: source,
			kind: "resolved",
		};
	}

	if (
		source &&
		Number.isInteger(setting.width) &&
		Number.isInteger(setting.height) &&
		setting.width > 0 &&
		setting.height > 0 &&
		setting.width <= source.width &&
		setting.height <= source.height
	) {
		const dimensions = {
			height: setting.height,
			width: setting.width,
		};

		return {
			conversionDimensions: dimensions,
			dimensions,
			kind: "resolved",
		};
	}

	return {
		error:
			"Target output dimensions must be positive whole pixels no larger than the active source resolution.",
		kind: "invalid",
	};
}

export function getOutputResolutionChoices(
	asset: Pick<ReadyMediaAsset, "tracks">,
): OutputResolutionChoice[] {
	const source = sourceVideoDimensions(asset);
	const preserveSource: OutputResolutionChoice = {
		label: source
			? `Preserve source (${source.width}x${source.height})`
			: "Preserve source",
		setting: { kind: "preserve-source" },
	};

	if (!source) {
		return [preserveSource];
	}

	return [
		preserveSource,
		...DOWNSCALE_HEIGHTS.flatMap((height) => {
			if (height >= source.height) {
				return [];
			}

			const width = roundToEven((height * source.width) / source.height);
			if (width <= 0 || width >= source.width) {
				return [];
			}

			return [
				{
					label: `${width}x${height}`,
					setting: {
						height,
						kind: "target-dimensions" as const,
						width,
					},
				},
			];
		}),
	];
}

export type DocumentedOutputContainer = {
	audioCodecs: string[];
	fileExtension: string;
	id: string;
	label: string;
	mimeType: string;
	videoCodecs: string[];
};

export type ResolvedOutputAudioProfile =
	| {
			audioCodec?: string;
			automaticReplacement?: {
				audioCodec: string;
				requestedCodec?: string;
			};
			container: DocumentedOutputContainer;
			includedTrackCount: number;
			kind: "resolved";
	  }
	| {
			error: string;
			kind: "invalid";
	  };

export function resolveOutputAudioProfile({
	asset,
	audioMix,
	outputSettings,
	support,
}: {
	asset: Pick<ReadyMediaAsset, "tracks">;
	audioMix: AudioMix;
	outputSettings: OutputSettings;
	support: BrowserLocalOutputSupport;
}): ResolvedOutputAudioProfile {
	const containerId =
		outputSettings.container.kind === "default-output-profile"
			? DEFAULT_OUTPUT_PROFILE.container
			: outputSettings.container.container;
	const container = support.containers.find(({ id }) => id === containerId);

	if (!container) {
		return {
			error: `The selected ${containerId} container is not documented by the browser-local media writer.`,
			kind: "invalid",
		};
	}

	const includedTrackIds = new Set(
		includedAudioMixPlanTracks(
			createAudioMixPlan({
				audioMix,
				trackIds: asset.tracks.audio.map(({ id }) => id),
			}),
		).map(({ trackId }) => trackId),
	);
	const includedTracks = asset.tracks.audio.filter(({ id }) =>
		includedTrackIds.has(id),
	);
	const sourceCodec = normalizeAudioCodec(includedTracks[0]?.codec);
	if (includedTracks.length === 0) {
		return {
			audioCodec: undefined,
			container,
			includedTrackCount: 0,
			kind: "resolved",
		};
	}

	const requestedCodec =
		outputSettings.audioCodec.kind === "default-output-profile"
			? DEFAULT_OUTPUT_PROFILE.audioCodec
			: outputSettings.audioCodec.kind === "documented-codec"
				? normalizeAudioCodec(outputSettings.audioCodec.codec)
				: sourceCodec;

	if (requestedCodec && container.audioCodecs.includes(requestedCodec)) {
		return {
			audioCodec: requestedCodec,
			container,
			includedTrackCount: includedTracks.length,
			kind: "resolved",
		};
	}

	if (outputSettings.audioCodec.kind === "preserve-source") {
		const replacementCodec = container.audioCodecs[0];
		if (replacementCodec) {
			return {
				audioCodec: replacementCodec,
				automaticReplacement: {
					audioCodec: replacementCodec,
					requestedCodec,
				},
				container,
				includedTrackCount: includedTracks.length,
				kind: "resolved",
			};
		}
	}

	return {
		error: `No documented audio codec can satisfy the selected ${container.label} container.`,
		kind: "invalid",
	};
}

export type BrowserLocalOutputSupport = {
	containers: DocumentedOutputContainer[];
};

export type ResolvedOutputPlanResult =
	| {
			kind: "resolved";
			plan: ResolvedOutputPlan;
	  }
	| {
			error: string;
			kind: "invalid";
	  };

export function resolveOutputPlan({
	asset,
	audioMix,
	outputSettings,
	support,
}: {
	asset: Pick<ReadyMediaAsset, "tracks">;
	audioMix: AudioMix;
	outputSettings: OutputSettings;
	support: BrowserLocalOutputSupport;
}): ResolvedOutputPlanResult {
	const video = resolveOutputVideoProfile({ asset, outputSettings, support });
	if (video.kind === "invalid") {
		return video;
	}

	const audio = resolveOutputAudioProfile({
		asset,
		audioMix,
		outputSettings,
		support,
	});
	if (audio.kind === "invalid") {
		return audio;
	}

	const resolution = resolveOutputResolution({
		asset,
		setting: outputSettings.resolution,
	});
	if (resolution.kind === "invalid") {
		return resolution;
	}

	const videoQuality = resolveOutputQuality({
		mediaKind: "video",
		setting: outputSettings.videoQuality,
	});
	if (videoQuality.kind === "invalid") {
		return videoQuality;
	}

	const audioQuality = resolveOutputQuality({
		mediaKind: "audio",
		setting: outputSettings.audioQuality,
	});
	if (audioQuality.kind === "invalid") {
		return audioQuality;
	}

	return {
		kind: "resolved",
		plan: {
			audioCodec: audio.audioCodec,
			audioQuality: { ...outputSettings.audioQuality },
			container: {
				fileExtension: video.container.fileExtension,
				id: video.container.id,
				label: video.container.label,
				mimeType: video.container.mimeType,
			},
			includedAudioTrackCount: audio.includedTrackCount,
			resolution: resolution.dimensions
				? { ...resolution.dimensions }
				: undefined,
			videoCodec: video.videoCodec,
			videoQuality: { ...outputSettings.videoQuality },
		},
	};
}

export type ResolveOutputVideoProfileOptions = {
	asset: Pick<ReadyMediaAsset, "tracks">;
	outputSettings: OutputSettings;
	support: BrowserLocalOutputSupport;
};

export type ResolvedOutputVideoProfile =
	| {
			automaticReplacement?: {
				requestedCodec?: string;
				videoCodec: string;
			};
			container: DocumentedOutputContainer;
			kind: "resolved";
			videoCodec: string;
	  }
	| {
			error: string;
			kind: "invalid";
	  };

export function resolveOutputVideoProfile({
	asset,
	outputSettings,
	support,
}: ResolveOutputVideoProfileOptions): ResolvedOutputVideoProfile {
	const containerId =
		outputSettings.container.kind === "default-output-profile"
			? DEFAULT_OUTPUT_PROFILE.container
			: outputSettings.container.container;
	const container = support.containers.find(({ id }) => id === containerId);

	if (!container) {
		return {
			error: `The selected ${containerId} container is not documented by the browser-local media writer.`,
			kind: "invalid",
		};
	}

	const sourceCodec = normalizeVideoCodec(asset.tracks.video[0]?.codec);
	const requestedCodec =
		outputSettings.videoCodec.kind === "default-output-profile"
			? normalizeVideoCodec(DEFAULT_OUTPUT_PROFILE.videoCodec)
			: outputSettings.videoCodec.kind === "documented-codec"
				? normalizeVideoCodec(outputSettings.videoCodec.codec)
				: sourceCodec;

	if (requestedCodec && container.videoCodecs.includes(requestedCodec)) {
		return {
			container,
			kind: "resolved",
			videoCodec: requestedCodec,
		};
	}

	if (outputSettings.videoCodec.kind === "preserve-source") {
		const replacementCodec = container.videoCodecs[0];
		if (replacementCodec) {
			return {
				automaticReplacement: {
					requestedCodec,
					videoCodec: replacementCodec,
				},
				container,
				kind: "resolved",
				videoCodec: replacementCodec,
			};
		}
	}

	return {
		error: `No documented video codec can satisfy the selected ${container.label} container.`,
		kind: "invalid",
	};
}

function normalizeVideoCodec(codec: string | undefined): string | undefined {
	if (!codec) {
		return undefined;
	}

	const normalized = codec.trim().toLowerCase();

	if (normalized === "h264" || normalized.startsWith("avc1")) {
		return "avc";
	}
	if (
		normalized === "h265" ||
		normalized.startsWith("hvc1") ||
		normalized.startsWith("hev1")
	) {
		return "hevc";
	}
	if (normalized.startsWith("vp09")) {
		return "vp9";
	}
	if (normalized.startsWith("vp08")) {
		return "vp8";
	}
	if (normalized.startsWith("av01")) {
		return "av1";
	}

	return normalized;
}

function normalizeAudioCodec(codec: string | undefined): string | undefined {
	if (!codec) {
		return undefined;
	}

	const normalized = codec.trim().toLowerCase();
	if (normalized === "aac" || normalized.startsWith("mp4a")) {
		return "aac";
	}

	return normalized;
}

function sourceVideoDimensions(
	asset: Pick<ReadyMediaAsset, "tracks">,
): { height: number; width: number } | undefined {
	const videoTrack = asset.tracks.video[0];

	if (
		!videoTrack ||
		!Number.isFinite(videoTrack.width) ||
		!Number.isFinite(videoTrack.height) ||
		(videoTrack.width ?? 0) <= 0 ||
		(videoTrack.height ?? 0) <= 0
	) {
		return undefined;
	}

	return {
		height: videoTrack.height as number,
		width: videoTrack.width as number,
	};
}

function roundToEven(value: number): number {
	return Math.max(2, Math.round(value / 2) * 2);
}
