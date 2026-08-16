import {
	ALL_FORMATS,
	AudioSampleSink,
	BlobSource,
	BufferTarget,
	EncodedAudioPacketSource,
	EncodedPacketSink,
	Input,
	Mp4OutputFormat,
	Output,
} from "mediabunny";

import { createBrowserAudioBuffer } from "../../../media-work/adapters/mediabunny-audio-buffer";

export type PreviewAudioBaselineStrategy =
	| "full-track-direct"
	| "remux-decode-bridge";

export type PreviewAudioDecoderWorkMetrics = {
	decodeAudioDataCalls: number;
	decodedFrames: number;
	decodedMediaSeconds: number;
	decodedOutputChunks: number;
	decodedSamples: number;
	metadataPacketScans: number;
	rangeRequests: number;
	remuxedBytes: number;
	remuxedPackets: number;
	windowPulls: number;
};

export type PreviewAudioBaselineCleanupMetrics = {
	buffersReleased: number;
	inputsDisposed: number;
	outputsCancelled: number;
	outputsFinalized: number;
	remuxSourcesClosed: number;
};

export type PreviewAudioBaselineBuffer = {
	audioBuffer: AudioBuffer;
	startSeconds: number;
	trackId: string;
};

export type PreparedPreviewAudioBaseline = {
	readonly buffers: readonly PreviewAudioBaselineBuffer[];
	readonly cleanup: PreviewAudioBaselineCleanupMetrics;
	readonly decoderWork: PreviewAudioDecoderWorkMetrics;
	dispose: () => Promise<void>;
	retainedPcmBytes: () => number;
	strategy: PreviewAudioBaselineStrategy;
};

export type PreparePreviewAudioBaselineOptions = {
	audioContext: Pick<BaseAudioContext, "decodeAudioData">;
	signal: AbortSignal;
	source: Blob;
};

type InputAudioTrack = Awaited<ReturnType<Input["getAudioTracks"]>>[number];

type AudioTrackMetadata = {
	endSeconds: number;
	firstSeconds: number;
	numberOfChannels: number;
	sampleRate: number;
};

export async function prepareFullTrackDirectBaseline({
	signal,
	source,
}: PreparePreviewAudioBaselineOptions): Promise<PreparedPreviewAudioBaseline> {
	const cleanup = createCleanupMetrics();
	const decoderWork = createDecoderWorkMetrics();
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(source),
	});
	let inputDisposed = false;
	const disposeInput = () => {
		if (inputDisposed) return;
		inputDisposed = true;
		cleanup.inputsDisposed += 1;
		input.dispose();
	};
	const abortInput = () => disposeInput();
	signal.addEventListener("abort", abortInput, { once: true });

	try {
		throwIfAborted(signal);
		const tracks = await input.getAudioTracks();
		const buffers = await Promise.all(
			tracks.map(async (track, index) => {
				const metadata = await describeTrack(track);
				const audioBuffer = await decodeDirectTrack({
					decoderWork,
					metadata,
					signal,
					track,
				});

				return {
					audioBuffer,
					startSeconds: metadata.firstSeconds,
					trackId: String(track.id ?? index),
				};
			}),
		);

		return createPreparedBaseline({
			buffers,
			cleanup,
			decoderWork,
			strategy: "full-track-direct",
		});
	} finally {
		signal.removeEventListener("abort", abortInput);
		disposeInput();
	}
}

/**
 * Recreates the retired issue #97/#103 bridge for controlled evidence only.
 * The serial remux followed by Blob.arrayBuffer(), slice(), and concurrent
 * decodeAudioData() is intentionally preserved from commit 162df82^.
 */
export async function prepareRemuxDecodeBridgeBaseline({
	audioContext,
	signal,
	source,
}: PreparePreviewAudioBaselineOptions): Promise<PreparedPreviewAudioBaseline> {
	const cleanup = createCleanupMetrics();
	const decoderWork = createDecoderWorkMetrics();
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(source),
	});
	let inputDisposed = false;
	const disposeInput = () => {
		if (inputDisposed) return;
		inputDisposed = true;
		cleanup.inputsDisposed += 1;
		input.dispose();
	};
	const abortInput = () => disposeInput();
	signal.addEventListener("abort", abortInput, { once: true });

	try {
		throwIfAborted(signal);
		const tracks = await input.getAudioTracks();
		const resources: Array<{
			blob: Blob;
			startSeconds: number;
			trackId: string;
		}> = [];

		// Historical preparation was deliberately serial.
		for (const [index, track] of tracks.entries()) {
			throwIfAborted(signal);
			const firstTimestampSeconds = await track.getFirstTimestamp();
			const blob = await remuxAacTrack({
				cleanup,
				decoderWork,
				firstSeconds: firstTimestampSeconds,
				signal,
				track,
			});
			resources.push({
				blob,
				startSeconds: Math.max(0, firstTimestampSeconds),
				trackId: String(track.id ?? index),
			});
		}

		const buffers = await Promise.all(
			resources.map(async (resource) => {
				throwIfAborted(signal);
				const audioData = await resource.blob.arrayBuffer();
				decoderWork.decodeAudioDataCalls += 1;
				// Preserve the old defensive copy even though decodeAudioData detaches it.
				const audioBuffer = await audioContext.decodeAudioData(
					audioData.slice(0),
				);
				decoderWork.decodedFrames += audioBuffer.length;
				decoderWork.decodedMediaSeconds += audioBuffer.duration;

				return {
					audioBuffer,
					startSeconds: resource.startSeconds,
					trackId: resource.trackId,
				};
			}),
		);

		return createPreparedBaseline({
			buffers,
			cleanup,
			decoderWork,
			strategy: "remux-decode-bridge",
		});
	} finally {
		signal.removeEventListener("abort", abortInput);
		disposeInput();
	}
}

