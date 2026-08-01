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
import { resolveMediabunnyInputTrackCodec } from "../../media-work/adapters/mediabunny-input-track-metadata";

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
	const [codec, durationUs, height, name, width] = await Promise.all([
		resolveMediabunnyInputTrackCodec(track),
		readTrackDurationUs(track),
		track.getDisplayHeight(),
		track.getName(),
		track.getDisplayWidth(),
	]);

	return {
		codec,
		durationUs,
		height,
		id: String(track.id),
		kind: "video",
		label: name || `Video ${index + 1}`,
		width,
	};
}

async function inspectAudioTrack(
	track: InputAudioTrack,
	index: number,
): Promise<GeneratedMediaTrackInspection> {
	const [channels, codec, durationUs, language, name, sampleRate] =
		await Promise.all([
			track.getNumberOfChannels(),
			resolveMediabunnyInputTrackCodec(track),
			readTrackDurationUs(track),
			track.getLanguageCode(),
			track.getName(),
			track.getSampleRate(),
		]);

	return {
		channels,
		codec,
		durationUs,
		id: String(track.id),
		kind: "audio",
		label: name || `Audio ${index + 1}`,
		language,
		sampleRate,
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
