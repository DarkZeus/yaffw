import {
	ALL_FORMATS,
	AudioBufferSource,
	type AudioCodec,
	BlobSource,
	BufferTarget,
	Conversion,
	EncodedPacketSink,
	EncodedVideoPacketSource,
	Input,
	Output,
	type VideoCodec,
} from "mediabunny";

import {
	audioMixPlanHasIncludedTracks,
	createAudioMixPlan,
} from "@/editor-core/audio-mix-plan";
import {
	resolveOutputPlan,
	resolveOutputQuality,
	resolveOutputResolution,
} from "@/editor-core/output-settings";
import { renderBrowserAudioMix } from "../../audio/engine/browser-audio-mix";
import {
	type DisposableMediaCleanup,
	type DisposableMediaWorkScope,
	createDisposableMediaCleanup,
	withDisposableMediaWorkScope,
} from "../../media-work/scopes/disposable-media-work-scope";
import {
	toMediabunnyAudioBitrate,
	toMediabunnyBitrate,
} from "../adapters/mediabunny-output-quality";
import {
	MEDIABUNNY_OUTPUT_SUPPORT,
	createMediabunnyOutputFormat,
} from "../adapters/mediabunny-output-support";
import type {
	DefaultExportRunner,
	DefaultExportRunnerRequest,
	DefaultExportRunnerResult,
} from "../types/default-export-runner.types";

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
	asset,
	audioMix,
	onProgress,
	outputSettings,
	resolvedOutput: suppliedResolvedOutput,
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

	const resolved = suppliedResolvedOutput
		? { kind: "resolved" as const, plan: suppliedResolvedOutput }
		: resolveOutputPlan({
				asset,
				audioMix,
				outputSettings,
				support: MEDIABUNNY_OUTPUT_SUPPORT,
			});
	if (resolved.kind === "invalid") {
		throw new Error(resolved.error);
	}
	const resolvedOutput = resolved.plan;

	const videoOnlyResult = await runBrowserVideoOnlyExport({
		asset,
		onProgress,
		outputSettings,
		resolvedOutput,
		selection,
		signal,
		source,
	});

	const mixPlan = createAudioMixPlan({
		audioMix,
		trackIds: Object.keys(audioMix.tracks),
	});

	if (!audioMixPlanHasIncludedTracks(mixPlan)) {
		return videoOnlyResult;
	}

	if (!resolvedOutput.audioCodec) {
		return videoOnlyResult;
	}
	const audioQuality = resolveOutputQuality({
		mediaKind: "audio",
		setting: resolvedOutput.audioQuality,
	});
	if (audioQuality.kind === "invalid") {
		throw new Error(audioQuality.error);
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
		audioBitrate: toMediabunnyAudioBitrate({
			codec: resolvedOutput.audioCodec as AudioCodec,
			quality: audioQuality,
		}),
		audioCodec: resolvedOutput.audioCodec as AudioCodec,
		containerId: resolvedOutput.container.id,
		signal,
		videoOnlyBlob: videoOnlyResult.blob,
	});

	return {
		blob,
		mimeType: resolvedOutput.container.mimeType,
	};
}

async function runBrowserVideoOnlyExport({
	asset,
	onProgress,
	outputSettings,
	resolvedOutput,
	selection,
	signal,
	source,
}: Pick<
	DefaultExportRunnerRequest,
	| "asset"
	| "onProgress"
	| "outputSettings"
	| "resolvedOutput"
	| "selection"
	| "signal"
	| "source"
>): Promise<DefaultExportRunnerResult> {
	return withDisposableMediaWorkScope(async (scope) => {
		const resolution = resolveOutputResolution({
			asset,
			setting: outputSettings.resolution,
		});
		if (resolution.kind === "invalid") {
			throw new Error(resolution.error);
		}
		const videoQuality = resolveOutputQuality({
			mediaKind: "video",
			setting: resolvedOutput?.videoQuality ?? outputSettings.videoQuality,
		});
		if (videoQuality.kind === "invalid") {
			throw new Error(videoQuality.error);
		}
		const videoBitrate = toMediabunnyBitrate(videoQuality);

		const input = scope.registerDisposable(
			new Input({
				formats: ALL_FORMATS,
				source: new BlobSource(source),
			}),
		);
		const target = new BufferTarget();
		const output = new Output({
			format: createMediabunnyOutputFormat(
				resolvedOutput?.container.id ?? "mp4",
			),
			target,
		});
		const outputCleanup = registerCancellableUntilSettled(scope, output);
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
				codec: (resolvedOutput?.videoCodec ?? "avc") as VideoCodec,
				...(videoBitrate === undefined ? {} : { bitrate: videoBitrate }),
				...(resolution.conversionDimensions
					? {
							...resolution.conversionDimensions,
							fit: "fill" as const,
						}
					: {}),
			},
		});
		const conversionCleanup = registerCancellableUntilSettled(
			scope,
			conversion,
		);

		if (signal.aborted) {
			await conversionCleanup.cancel();
			throw new DefaultExportCancelledError();
		}

		conversion.onProgress = (completedRatio) => {
			onProgress({
				completedRatio: Math.max(0, Math.min(completedRatio, 1)),
				phase: completedRatio >= 1 ? "muxing" : "encoding",
			});
		};

		await raceWithAbort(conversion.execute(), signal, () =>
			conversionCleanup.cancel(),
		);
		conversionCleanup.markSettled();
		outputCleanup.markSettled();

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
			blob: new Blob([target.buffer], {
				type: resolvedOutput?.container.mimeType ?? "video/mp4",
			}),
			mimeType: resolvedOutput?.container.mimeType ?? "video/mp4",
		};
	});
}

