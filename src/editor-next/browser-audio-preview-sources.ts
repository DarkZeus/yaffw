import {
	ALL_FORMATS,
	AdtsOutputFormat,
	AudioBufferSource,
	type AudioCodec,
	AudioSampleSink,
	AudioSampleSource,
	BlobSource,
	BufferTarget,
	EncodedAudioPacketSource,
	EncodedPacketSink,
	FlacOutputFormat,
	Input,
	Mp3OutputFormat,
	Mp4OutputFormat,
	OggOutputFormat,
	Output,
	type OutputFormat,
	WavOutputFormat,
	WebMOutputFormat,
} from "mediabunny";

import type {
	AudioMediaTrack,
	AudioMix,
	AudioMixTrackDecision,
	AudioTrackChannelMode,
	ReadyMediaAsset,
} from "@/editor-core/model";
import {
	createAudioBuffer,
	createChannelCompensatedAudioBuffer,
	createPeakSafeAudioBuffer,
	createTransformedAudioBuffer,
	outputChannelCountForMode,
	resolveChannelTransform,
} from "./browser-audio-mix";

export type BrowserAudioPreviewSource = {
	blob: Blob;
	byteLength: number;
	downloadName: string;
	mimeType: string;
	startPositionSeconds: number;
	strategy:
		| "decoded-channel-transform-aac-m4a"
		| "decoded-channel-transform-wav"
		| "decoded-wav-fallback"
		| "same-codec-remux";
	track: AudioMediaTrack;
	trackId: string;
	trackIndex: number;
	url: string;
};

export type BrowserAudioPreviewSourceFailure = {
	reason: string;
	track: AudioMediaTrack;
	trackId: string;
	trackIndex: number;
};

export type BrowserAudioPreviewSourcesResult = {
	failures: BrowserAudioPreviewSourceFailure[];
	sources: BrowserAudioPreviewSource[];
};

type BrowserAudioPreviewSourcesRequest = {
	audioMix: AudioMix;
	asset: ReadyMediaAsset;
	createObjectURL?: (blob: Blob) => string;
	revokeObjectURL?: (url: string) => void;
	signal: AbortSignal;
	source: Blob;
	trackIds?: ReadonlySet<string>;
};

type InputAudioTrack = Awaited<ReturnType<Input["getAudioTracks"]>>[number];

type AudioPreviewTrackMetadata = {
	codec: AudioCodec | null;
	firstTimestampSeconds: number | null;
	languageCode: string | null;
	name: string | null;
	number: number;
};

type RemuxCandidate = {
	createFormat: () => OutputFormat;
	extension: string;
	label: string;
	mimeType: string;
};

export async function prepareBrowserAudioPreviewSources({
	audioMix,
	asset,
	createObjectURL = URL.createObjectURL,
	revokeObjectURL = URL.revokeObjectURL,
	signal,
	source,
	trackIds,
}: BrowserAudioPreviewSourcesRequest): Promise<BrowserAudioPreviewSourcesResult> {
	throwIfAborted(signal);

	if (asset.tracks.audio.length === 0) {
		return {
			failures: [],
			sources: [],
		};
	}

	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(source),
	});
	const sources: BrowserAudioPreviewSource[] = [];
	const failures: BrowserAudioPreviewSourceFailure[] = [];

	try {
		const inputTracks = await input.getAudioTracks();

		for (const [trackIndex, assetTrack] of asset.tracks.audio.entries()) {
			throwIfAborted(signal);

			if (trackIds && !trackIds.has(assetTrack.id)) {
				continue;
			}

			const inputTrack =
				inputTracks.find((track) => String(track.id) === assetTrack.id) ??
				inputTracks[trackIndex];

			if (!inputTrack) {
				failures.push({
					reason: "The analyzed audio track is no longer available.",
					track: assetTrack,
					trackId: assetTrack.id,
					trackIndex,
				});
				continue;
			}

			const metadata = await describeAudioPreviewTrack(inputTrack, trackIndex);
			const preparedSource = await prepareAudioPreviewTrackSource({
				assetTrack,
				createObjectURL,
				decision: audioMix.tracks[assetTrack.id],
				finalPeakGuardDb: audioMix.finalPeakGuardDb,
				metadata,
				signal,
				track: inputTrack,
				trackIndex,
			});

			if (preparedSource.status === "ready") {
				sources.push(preparedSource.source);
				continue;
			}

			failures.push({
				reason: preparedSource.reason,
				track: assetTrack,
				trackId: assetTrack.id,
				trackIndex,
			});
		}

		return {
			failures,
			sources,
		};
	} catch (error) {
		revokeBrowserAudioPreviewSources({
			revokeObjectURL,
			sources,
		});
		throw error;
	} finally {
		input.dispose();
	}
}

