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
	format: OutputFormat;
	id: string;
	label: string;
};

const DOCUMENTED_VIDEO_FORMATS: DocumentedVideoFormat[] = [
	// Standalone video files that can become one Generated media artifact.
	// Segmented CMAF/HLS outputs and audio-only formats have different product models.
	{ format: new Mp4OutputFormat(), id: "mp4", label: "MP4" },
	{ format: new MovOutputFormat(), id: "mov", label: "MOV" },
	{ format: new MkvOutputFormat(), id: "mkv", label: "Matroska (MKV)" },
	{ format: new WebMOutputFormat(), id: "webm", label: "WebM" },
	{
		format: new MpegTsOutputFormat(),
		id: "mpeg-ts",
		label: "MPEG transport stream",
	},
];

export const MEDIABUNNY_OUTPUT_SUPPORT = getMediabunnyOutputSupport();

export function getMediabunnyOutputSupport(): BrowserLocalOutputSupport {
	return {
		containers: DOCUMENTED_VIDEO_FORMATS.map(toDocumentedOutputContainer),
	};
}

function toDocumentedOutputContainer({
	format,
	id,
	label,
}: DocumentedVideoFormat): DocumentedOutputContainer {
	return {
		fileExtension: format.fileExtension,
		id,
		label,
		mimeType: format.mimeType,
		videoCodecs: format.getSupportedVideoCodecs(),
	};
}