async function muxVideoOnlyExportWithMixedAudio({
	audioBuffer,
	audioBitrate,
	audioCodec,
	containerId,
	signal,
	videoOnlyBlob,
}: {
	audioBuffer: AudioBuffer;
	audioBitrate: ConstructorParameters<typeof AudioBufferSource>[0]["bitrate"];
	audioCodec: AudioCodec;
	containerId: string;
	signal: AbortSignal;
	videoOnlyBlob: Blob;
}): Promise<Blob> {
	if (signal.aborted) {
		throw new DefaultExportCancelledError();
	}

	return withDisposableMediaWorkScope(async (scope) => {
		const input = scope.registerDisposable(
			new Input({
				formats: ALL_FORMATS,
				source: new BlobSource(videoOnlyBlob),
			}),
		);
		const target = new BufferTarget();
		const output = new Output({
			format: createMediabunnyOutputFormat(containerId, { fastStart: true }),
			target,
		});
		const outputCleanup = registerCancellableUntilSettled(scope, output);
		const videoTracks = await input.getVideoTracks();
		const videoSources = videoTracks.map((track) => {
			const source = new EncodedVideoPacketSource(
				requiredVideoCodec(track.codec),
			);

			return {
				closeSource: registerClosableCleanup(scope, source),
				source,
				track,
			};
		});
		const audioSource = new AudioBufferSource({
			...(audioBitrate === undefined ? {} : { bitrate: audioBitrate }),
			codec: audioCodec,
		});
		const closeAudioSource = registerClosableCleanup(scope, audioSource);

		for (const { source } of videoSources) {
			output.addVideoTrack(source);
		}
		output.addAudioTrack(audioSource, {
			name: "Mixed audio",
		});

		await output.start();

		await raceWithAbort(
			Promise.all([
				...videoSources.map(({ closeSource, source, track }) =>
					copyEncodedVideoTrackToSource({
						closeSource,
						signal,
						source,
						track,
					}),
				),
				addMixedAudioBufferToSource({
					audioBuffer,
					closeSource: closeAudioSource,
					signal,
					source: audioSource,
				}),
			]),
			signal,
			() => outputCleanup.cancel(),
		);

		await raceWithAbort(output.finalize(), signal, () =>
			outputCleanup.cancel(),
		);
		outputCleanup.markSettled();

		if (!target.buffer) {
			throw new Error("Default export mux failed before producing media.");
		}

		return new Blob([target.buffer], {
			type:
				MEDIABUNNY_OUTPUT_SUPPORT.containers.find(
					({ id }) => id === containerId,
				)?.mimeType ?? "application/octet-stream",
		});
	});
}

function requiredVideoCodec(codec: VideoCodec | null | undefined): VideoCodec {
	if (!codec) {
		throw new Error("Generated video track is missing a codec.");
	}

	return codec;
}

async function copyEncodedVideoTrackToSource({
	closeSource,
	signal,
	source,
	track,
}: {
	closeSource: DisposableMediaCleanup;
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

	await closeSource();
}

async function addMixedAudioBufferToSource({
	audioBuffer,
	closeSource,
	signal,
	source,
}: {
	audioBuffer: AudioBuffer;
	closeSource: DisposableMediaCleanup;
	signal: AbortSignal;
	source: AudioBufferSource;
}) {
	if (signal.aborted) {
		throw new DefaultExportCancelledError();
	}

	await source.add(audioBuffer);
	await closeSource();
}

function raceWithAbort<T>(
	work: Promise<T>,
	signal: AbortSignal,
	cancel: DisposableMediaCleanup,
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

function registerClosableCleanup<T extends { close: () => void }>(
	scope: DisposableMediaWorkScope,
	resource: T,
) {
	const close = createDisposableMediaCleanup(async () => {
		resource.close();
	});

	scope.registerCleanup(close);

	return close;
}

function registerCancellableUntilSettled<
	T extends { cancel: () => Promise<unknown> },
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
