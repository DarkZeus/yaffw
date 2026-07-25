import {
	ALL_FORMATS,
	AdtsOutputFormat,
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

import {
	type DisposableMediaCleanup,
	type DisposableMediaWorkScope,
	createDisposableMediaCleanup,
	withDisposableMediaWorkScope,
} from "../../media-work/scopes/disposable-media-work-scope";
import type {
	AudioPreviewTrackMetadata,
	CreatePreviewAudioResourceOptions,
	InputAudioTrack,
	PreparePreviewAudioTrackResourceOptions,
	PreparePreviewAudioTrackResourceResult,
	PreviewAudioResource,
	PreviewAudioResourceFailure,
	PreviewAudioResourcesRequest,
	PreviewAudioResourcesResult,
	PreviewAudioTrackResourceOptions,
	RemuxCandidate,
	RemuxPreviewAudioTrackResourceOptions,
} from "../types/preview-audio-resources.types";

export async function preparePreviewAudioResources({
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

async function preparePreviewAudioTrackResource({
	assetTrack,
	createObjectURL,
	metadata,
	revokeObjectURL,
	scope,
	signal,
	track,
	trackIndex,
}: PreparePreviewAudioTrackResourceOptions): Promise<PreparePreviewAudioTrackResourceResult> {
	const reasons: string[] = [];

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
		reason:
			reasons.join("; ") || "No Preview audio resource could be prepared.",
		status: "failed",
	};
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