async function decodeDirectTrack({
	decoderWork,
	metadata,
	signal,
	track,
}: {
	decoderWork: PreviewAudioDecoderWorkMetrics;
	metadata: AudioTrackMetadata;
	signal: AbortSignal;
	track: InputAudioTrack;
}) {
	if (!(await track.canDecode())) {
		throw new Error("Track is not decodable in this browser.");
	}

	const outputLength = Math.ceil(
		(metadata.endSeconds - metadata.firstSeconds) * metadata.sampleRate,
	);
	const output = createBrowserAudioBuffer({
		length: outputLength,
		numberOfChannels: metadata.numberOfChannels,
		sampleRate: metadata.sampleRate,
	});
	const encodedGaps = await findEncodedGaps({
		decoderWork,
		endSeconds: metadata.endSeconds,
		sampleRate: metadata.sampleRate,
		signal,
		startSeconds: metadata.firstSeconds,
		track,
	});
	const projectTimestamp = createTimestampProjector(encodedGaps);
	const sink = new AudioSampleSink(track);
	decoderWork.rangeRequests += 1;

	for await (const sample of sink.samples(
		metadata.firstSeconds,
		metadata.endSeconds,
	)) {
		try {
			throwIfAborted(signal);
			decoderWork.decodedSamples += 1;
			decoderWork.decodedFrames += sample.numberOfFrames;
			decoderWork.decodedMediaSeconds += sample.duration;

			const projectedStartFrame = Math.round(
				(projectTimestamp(sample.timestamp) - metadata.firstSeconds) *
					metadata.sampleRate,
			);
			const sourceStartFrame = Math.max(0, -projectedStartFrame);
			const targetStartFrame = Math.max(0, projectedStartFrame);
			const frameCount = Math.max(
				0,
				Math.min(
					sample.numberOfFrames - sourceStartFrame,
					output.length - targetStartFrame,
				),
			);

			for (
				let channel = 0;
				channel < metadata.numberOfChannels && frameCount > 0;
				channel += 1
			) {
				sample.copyTo(
					output
						.getChannelData(channel)
						.subarray(targetStartFrame, targetStartFrame + frameCount),
					{
						format: "f32-planar",
						frameCount,
						frameOffset: sourceStartFrame,
						planeIndex: channel,
					},
				);
			}
		} finally {
			sample.close();
		}
	}

	return output;
}

async function remuxAacTrack({
	cleanup,
	decoderWork,
	firstSeconds,
	signal,
	track,
}: {
	cleanup: PreviewAudioBaselineCleanupMetrics;
	decoderWork: PreviewAudioDecoderWorkMetrics;
	firstSeconds: number;
	signal: AbortSignal;
	track: InputAudioTrack;
}) {
	const codec = await track.getCodec();
	if (codec !== "aac") {
		throw new Error(
			`The recorded remux baseline only supports its measured AAC fixture, got ${codec ?? "unknown"}.`,
		);
	}

	const target = new BufferTarget();
	const output = new Output({
		format: new Mp4OutputFormat({ fastStart: "in-memory" }),
		target,
	});
	const packetSource = new EncodedAudioPacketSource(codec);
	let sourceClosed = false;
	let outputSettled = false;

	try {
		output.addAudioTrack(packetSource);
		await output.start();
		const decoderConfig = await track.getDecoderConfig().catch(() => null);
		const sink = new EncodedPacketSink(track);

		for await (const packet of sink.packets()) {
			throwIfAborted(signal);
			decoderWork.remuxedPackets += 1;
			decoderWork.remuxedBytes += packet.byteLength;
			const normalized =
				firstSeconds === 0
					? packet
					: packet.clone({ timestamp: packet.timestamp - firstSeconds });
			await packetSource.add(normalized, {
				decoderConfig: decoderConfig ?? undefined,
			});
		}

		packetSource.close();
		sourceClosed = true;
		cleanup.remuxSourcesClosed += 1;
		await output.finalize();
		outputSettled = true;
		cleanup.outputsFinalized += 1;
		if (!target.buffer) {
			throw new Error("The remux baseline produced no bytes.");
		}

		return new Blob([target.buffer], { type: "audio/mp4" });
	} finally {
		if (!sourceClosed) {
			packetSource.close();
			cleanup.remuxSourcesClosed += 1;
		}
		if (!outputSettled) {
			await output.cancel().catch(() => undefined);
			cleanup.outputsCancelled += 1;
		}
	}
}