export function revokeBrowserAudioPreviewSources({
	revokeObjectURL = URL.revokeObjectURL,
	sources,
}: {
	revokeObjectURL?: (url: string) => void;
	sources: BrowserAudioPreviewSource[];
}) {
	for (const source of sources) {
		revokeObjectURL(source.url);
	}
}

export function remuxCandidatesForAudioPreviewCodec(
	codec: AudioCodec | null | undefined,
): RemuxCandidate[] {
	if (!codec) {
		return [];
	}

	const mp4Candidate = {
		createFormat: () => new Mp4OutputFormat({ fastStart: "in-memory" }),
		extension: codec === "aac" ? ".m4a" : ".mp4",
		label: "audio-only-mp4",
		mimeType: "audio/mp4",
	} satisfies RemuxCandidate;

	if (codec === "aac") {
		return [
			mp4Candidate,
			{
				createFormat: () => new AdtsOutputFormat(),
				extension: ".aac",
				label: "adts-aac",
				mimeType: "audio/aac",
			},
		];
	}

	if (codec === "mp3") {
		return [
			{
				createFormat: () => new Mp3OutputFormat(),
				extension: ".mp3",
				label: "mp3",
				mimeType: "audio/mpeg",
			},
			mp4Candidate,
		];
	}

	if (codec === "opus" || codec === "vorbis") {
		return [
			{
				createFormat: () => new WebMOutputFormat(),
				extension: ".webm",
				label: "audio-only-webm",
				mimeType: "audio/webm",
			},
			{
				createFormat: () => new OggOutputFormat(),
				extension: ".ogg",
				label: "ogg",
				mimeType: "audio/ogg",
			},
		];
	}

	if (codec === "flac") {
		return [
			{
				createFormat: () => new FlacOutputFormat(),
				extension: ".flac",
				label: "flac",
				mimeType: "audio/flac",
			},
			mp4Candidate,
		];
	}

	if (codec.startsWith("pcm-") || codec === "ulaw" || codec === "alaw") {
		return [
			{
				createFormat: () => new WavOutputFormat(),
				extension: ".wav",
				label: "wav-same-codec",
				mimeType: "audio/wav",
			},
		];
	}

	return [mp4Candidate];
}

export function shouldPrepareTransformedAudioPreviewSource(
	channelMode: AudioTrackChannelMode,
): channelMode is Exclude<AudioTrackChannelMode, "preserve"> {
	return channelMode !== "preserve";
}

async function prepareAudioPreviewTrackSource({
	assetTrack,
	createObjectURL,
	decision,
	finalPeakGuardDb,
	metadata,
	signal,
	track,
	trackIndex,
}: {
	assetTrack: AudioMediaTrack;
	createObjectURL: (blob: Blob) => string;
	decision: AudioMixTrackDecision | undefined;
	finalPeakGuardDb: number;
	metadata: AudioPreviewTrackMetadata;
	signal: AbortSignal;
	track: InputAudioTrack;
	trackIndex: number;
}): Promise<
	| {
			source: BrowserAudioPreviewSource;
			status: "ready";
	  }
	| {
			reason: string;
			status: "failed";
	  }
> {
	const reasons: string[] = [];
	const channelMode = decision?.channelMode ?? "preserve";

	if (shouldPrepareTransformedAudioPreviewSource(channelMode)) {
		try {
			const source = await createTransformedAudioPreviewTrackSource({
				assetTrack,
				channelMode,
				createObjectURL,
				finalPeakGuardDb,
				metadata,
				signal,
				track,
				trackIndex,
			});

			return {
				source,
				status: "ready",
			};
		} catch (error) {
			reasons.push(`decoded-channel-transform: ${errorToMessage(error)}`);
		}
	}

	for (const candidate of remuxCandidatesForAudioPreviewCodec(metadata.codec)) {
		throwIfAborted(signal);

		try {
			const source = await remuxAudioPreviewTrack({
				assetTrack,
				candidate,
				createObjectURL,
				metadata,
				signal,
				track,
				trackIndex,
			});

			return {
				source,
				status: "ready",
			};
		} catch (error) {
			reasons.push(`${candidate.label}: ${errorToMessage(error)}`);
		}
	}

	try {
		const source = await createWavAudioPreviewFallback({
			assetTrack,
			createObjectURL,
			metadata,
			signal,
			track,
			trackIndex,
		});

		return {
			source,
			status: "ready",
		};
	} catch (error) {
		reasons.push(`wav-fallback: ${errorToMessage(error)}`);
	}

	return {
		reason: reasons.join("; ") || "No preview audio source could be prepared.",
		status: "failed",
	};
}

