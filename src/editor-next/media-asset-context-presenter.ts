import type {
	AudioMediaTrack,
	ReadyMediaAsset,
	Selection,
	VideoMediaTrack,
} from "@/editor-core/model";

export type MediaAssetContextFact = {
	label: string;
	value: string;
};

export type MediaAssetContextViewModel = {
	audioFacts: MediaAssetContextFact[];
	closeFile: {
		disabled: boolean;
		label: "Close file";
	};
	identity: {
		assetId: string;
		name: string;
		summary: string;
	};
	provenanceFacts: MediaAssetContextFact[];
	selectionFacts: MediaAssetContextFact[];
	videoFacts: MediaAssetContextFact[];
};

type MediaAssetContextOptions = {
	asset: ReadyMediaAsset;
	closeDisabled: boolean;
	selection: Selection;
};

export function createMediaAssetContextViewModel({
	asset,
	closeDisabled,
	selection,
}: MediaAssetContextOptions): MediaAssetContextViewModel {
	return {
		audioFacts: audioFactsForAsset(asset.tracks.audio[0], asset),
		closeFile: {
			disabled: closeDisabled,
			label: "Close file",
		},
		identity: {
			assetId: asset.id,
			name: asset.label,
			summary: "Loaded for preview, selection, and export.",
		},
		provenanceFacts: [
			{ label: "Asset identity", value: asset.id },
			{ label: "Source file", value: asset.provenance.fileName },
			{ label: "Duration", value: formatMediaTime(asset.durationUs) },
			{ label: "Size", value: formatFileSize(asset.provenance.sizeBytes) },
			{ label: "Type", value: formatContainerType(asset.provenance) },
		],
		selectionFacts: selectionFactsForAsset(selection, asset),
		videoFacts: videoFactsForAsset(asset.tracks.video[0], asset),
	};
}

function videoFactsForAsset(
	primaryVideoTrack: VideoMediaTrack | undefined,
	asset: ReadyMediaAsset,
): MediaAssetContextFact[] {
	return [
		{ label: "Video tracks", value: `${asset.tracks.video.length}` },
		{
			label: "Primary video",
			value: primaryVideoTrack?.label ?? "Unnamed video track",
		},
		{
			label: "Resolution",
			value:
				primaryVideoTrack?.width && primaryVideoTrack.height
					? `${primaryVideoTrack.width}x${primaryVideoTrack.height}`
					: "Unknown",
		},
		{
			label: "Aspect",
			value: formatAspectRatio(primaryVideoTrack?.width, primaryVideoTrack?.height),
		},
		{
			label: "Frame timing",
			value: `${formatNumber(asset.frameTiming.fps)} fps ${
				asset.frameTiming.source === "known" ? "known" : "estimated"
			}`,
		},
		{ label: "Codec", value: primaryVideoTrack?.codec ?? "Unknown" },
	];
}

function audioFactsForAsset(
	primaryAudioTrack: AudioMediaTrack | undefined,
	asset: ReadyMediaAsset,
): MediaAssetContextFact[] {
	if (!primaryAudioTrack) {
		return [
			{ label: "Audio tracks", value: `${asset.tracks.audio.length}` },
			{ label: "Primary audio", value: "None" },
		];
	}

	return [
		{ label: "Audio tracks", value: `${asset.tracks.audio.length}` },
		{
			label: "Primary audio",
			value: primaryAudioTrack.label ?? "Unnamed audio track",
		},
		{ label: "Channels", value: formatChannels(primaryAudioTrack.channels) },
		{
			label: "Sample rate",
			value: formatSampleRate(primaryAudioTrack.sampleRate),
		},
		{ label: "Codec", value: primaryAudioTrack.codec ?? "Unknown" },
		{ label: "Language", value: primaryAudioTrack.language ?? "und" },
	];
}

function selectionFactsForAsset(
	selection: Selection,
	asset: ReadyMediaAsset,
): MediaAssetContextFact[] {
	const durationUs = Math.max(0, selection.endUs - selection.startUs);
	const coveragePercent =
		asset.durationUs > 0 ? (durationUs / asset.durationUs) * 100 : 0;

	return [
		{ label: "Selection start", value: formatMediaTime(selection.startUs) },
		{ label: "Selection end", value: formatMediaTime(selection.endUs) },
		{ label: "Selection duration", value: formatMediaTime(durationUs) },
		{ label: "Asset coverage", value: `${formatNumber(coveragePercent)}%` },
	];
}

function formatMediaTime(microseconds: number): string {
	const totalMilliseconds = Math.floor(microseconds / 1_000);
	const milliseconds = totalMilliseconds % 1_000;
	const totalSeconds = Math.floor(totalMilliseconds / 1_000);
	const seconds = totalSeconds % 60;
	const totalMinutes = Math.floor(totalSeconds / 60);
	const minutes = totalMinutes % 60;
	const hours = Math.floor(totalMinutes / 60);

	return `${padTime(hours)}:${padTime(minutes)}:${padTime(seconds)}.${String(
		milliseconds,
	).padStart(3, "0")}`;
}

function formatFileSize(bytes: number): string {
	if (bytes <= 0) {
		return "0 B";
	}

	const units = ["B", "KB", "MB", "GB", "TB"];
	const unitIndex = Math.min(
		units.length - 1,
		Math.floor(Math.log(bytes) / Math.log(1024)),
	);
	const value = bytes / 1024 ** unitIndex;

	return `${formatNumber(value)} ${units[unitIndex]}`;
}

function formatContainerType(
	provenance: ReadyMediaAsset["provenance"],
): string {
	const mimeSubtype = provenance.mimeType?.split("/")[1];

	if (mimeSubtype) {
		return mimeSubtype.toUpperCase();
	}

	const extension = provenance.fileName.split(".").pop();

	return extension ? extension.toUpperCase() : "Unknown";
}

function formatAspectRatio(width?: number, height?: number): string {
	if (!width || !height) {
		return "Unknown";
	}

	const divisor = greatestCommonDivisor(width, height);

	return `${width / divisor}:${height / divisor}`;
}

function formatChannels(channels?: number): string {
	if (!channels) {
		return "Unknown";
	}

	if (channels === 1) {
		return "Mono";
	}

	if (channels === 2) {
		return "Stereo";
	}

	return `${channels} channels`;
}

function formatSampleRate(sampleRate?: number): string {
	if (!sampleRate) {
		return "Unknown";
	}

	if (sampleRate >= 1_000) {
		return `${formatNumber(sampleRate / 1_000)} kHz`;
	}

	return `${sampleRate} Hz`;
}

function formatNumber(value: number): string {
	if (Number.isInteger(value)) {
		return `${value}`;
	}

	return value.toFixed(2).replace(/\.?0+$/, "");
}

function greatestCommonDivisor(first: number, second: number): number {
	let a = Math.abs(first);
	let b = Math.abs(second);

	while (b !== 0) {
		const next = b;
		b = a % b;
		a = next;
	}

	return a || 1;
}

function padTime(value: number): string {
	return String(value).padStart(2, "0");
}
