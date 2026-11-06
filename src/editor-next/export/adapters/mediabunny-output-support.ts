import {
	MkvOutputFormat,
	MovOutputFormat,
	Mp4OutputFormat,
	MpegTsOutputFormat,
	type OutputFormat,
	WebMOutputFormat,
} from "mediabunny";

import type {
	BrowserLocalOutputSupport,
	DocumentedOutputContainer,
} from "@/editor-core/output-settings";

type DocumentedVideoFormat = {
	create: (options: { fastStart?: boolean }) => OutputFormat;
	id: string;
	label: string;
};

const DOCUMENTED_VIDEO_FORMATS: DocumentedVideoFormat[] = [
	// Standalone video files that can become one Generated media artifact.
	// Segmented CMAF/HLS outputs and audio-only formats have different product models.
	{
		create: ({ fastStart }) =>
			new Mp4OutputFormat(fastStart ? { fastStart: "in-memory" } : undefined),
		id: "mp4",
		label: "MP4",
	},
	{ create: () => new MovOutputFormat(), id: "mov", label: "MOV" },
	{ create: () => new MkvOutputFormat(), id: "mkv", label: "Matroska (MKV)" },
	{ create: () => new WebMOutputFormat(), id: "webm", label: "WebM" },
	{
		create: () => new MpegTsOutputFormat(),
		id: "mpeg-ts",
		label: "MPEG transport stream",
	},
];

export const MEDIABUNNY_OUTPUT_SUPPORT: BrowserLocalOutputSupport = {
	containers: DOCUMENTED_VIDEO_FORMATS.map(toDocumentedOutputContainer),
};

export function createMediabunnyOutputFormat(
	containerId: string,
	options: { fastStart?: boolean } = {},
): OutputFormat {
	const entry = DOCUMENTED_VIDEO_FORMATS.find(({ id }) => id === containerId);
	if (!entry) {
		throw new Error(
			`The selected ${containerId} container has no browser-local output adapter.`,
		);
	}
	return entry.create(options);
}

function toDocumentedOutputContainer({
	create,
	id,
	label,
}: DocumentedVideoFormat): DocumentedOutputContainer {
	const format = create({});
	return {
		audioCodecs: format.getSupportedAudioCodecs(),
		fileExtension: format.fileExtension,
		id,
		label,
		mimeType: format.mimeType,
		videoCodecs: format.getSupportedVideoCodecs(),
	};
}