async function describeTrack(
	track: InputAudioTrack,
): Promise<AudioTrackMetadata> {
	const [endSeconds, firstSeconds, numberOfChannels, sampleRate] =
		await Promise.all([
			track.computeDuration(),
			track.getFirstTimestamp(),
			track.getNumberOfChannels(),
			track.getSampleRate(),
		]);

	return {
		endSeconds,
		firstSeconds: Math.max(0, firstSeconds),
		numberOfChannels,
		sampleRate,
	};
}

type EncodedGap = { endSeconds: number; startSeconds: number };

async function findEncodedGaps({
	decoderWork,
	endSeconds,
	sampleRate,
	signal,
	startSeconds,
	track,
}: {
	decoderWork: PreviewAudioDecoderWorkMetrics;
	endSeconds: number;
	sampleRate: number;
	signal: AbortSignal;
	startSeconds: number;
	track: InputAudioTrack;
}) {
	const packets: EncodedGap[] = [];
	const sink = new EncodedPacketSink(track);

	for await (const packet of sink.packets(undefined, undefined, {
		metadataOnly: true,
	})) {
		throwIfAborted(signal);
		decoderWork.metadataPacketScans += 1;
		if (
			packet.timestamp < endSeconds &&
			packet.timestamp + packet.duration > startSeconds
		) {
			packets.push({
				endSeconds: packet.timestamp + packet.duration,
				startSeconds: packet.timestamp,
			});
		}
	}

	packets.sort((left, right) => left.startSeconds - right.startSeconds);
	const gaps: EncodedGap[] = [];
	const tolerance = 2 / sampleRate;
	let previousEnd: number | null = null;
	for (const packet of packets) {
		if (previousEnd !== null && packet.startSeconds - previousEnd > tolerance) {
			gaps.push({
				endSeconds: Math.min(endSeconds, packet.startSeconds),
				startSeconds: Math.max(startSeconds, previousEnd),
			});
		}
		previousEnd = Math.max(
			previousEnd ?? Number.NEGATIVE_INFINITY,
			packet.endSeconds,
		);
	}

	return gaps.filter((gap) => gap.endSeconds > gap.startSeconds);
}

function createTimestampProjector(gaps: EncodedGap[]) {
	let cumulativeGap = 0;
	let index = 0;

	return (timestamp: number) => {
		let projected = timestamp + cumulativeGap;
		while (index < gaps.length) {
			const gap = gaps[index];
			if (!gap || projected < gap.startSeconds) break;
			index += 1;
			if (projected >= gap.endSeconds) continue;
			cumulativeGap += gap.endSeconds - gap.startSeconds;
			projected += gap.endSeconds - gap.startSeconds;
		}
		return projected;
	};
}

function createPreparedBaseline({
	buffers: initialBuffers,
	cleanup,
	decoderWork,
	strategy,
}: {
	buffers: PreviewAudioBaselineBuffer[];
	cleanup: PreviewAudioBaselineCleanupMetrics;
	decoderWork: PreviewAudioDecoderWorkMetrics;
	strategy: PreviewAudioBaselineStrategy;
}): PreparedPreviewAudioBaseline {
	const buffers = [...initialBuffers];
	let disposed = false;

	return {
		get buffers() {
			return buffers;
		},
		cleanup,
		decoderWork,
		async dispose() {
			if (disposed) return;
			disposed = true;
			cleanup.buffersReleased += buffers.length;
			buffers.length = 0;
		},
		retainedPcmBytes() {
			return buffers.reduce(
				(total, item) => total + audioBufferPcmBytes(item.audioBuffer),
				0,
			);
		},
		strategy,
	};
}

export function audioBufferPcmBytes(buffer: AudioBuffer) {
	return (
		buffer.length * buffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT
	);
}

function createDecoderWorkMetrics(): PreviewAudioDecoderWorkMetrics {
	return {
		decodeAudioDataCalls: 0,
		decodedFrames: 0,
		decodedMediaSeconds: 0,
		decodedOutputChunks: 0,
		decodedSamples: 0,
		metadataPacketScans: 0,
		rangeRequests: 0,
		remuxedBytes: 0,
		remuxedPackets: 0,
		windowPulls: 0,
	};
}

function createCleanupMetrics(): PreviewAudioBaselineCleanupMetrics {
	return {
		buffersReleased: 0,
		inputsDisposed: 0,
		outputsCancelled: 0,
		outputsFinalized: 0,
		remuxSourcesClosed: 0,
	};
}

function throwIfAborted(signal: AbortSignal) {
	if (signal.aborted) {
		throw signal.reason instanceof Error
			? signal.reason
			: new DOMException("Preview audio evidence run cancelled.", "AbortError");
	}
}