async function createTransformedAudioPreviewTrackSource({
	assetTrack,
	channelMode,
	createObjectURL,
	finalPeakGuardDb,
	metadata,
	signal,
	track,
	trackIndex,
}: {
	assetTrack: AudioMediaTrack;
	channelMode: Exclude<AudioTrackChannelMode, "preserve">;
	createObjectURL: (blob: Blob) => string;
	finalPeakGuardDb: number;
	metadata: AudioPreviewTrackMetadata;
	signal: AbortSignal;
	track: InputAudioTrack;
	trackIndex: number;
}): Promise<BrowserAudioPreviewSource> {
	if (!(await track.canDecode())) {
		throw new Error("Track is not decodable in this browser.");
	}

	const decoded = await decodeAudioPreviewTrackToBuffer({
		metadata,
		signal,
		track,
	});
	const channelTransform = resolveChannelTransform(decoded, channelMode);
	const transformed = createTransformedAudioBuffer(decoded, {
		channelMode: channelTransform.resolvedMode,
		outputChannels: outputChannelCountForMode(
			decoded,
			channelTransform.resolvedMode,
		),
	});
	const channelCompensated = createChannelCompensatedAudioBuffer({
		channelTransform,
		inputBuffer: decoded,
		outputBuffer: transformed,
	});
	const peakSafe = createPeakSafeAudioBuffer(
		channelCompensated,
		finalPeakGuardDb,
	);
	const encoded = await encodeTransformedAudioPreviewBlob(peakSafe, metadata);

	return createAudioPreviewSource({
		assetTrack,
		blob: encoded.blob,
		createObjectURL,
		downloadName: `track-${metadata.number}-${channelMode}${encoded.extension}`,
		metadata,
		mimeType: encoded.mimeType,
		strategy: encoded.strategy,
		trackIndex,
	});
}

async function decodeAudioPreviewTrackToBuffer({
	metadata,
	signal,
	track,
}: {
	metadata: AudioPreviewTrackMetadata;
	signal: AbortSignal;
	track: InputAudioTrack;
}): Promise<AudioBuffer> {
	const sink = new AudioSampleSink(track);
	const chunks: Array<{ buffer: AudioBuffer; timestamp: number }> = [];
	let sampleRate = track.sampleRate || 48_000;
	let numberOfChannels = Math.max(1, track.numberOfChannels || 1);
	let firstTimestampSeconds = Number.POSITIVE_INFINITY;

	for await (const sample of sink.samples()) {
		throwIfAborted(signal);

		try {
			const buffer = sample.toAudioBuffer();

			if (!sampleRate) {
				sampleRate = buffer.sampleRate;
			}

			if (buffer.sampleRate !== sampleRate) {
				throw new Error(
					`Decoded sample rate changed from ${sampleRate}Hz to ${buffer.sampleRate}Hz.`,
				);
			}

			numberOfChannels = Math.max(numberOfChannels, buffer.numberOfChannels);
			firstTimestampSeconds = Math.min(firstTimestampSeconds, sample.timestamp);
			chunks.push({
				buffer,
				timestamp: sample.timestamp,
			});
		} finally {
			sample.close();
		}
	}

	if (chunks.length === 0) {
		throw new Error("Original audio track produced no decoded buffers.");
	}

	const trackStartSeconds = Number.isFinite(metadata.firstTimestampSeconds)
		? (metadata.firstTimestampSeconds ?? firstTimestampSeconds)
		: firstTimestampSeconds;
	const frameSpans = chunks.map(({ buffer, timestamp }) => {
		const frameOffset = Math.max(
			0,
			Math.round((timestamp - trackStartSeconds) * sampleRate),
		);

		return {
			buffer,
			frameEnd: frameOffset + buffer.length,
			frameOffset,
		};
	});
	const length = Math.max(...frameSpans.map((span) => span.frameEnd));
	const audioBuffer = createAudioBuffer({
		length,
		numberOfChannels,
		sampleRate,
	});

	for (const { buffer, frameOffset } of frameSpans) {
		for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
			const channelData = new Float32Array(buffer.length);
			buffer.copyFromChannel(channelData, channel);
			audioBuffer.copyToChannel(channelData, channel, frameOffset);
		}
	}

	return audioBuffer;
}

