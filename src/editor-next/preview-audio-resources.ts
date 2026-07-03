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
	WavOutputFormat,
	WebMOutputFormat,
} from "mediabunny";

import type { AudioTrackChannelMode } from "@/editor-core/model";
import {
	createAudioBuffer,
	createChannelCompensatedAudioBuffer,
	createPeakSafeAudioBuffer,
	createTransformedAudioBuffer,
	outputChannelCountForMode,
	resolveChannelTransform,
} from "./browser-audio-mix";
import type {
	AudioPreviewTrackMetadata,
	PreviewAudioTrackResourceOptions,
	PreviewAudioResource,
	PreviewAudioResourceFailure,
	PreviewAudioResourcesRequest,
	PreviewAudioResourcesResult,
	CreatePreviewAudioResourceOptions,
	CreateTransformedPreviewAudioTrackResourceOptions,
	InputAudioTrack,
	PreparePreviewAudioTrackResourceOptions,
	PreparePreviewAudioTrackResourceResult,
	RemuxPreviewAudioTrackResourceOptions,
	RemuxCandidate,
} from "./preview-audio-resources.types";
import {
	type DisposableMediaCleanup,
	type DisposableMediaWorkScope,
	createDisposableMediaCleanup,
	withDisposableMediaWorkScope,
} from "./disposable-media-work-scope";

export async function preparePreviewAudioResources({
	audioMix,
	asset,
	createObjectURL = URL.createObjectURL,
	revokeObjectURL = URL.revokeObjectURL,
	signal,
	source,
	trackIds,
}: PreviewAudioResourcesRequest): Promise<PreviewAudioResourcesResult> {
	return withDisposableMediaWorkScope(async (scope) => {
		throwIfAborted(signal);

		if (asset.tracks.audio.length === 0) {
			return {
				failures: [],
				resources: [],
			};
		}

		const input = scope.registerDisposable(
			new Input({
				formats: ALL_FORMATS,
				source: new BlobSource(source),
			}),
		);
		const resources: PreviewAudioResource[] = [];
		const failures: PreviewAudioResourceFailure[] = [];

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

				const metadata = await describeAudioPreviewTrack(
					inputTrack,
					trackIndex,
				);
				const preparedResource = await preparePreviewAudioTrackResource({
					assetTrack,
					createObjectURL,
					decision: audioMix.tracks[assetTrack.id],
					finalPeakGuardDb: audioMix.finalPeakGuardDb,
					metadata,
					revokeObjectURL,
					scope,
					signal,
					track: inputTrack,
					trackIndex,
				});

				if (preparedResource.status === "ready") {
					resources.push(preparedResource.resource);
					continue;
				}

				failures.push({
					reason: preparedResource.reason,
					track: assetTrack,
					trackId: assetTrack.id,
					trackIndex,
				});
			}

			return {
				failures,
				resources,
			};
		} catch (error) {
			revokePreviewAudioResources({
				revokeObjectURL,
				resources,
			});
			throw error;
		}
	});
}

