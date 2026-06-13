import {
	ALL_FORMATS,
	AudioBufferSource,
	BlobSource,
	BufferTarget,
	Conversion,
	EncodedPacketSink,
	EncodedVideoPacketSource,
	Input,
	Mp4OutputFormat,
	Output,
	type VideoCodec,
} from "mediabunny";

import { audioMixHasIncludedTracks } from "@/editor-core/audio-mix";
import type {
	AudioMix,
	ExportProgress,
	ReadyMediaAsset,
	Selection,
} from "@/editor-core/model";
import { renderBrowserAudioMix } from "./browser-audio-mix";

export type DefaultExportRunnerRequest = {
	asset: ReadyMediaAsset;
	audioMix: AudioMix;
	onProgress: (progress: ExportProgress) => void;
	selection: Selection;
	signal: AbortSignal;
	source: Blob;
};

export type DefaultExportRunnerResult = {
	blob: Blob;
	fileName?: string;
	mimeType?: string;
};

export type DefaultExportRunner = {
	cancelSupported: boolean;
	run: (
		request: DefaultExportRunnerRequest,
	) => Promise<DefaultExportRunnerResult>;
};

export class DefaultExportCancelledError extends Error {
	constructor() {
		super("Default export was cancelled.");
		this.name = "DefaultExportCancelledError";
	}
}

export const browserDefaultExportRunner: DefaultExportRunner = {
	cancelSupported: true,
	run: runBrowserDefaultExport,
};

export function isDefaultExportCancelledError(error: unknown): boolean {
	return (
		error instanceof DefaultExportCancelledError ||
		(error instanceof Error && error.name === "AbortError")
	);
}

async function runBrowserDefaultExport({
	audioMix,
	onProgress,
	selection,
	signal,
	source,
}: DefaultExportRunnerRequest): Promise<DefaultExportRunnerResult> {
	if (signal.aborted) {
		throw new DefaultExportCancelledError();
	}

	onProgress({
		phase: "preparing",
	});

	const videoOnlyResult = await runBrowserVideoOnlyExport({
		onProgress,
		selection,
		signal,
		source,
	});

	if (!audioMixHasIncludedTracks(audioMix)) {
		return videoOnlyResult;
	}

	onProgress({
		phase: "preparing",
		message: "Preparing audio mix.",
	});

	const mixedAudio = await renderBrowserAudioMix({
		audioMix,
		selection,
		signal,
		source,
	});

	if (!mixedAudio) {
		return videoOnlyResult;
	}

	onProgress({
		phase: "muxing",
		message: "Muxing mixed audio.",
	});

	const blob = await muxVideoOnlyExportWithMixedAudio({
		audioBuffer: mixedAudio.audioBuffer,
		signal,
		videoOnlyBlob: videoOnlyResult.blob,
	});

	return {
		blob,
		mimeType: "video/mp4",
	};
}

async function runBrowserVideoOnlyExport({
	onProgress,
	selection,
	signal,
	source,
}: Pick<
	DefaultExportRunnerRequest,
	"onProgress" | "selection" | "signal" | "source"
>): Promise<DefaultExportRunnerResult> {
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(source),
	});
	const target = new BufferTarget();
	const output = new Output({
		format: new Mp4OutputFormat(),
		target,
	});

	try {
		const conversion = await Conversion.init({
			audio: {
				discard: true,
			},
			input,
			output,
			showWarnings: false,
			trim: {
				end: selection.endUs / 1_000_000,
				start: selection.startUs / 1_000_000,
			},
			video: {
				codec: "avc",
			},
		});

		if (signal.aborted) {
			await conversion.cancel();
			throw new DefaultExportCancelledError();
		}

		conversion.onProgress = (completedRatio) => {
			onProgress({
				completedRatio: Math.max(0, Math.min(completedRatio, 1)),
				phase: completedRatio >= 1 ? "muxing" : "encoding",
			});
		};

		await raceWithAbort(conversion.execute(), signal, () =>
			conversion.cancel(),
		);

		onProgress({
			completedRatio: 1,
			phase: "finalizing",
		});

		if (!target.buffer) {
			throw new Error(
				"Default export failed before producing generated media.",
			);
		}

		return {
			blob: new Blob([target.buffer], { type: "video/mp4" }),
			mimeType: "video/mp4",
		};
	} finally {
		input.dispose();
	}
}