async function encodeTransformedAudioPreviewBlob(
	audioBuffer: AudioBuffer,
	metadata: AudioPreviewTrackMetadata,
): Promise<{
	blob: Blob;
	extension: string;
	mimeType: string;
	strategy: Extract<
		BrowserAudioPreviewSource["strategy"],
		"decoded-channel-transform-aac-m4a" | "decoded-channel-transform-wav"
	>;
}> {
	try {
		return await encodeAudioBufferToM4aBlob(audioBuffer, metadata);
	} catch {
		return encodeAudioBufferToWavBlob(audioBuffer, metadata);
	}
}

async function encodeAudioBufferToM4aBlob(
	audioBuffer: AudioBuffer,
	metadata: AudioPreviewTrackMetadata,
) {
	const target = new BufferTarget();
	const output = new Output({
		format: new Mp4OutputFormat({ fastStart: "in-memory" }),
		target,
	});
	const source = new AudioBufferSource({
		bitrate: 192_000,
		codec: "aac",
	});
	output.addAudioTrack(source, audioTrackOutputMetadata(metadata));
	await output.start();
	await source.add(audioBuffer);
	source.close();
	await output.finalize();

	if (!target.buffer) {
		throw new Error("M4A output produced no buffer.");
	}

	return {
		blob: new Blob([target.buffer], { type: "audio/mp4" }),
		extension: ".m4a",
		mimeType: "audio/mp4",
		strategy: "decoded-channel-transform-aac-m4a",
	} satisfies Awaited<ReturnType<typeof encodeTransformedAudioPreviewBlob>>;
}

async function encodeAudioBufferToWavBlob(
	audioBuffer: AudioBuffer,
	metadata: AudioPreviewTrackMetadata,
) {
	const target = new BufferTarget();
	const output = new Output({
		format: new WavOutputFormat(),
		target,
	});
	const source = new AudioBufferSource({ codec: "pcm-s16" });
	output.addAudioTrack(source, audioTrackOutputMetadata(metadata));
	await output.start();
	await source.add(audioBuffer);
	source.close();
	await output.finalize();

	if (!target.buffer) {
		throw new Error("WAV output produced no buffer.");
	}

	return {
		blob: new Blob([target.buffer], { type: "audio/wav" }),
		extension: ".wav",
		mimeType: "audio/wav",
		strategy: "decoded-channel-transform-wav",
	} satisfies Awaited<ReturnType<typeof encodeTransformedAudioPreviewBlob>>;
}

async function remuxAudioPreviewTrack({
	assetTrack,
	candidate,
	createObjectURL,
	metadata,
	signal,
	track,
	trackIndex,
}: {
	assetTrack: AudioMediaTrack;
	candidate: RemuxCandidate;
	createObjectURL: (blob: Blob) => string;
	metadata: AudioPreviewTrackMetadata;
	signal: AbortSignal;
	track: InputAudioTrack;
	trackIndex: number;
}): Promise<BrowserAudioPreviewSource> {
	if (!metadata.codec) {
		throw new Error("Track codec is unknown.");
	}

	const format = candidate.createFormat();
	if (!format.getSupportedAudioCodecs().includes(metadata.codec)) {
		throw new Error(`${candidate.label} does not support ${metadata.codec}.`);
	}

	const target = new BufferTarget();
	const output = new Output({ format, target });
	const source = new EncodedAudioPacketSource(metadata.codec);
	output.addAudioTrack(source, audioTrackOutputMetadata(metadata));
	await output.start();

	const sink = new EncodedPacketSink(track);
	const decoderConfig = await track.getDecoderConfig().catch(() => null);
	const shiftSeconds = Number.isFinite(metadata.firstTimestampSeconds)
		? (metadata.firstTimestampSeconds ?? 0)
		: 0;

	for await (const packet of sink.packets()) {
		throwIfAborted(signal);

		const normalizedPacket =
			shiftSeconds === 0
				? packet
				: packet.clone({
						timestamp: packet.timestamp - shiftSeconds,
					});

		await source.add(normalizedPacket, {
			decoderConfig: decoderConfig ?? undefined,
		});
	}

	source.close();
	await output.finalize();

	if (!target.buffer) {
		throw new Error("Remux output produced no buffer.");
	}

	return createAudioPreviewSource({
		assetTrack,
		blob: new Blob([target.buffer], { type: candidate.mimeType }),
		createObjectURL,
		downloadName: `track-${metadata.number}-${candidate.label}${candidate.extension}`,
		metadata,
		mimeType: candidate.mimeType,
		strategy: "same-codec-remux",
		trackIndex,
	});
}