export function revokePreviewAudioResources({
	revokeObjectURL = URL.revokeObjectURL,
	resources,
}: {
	revokeObjectURL?: (url: string) => void;
	resources: PreviewAudioResource[];
}) {
	for (const resource of resources) {
		revokeObjectURL(resource.url);
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

export function shouldPrepareTransformedPreviewAudioResource(
	channelMode: AudioTrackChannelMode,
): channelMode is Exclude<AudioTrackChannelMode, "preserve"> {
	void channelMode;

	return false;
}

async function preparePreviewAudioTrackResource({
	assetTrack,
	createObjectURL,
	decision,
	finalPeakGuardDb,
	metadata,
	revokeObjectURL,
	scope,
	signal,
	track,
	trackIndex,
}: PreparePreviewAudioTrackResourceOptions): Promise<PreparePreviewAudioTrackResourceResult> {
	const reasons: string[] = [];
	const channelMode = decision?.channelMode ?? "preserve";

	if (shouldPrepareTransformedPreviewAudioResource(channelMode)) {
		try {
			const resource = await createTransformedPreviewAudioTrackResource({
				assetTrack,
				channelMode,
				createObjectURL,
				finalPeakGuardDb,
				metadata,
				revokeObjectURL,
				scope,
				signal,
				track,
				trackIndex,
			});

			return {
				resource,
				status: "ready",
			};
		} catch (error) {
			reasons.push(`decoded-channel-transform: ${errorToMessage(error)}`);
		}
	}

	for (const candidate of remuxCandidatesForAudioPreviewCodec(metadata.codec)) {
		throwIfAborted(signal);

		try {
			const resource = await remuxPreviewAudioTrackResource({
				assetTrack,
				candidate,
				createObjectURL,
				metadata,
				revokeObjectURL,
				scope,
				signal,
				track,
				trackIndex,
			});

			return {
				resource,
				status: "ready",
			};
		} catch (error) {
			reasons.push(`${candidate.label}: ${errorToMessage(error)}`);
		}
	}

	try {
		const resource = await createWavPreviewAudioResourceFallback({
			assetTrack,
			createObjectURL,
			metadata,
			revokeObjectURL,
			scope,
			signal,
			track,
			trackIndex,
		});

		return {
			resource,
			status: "ready",
		};
	} catch (error) {
		reasons.push(`wav-fallback: ${errorToMessage(error)}`);
	}

	return {
		reason: reasons.join("; ") || "No Preview audio resource could be prepared.",
		status: "failed",
	};
}

async function createTransformedPreviewAudioTrackResource({
	assetTrack,
	channelMode,
	createObjectURL,
	finalPeakGuardDb,
	metadata,
	revokeObjectURL,
	scope,
	signal,
	track,
	trackIndex,
}: CreateTransformedPreviewAudioTrackResourceOptions): Promise<PreviewAudioResource> {
	if (!(await track.canDecode())) {
		throw new Error("Track is not decodable in this browser.");
	}

	const decoded = await decodePreviewAudioTrackToBuffer({
		metadata,
		scope,
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
	const encoded = await encodeTransformedPreviewAudioBlob(
		peakSafe,
		metadata,
		scope,
	);

	return createPreviewAudioResource({
		assetTrack,
		blob: encoded.blob,
		createObjectURL,
		downloadName: `track-${metadata.number}-${channelMode}${encoded.extension}`,
		metadata,
		mimeType: encoded.mimeType,
		revokeObjectURL,
		scope,
		strategy: encoded.strategy,
		trackIndex,
	});
}

async function decodePreviewAudioTrackToBuffer({
	metadata,
	scope,
	signal,
	track,
}: {
	metadata: AudioPreviewTrackMetadata;
	scope: DisposableMediaWorkScope;
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
		const closeSample = registerClosableCleanup(scope, sample);

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
			await closeSample();
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

async function encodeTransformedPreviewAudioBlob(
	audioBuffer: AudioBuffer,
	metadata: AudioPreviewTrackMetadata,
	scope: DisposableMediaWorkScope,
): Promise<{
	blob: Blob;
	extension: string;
	mimeType: string;
	strategy: Extract<
		PreviewAudioResource["strategy"],
		"decoded-channel-transform-aac-m4a" | "decoded-channel-transform-wav"
	>;
}> {
	try {
		return await encodeAudioBufferToM4aBlob(audioBuffer, metadata, scope);
	} catch {
		return encodeAudioBufferToWavBlob(audioBuffer, metadata, scope);
	}
}

async function encodeAudioBufferToM4aBlob(
	audioBuffer: AudioBuffer,
	metadata: AudioPreviewTrackMetadata,
	scope: DisposableMediaWorkScope,
) {
	const target = new BufferTarget();
	const output = new Output({
		format: new Mp4OutputFormat({ fastStart: "in-memory" }),
		target,
	});
	const outputCleanup = registerCancellableUntilSettled(scope, output);
	const source = new AudioBufferSource({
		bitrate: 192_000,
		codec: "aac",
	});
	const closeSource = registerClosableCleanup(scope, source);
	output.addAudioTrack(source, audioTrackOutputMetadata(metadata));
	await output.start();
	await source.add(audioBuffer);
	await closeSource();
	await output.finalize();
	outputCleanup.markSettled();

	if (!target.buffer) {
		throw new Error("M4A output produced no buffer.");
	}

	return {
		blob: new Blob([target.buffer], { type: "audio/mp4" }),
		extension: ".m4a",
		mimeType: "audio/mp4",
		strategy: "decoded-channel-transform-aac-m4a",
	} satisfies Awaited<ReturnType<typeof encodeTransformedPreviewAudioBlob>>;
}

async function encodeAudioBufferToWavBlob(
	audioBuffer: AudioBuffer,
	metadata: AudioPreviewTrackMetadata,
	scope: DisposableMediaWorkScope,
) {
	const target = new BufferTarget();
	const output = new Output({
		format: new WavOutputFormat(),
		target,
	});
	const outputCleanup = registerCancellableUntilSettled(scope, output);
	const source = new AudioBufferSource({ codec: "pcm-s16" });
	const closeSource = registerClosableCleanup(scope, source);
	output.addAudioTrack(source, audioTrackOutputMetadata(metadata));
	await output.start();
	await source.add(audioBuffer);
	await closeSource();
	await output.finalize();
	outputCleanup.markSettled();

	if (!target.buffer) {
		throw new Error("WAV output produced no buffer.");
	}

	return {
		blob: new Blob([target.buffer], { type: "audio/wav" }),
		extension: ".wav",
		mimeType: "audio/wav",
		strategy: "decoded-channel-transform-wav",
	} satisfies Awaited<ReturnType<typeof encodeTransformedPreviewAudioBlob>>;
}

async function remuxPreviewAudioTrackResource({
	assetTrack,
	candidate,
	createObjectURL,
	metadata,
	revokeObjectURL,
	scope,
	signal,
	track,
	trackIndex,
}: RemuxPreviewAudioTrackResourceOptions): Promise<PreviewAudioResource> {
	if (!metadata.codec) {
		throw new Error("Track codec is unknown.");
	}

	const format = candidate.createFormat();
	if (!format.getSupportedAudioCodecs().includes(metadata.codec)) {
		throw new Error(`${candidate.label} does not support ${metadata.codec}.`);
	}

	const target = new BufferTarget();
	const output = new Output({ format, target });
	const outputCleanup = registerCancellableUntilSettled(scope, output);
	const source = new EncodedAudioPacketSource(metadata.codec);
	const closeSource = registerClosableCleanup(scope, source);
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

	await closeSource();
	await output.finalize();
	outputCleanup.markSettled();

	if (!target.buffer) {
		throw new Error("Remux output produced no buffer.");
	}

	return createPreviewAudioResource({
		assetTrack,
		blob: new Blob([target.buffer], { type: candidate.mimeType }),
		createObjectURL,
		downloadName: `track-${metadata.number}-${candidate.label}${candidate.extension}`,
		metadata,
		mimeType: candidate.mimeType,
		revokeObjectURL,
		scope,
		strategy: "same-codec-remux",
		trackIndex,
	});
}

async function createWavPreviewAudioResourceFallback({
	assetTrack,
	createObjectURL,
	metadata,
	revokeObjectURL,
	scope,
	signal,
	track,
	trackIndex,
}: PreviewAudioTrackResourceOptions): Promise<PreviewAudioResource> {
	if (!(await track.canDecode())) {
		throw new Error("Track is not decodable in this browser.");
	}

	const target = new BufferTarget();
	const output = new Output({
		format: new WavOutputFormat(),
		target,
	});
	const outputCleanup = registerCancellableUntilSettled(scope, output);
	const sampleSource = new AudioSampleSource({ codec: "pcm-s16" });
	const closeSampleSource = registerClosableCleanup(scope, sampleSource);
	output.addAudioTrack(sampleSource, audioTrackOutputMetadata(metadata));
	await output.start();

	const sink = new AudioSampleSink(track);
	const shiftSeconds = Number.isFinite(metadata.firstTimestampSeconds)
		? (metadata.firstTimestampSeconds ?? 0)
		: 0;

	for await (const sample of sink.samples()) {
		throwIfAborted(signal);
		const closeSample = registerClosableCleanup(scope, sample);

		try {
			if (shiftSeconds === 0) {
				await sampleSource.add(sample);
				continue;
			}

			const normalizedSample = sample.clone();
			const closeNormalizedSample = registerClosableCleanup(
				scope,
				normalizedSample,
			);
			normalizedSample.setTimestamp(
				Math.max(0, sample.timestamp - shiftSeconds),
			);

			try {
				await sampleSource.add(normalizedSample);
			} finally {
				await closeNormalizedSample();
			}
		} finally {
			await closeSample();
		}
	}

	await closeSampleSource();
	await output.finalize();
	outputCleanup.markSettled();

	if (!target.buffer) {
		throw new Error("WAV output produced no buffer.");
	}

	return createPreviewAudioResource({
		assetTrack,
		blob: new Blob([target.buffer], { type: "audio/wav" }),
		createObjectURL,
		downloadName: `track-${metadata.number}-wav-fallback.wav`,
		metadata,
		mimeType: "audio/wav",
		revokeObjectURL,
		scope,
		strategy: "decoded-wav-fallback",
		trackIndex,
	});
}

function createPreviewAudioResource({
	assetTrack,
	blob,
	createObjectURL,
	downloadName,
	metadata,
	mimeType,
	revokeObjectURL,
	scope,
	strategy,
	trackIndex,
}: CreatePreviewAudioResourceOptions): PreviewAudioResource {
	const url = createObjectURL(blob);
	let transferred = false;

	scope.registerCleanup(() => {
		if (!transferred) {
			revokeObjectURL(url);
		}
	});

	transferred = true;

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
		url,
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

function registerClosableCleanup<T extends { close: () => void }>(
	scope: DisposableMediaWorkScope,
	resource: T,
): DisposableMediaCleanup {
	const close = createDisposableMediaCleanup(async () => {
		resource.close();
	});

	scope.registerCleanup(close);

	return close;
}

function registerCancellableUntilSettled<
	T extends { cancel: () => Promise<unknown> | unknown },
>(scope: DisposableMediaWorkScope, resource: T) {
	let settled = false;
	const cancel = createDisposableMediaCleanup(async () => {
		await resource.cancel();
	});

	scope.registerCleanup(async () => {
		if (settled) {
			return;
		}

		await cancel();
	});

	return {
		cancel,
		markSettled() {
			settled = true;
		},
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
