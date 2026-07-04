import {
	ALL_FORMATS,
	BlobSource,
	Input,
	type InputAudioTrack,
	type InputVideoTrack,
} from "mediabunny";

import type {
	GeneratedMediaInspection,
	GeneratedMediaTrackInspection,
} from "@/editor-core/export-correctness";

export async function inspectGeneratedMediaBlob(
	blob: Blob,
): Promise<GeneratedMediaInspection> {
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(blob),
	});

	try {
		const [durationSeconds, mimeType, videoTracks, audioTracks] =
			await Promise.all([
				input.computeDuration(),
				readMimeType(input),
				input.getVideoTracks(),
				input.getAudioTracks(),
			]);

		return {
			container: containerFromMimeType(mimeType),
			durationUs: secondsToMicroseconds(durationSeconds),
			mimeType,
			sizeBytes: blob.size,
			tracks: {
				audio: await Promise.all(audioTracks.map(inspectAudioTrack)),
				video: await Promise.all(videoTracks.map(inspectVideoTrack)),
			},
		};
	} finally {
		input.dispose();
	}
}

async function inspectVideoTrack(
	track: InputVideoTrack,
	index: number,
): Promise<GeneratedMediaTrackInspection> {
	return {
		codec: readableCodec(
			(await track.getCodecParameterString()) ??
				track.codec ??
				track.internalCodecId,
		),
		durationUs: await readTrackDurationUs(track),
		height: track.displayHeight,
		id: String(track.id),
		kind: "video",
		label: track.name || `Video ${index + 1}`,
		width: track.displayWidth,
	};
}

async function inspectAudioTrack(
	track: InputAudioTrack,
	index: number,
): Promise<GeneratedMediaTrackInspection> {
	return {
		channels: track.numberOfChannels,
		codec: readableCodec(
			(await track.getCodecParameterString()) ??
				track.codec ??
				track.internalCodecId,
		),
		durationUs: await readTrackDurationUs(track),
		id: String(track.id),
		kind: "audio",
		label: track.name || `Audio ${index + 1}`,
		language: track.languageCode,
		sampleRate: track.sampleRate,
	};
}

async function readMimeType(input: Input): Promise<string | undefined> {
	try {
		return await input.getMimeType();
	} catch {
		return undefined;
	}
}

async function readTrackDurationUs(track: {
	computeDuration: () => Promise<number>;
}): Promise<number | undefined> {
	try {
		return secondsToMicroseconds(await track.computeDuration());
	} catch {
		return undefined;
	}
}

function secondsToMicroseconds(seconds: number): number {
	return Math.round(seconds * 1_000_000);
}

function containerFromMimeType(
	mimeType: string | undefined,
): GeneratedMediaInspection["container"] {
	if (mimeType?.startsWith("video/mp4")) {
		return "mp4";
	}

	if (mimeType?.startsWith("video/webm")) {
		return "webm";
	}

	return "unknown";
}

function readableCodec(codec: unknown): string | undefined {
	return typeof codec === "string" && codec.length > 0 ? codec : undefined;
}