async function muxVideoOnlyExportWithMixedAudio({
	audioBuffer,
	signal,
	videoOnlyBlob,
}: {
	audioBuffer: AudioBuffer;
	signal: AbortSignal;
	videoOnlyBlob: Blob;
}): Promise<Blob> {
	if (signal.aborted) {
		throw new DefaultExportCancelledError();
	}

	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(videoOnlyBlob),
	});
	const target = new BufferTarget();
	const output = new Output({
		format: new Mp4OutputFormat({ fastStart: "in-memory" }),
		target,
	});

	try {
		const videoTracks = await input.getVideoTracks();
		const videoSources = videoTracks.map((track) => ({
			source: new EncodedVideoPacketSource(requiredVideoCodec(track.codec)),
			track,
		}));
		const audioSource = new AudioBufferSource({
			bitrate: 192_000,
			codec: "aac",
		});

		for (const { source } of videoSources) {
			output.addVideoTrack(source);
		}
		output.addAudioTrack(audioSource, {
			name: "Mixed audio",
		});

		await output.start();

		await raceWithAbort(
			Promise.all([
				...videoSources.map(({ source, track }) =>
					copyEncodedVideoTrackToSource({
						signal,
						source,
						track,
					}),
				),
				addMixedAudioBufferToSource({
					audioBuffer,
					signal,
					source: audioSource,
				}),
			]),
			signal,
			() => output.cancel(),
		);

		await output.finalize();

		if (!target.buffer) {
			throw new Error("Default export mux failed before producing media.");
		}

		return new Blob([target.buffer], { type: "video/mp4" });
	} finally {
		input.dispose();
	}
}

function requiredVideoCodec(codec: VideoCodec | null | undefined): VideoCodec {
	if (!codec) {
		throw new Error("Generated video track is missing a codec.");
	}

	return codec;
}

async function copyEncodedVideoTrackToSource({
	signal,
	source,
	track,
}: {
	signal: AbortSignal;
	source: EncodedVideoPacketSource;
	track: Awaited<ReturnType<Input["getVideoTracks"]>>[number];
}) {
	const sink = new EncodedPacketSink(track);
	const decoderConfig = await track.getDecoderConfig().catch(() => null);
	const firstTimestamp = await track.getFirstTimestamp().catch(() => 0);
	const shiftSeconds = Number.isFinite(firstTimestamp) ? firstTimestamp : 0;

	for await (const packet of sink.packets()) {
		if (signal.aborted) {
			throw new DefaultExportCancelledError();
		}

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
}

async function addMixedAudioBufferToSource({
	audioBuffer,
	signal,
	source,
}: {
	audioBuffer: AudioBuffer;
	signal: AbortSignal;
	source: AudioBufferSource;
}) {
	if (signal.aborted) {
		throw new DefaultExportCancelledError();
	}

	await source.add(audioBuffer);
	source.close();
}

function raceWithAbort<T>(
	work: Promise<T>,
	signal: AbortSignal,
	cancel: () => Promise<unknown>,
): Promise<T> {
	if (signal.aborted) {
		void cancel();
		return Promise.reject(new DefaultExportCancelledError());
	}

	return new Promise<T>((resolve, reject) => {
		function handleAbort() {
			void cancel();
			reject(new DefaultExportCancelledError());
		}

		signal.addEventListener("abort", handleAbort, { once: true });

		work.then(resolve, reject).finally(() => {
			signal.removeEventListener("abort", handleAbort);
		});
	});
}