async function createWavAudioPreviewFallback({
	assetTrack,
	createObjectURL,
	metadata,
	signal,
	track,
	trackIndex,
}: {
	assetTrack: AudioMediaTrack;
	createObjectURL: (blob: Blob) => string;
	metadata: AudioPreviewTrackMetadata;
	signal: AbortSignal;
	track: InputAudioTrack;
	trackIndex: number;
}): Promise<BrowserAudioPreviewSource> {
	if (!(await track.canDecode())) {
		throw new Error("Track is not decodable in this browser.");
	}

	const target = new BufferTarget();
	const output = new Output({
		format: new WavOutputFormat(),
		target,
	});
	const sampleSource = new AudioSampleSource({ codec: "pcm-s16" });
	output.addAudioTrack(sampleSource, audioTrackOutputMetadata(metadata));
	await output.start();

	const sink = new AudioSampleSink(track);
	const shiftSeconds = Number.isFinite(metadata.firstTimestampSeconds)
		? (metadata.firstTimestampSeconds ?? 0)
		: 0;

	for await (const sample of sink.samples()) {
		throwIfAborted(signal);

		if (shiftSeconds === 0) {
			try {
				await sampleSource.add(sample);
			} finally {
				sample.close();
			}
			continue;
		}

		const normalizedSample = sample.clone();
		normalizedSample.setTimestamp(Math.max(0, sample.timestamp - shiftSeconds));

		try {
			await sampleSource.add(normalizedSample);
		} finally {
			normalizedSample.close();
			sample.close();
		}
	}

	sampleSource.close();
	await output.finalize();

	if (!target.buffer) {
		throw new Error("WAV output produced no buffer.");
	}

	return createAudioPreviewSource({
		assetTrack,
		blob: new Blob([target.buffer], { type: "audio/wav" }),
		createObjectURL,
		downloadName: `track-${metadata.number}-wav-fallback.wav`,
		metadata,
		mimeType: "audio/wav",
		strategy: "decoded-wav-fallback",
		trackIndex,
	});
}

function createAudioPreviewSource({
	assetTrack,
	blob,
	createObjectURL,
	downloadName,
	metadata,
	mimeType,
	strategy,
	trackIndex,
}: {
	assetTrack: AudioMediaTrack;
	blob: Blob;
	createObjectURL: (blob: Blob) => string;
	downloadName: string;
	metadata: AudioPreviewTrackMetadata;
	mimeType: string;
	strategy: BrowserAudioPreviewSource["strategy"];
	trackIndex: number;
}): BrowserAudioPreviewSource {
	return {
		blob,
		byteLength: blob.size,
		downloadName,
		mimeType,
		startPositionSeconds: Math.max(0, metadata.firstTimestampSeconds ?? 0),
		strategy,
		track: assetTrack,
		trackId: assetTrack.id,
		trackIndex,
		url: createObjectURL(blob),
	};
}

async function describeAudioPreviewTrack(
	track: InputAudioTrack,
	index: number,
): Promise<AudioPreviewTrackMetadata> {
	const firstTimestampSeconds = await track
		.getFirstTimestamp()
		.catch(() => null);

	return {
		codec: track.codec,
		firstTimestampSeconds,
		languageCode: track.languageCode,
		name: track.name,
		number: index + 1,
	};
}

function audioTrackOutputMetadata(metadata: AudioPreviewTrackMetadata) {
	return {
		languageCode:
			metadata.languageCode && metadata.languageCode !== "und"
				? metadata.languageCode
				: undefined,
		name: metadata.name ?? undefined,
	};
}

function throwIfAborted(signal: AbortSignal) {
	if (signal.aborted) {
		throw new DOMException(
			"Audio preview preparation was cancelled.",
			"AbortError",
		);
	}
}

function errorToMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}
