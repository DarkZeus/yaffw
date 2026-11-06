import type { ResolvedOutputPlan } from "@/editor-core/model";
import {
	ALL_FORMATS,
	AudioBufferSource,
	type AudioCodec,
	BlobSource,
	BufferTarget,
	Conversion,
	Input,
	Output,
	type VideoCodec,
} from "mediabunny";

import { renderBrowserAudioMix } from "../../audio/engine/browser-audio-mix";
import {
	type DisposableMediaCleanup,
	type DisposableMediaWorkScope,
	createDisposableMediaCleanup,
	withDisposableMediaWorkScope,
} from "../../media-work/scopes/disposable-media-work-scope";
import {
	toMediabunnyAudioQuality,
	toMediabunnyQuality,
} from "../adapters/mediabunny-output-quality";
import { createMediabunnyOutputFormat } from "../adapters/mediabunny-output-support";
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
	audioMix,
	onProgress,
	resolvedOutput,
	selection,
	signal,
	source,
}: DefaultExportRunnerRequest): Promise<DefaultExportRunnerResult> {
	throwIfAborted(signal);
	onProgress({ phase: "preparing" });

	let mixedAudioOutput: MixedAudioOutput | undefined;

	if (resolvedOutput.audioCodec) {
		onProgress({ phase: "preparing", message: "Preparing audio mix." });
		const mixedAudio = await renderBrowserAudioMix({
			audioMix,
			selection,
			signal,
			source,
		});

		if (mixedAudio) {
			mixedAudioOutput = {
				audioBuffer: mixedAudio,
				audioCodec: resolvedOutput.audioCodec as AudioCodec,
				audioQuality: toMediabunnyAudioQuality({
					codec: resolvedOutput.audioCodec as AudioCodec,
					quality: resolvedOutput.audioQuality,
				}),
			};
		}
	}

	return runBrowserMediaExport({
		mixedAudioOutput,
		onProgress,
		resolvedOutput,
		selection,
		signal,
		source,
	});
}

type MixedAudioOutput = {
	audioBuffer: AudioBuffer;
	audioCodec: AudioCodec;
	audioQuality: ConstructorParameters<typeof AudioBufferSource>[0]["quality"];
};

async function runBrowserMediaExport({
	mixedAudioOutput,
	onProgress,
	resolvedOutput,
	selection,
	signal,
	source,
}: Pick<
	DefaultExportRunnerRequest,
	"onProgress" | "selection" | "signal" | "source"
> & {
	mixedAudioOutput?: MixedAudioOutput;
	resolvedOutput: ResolvedOutputPlan;
}): Promise<DefaultExportRunnerResult> {
	return withDisposableMediaWorkScope(async (scope) => {
		const mediabunnyVideoQuality = toMediabunnyQuality(
			resolvedOutput.videoQuality,
		);
		const input = scope.registerDisposable(
			new Input({
				formats: ALL_FORMATS,
				source: new BlobSource(source, {
					handleUnhandledError: scope.handleUnhandledSourceError,
				}),
			}),
		);
		const target = new BufferTarget();
		const output = new Output({
			format: createMediabunnyOutputFormat(
				resolvedOutput.container.id,
				mixedAudioOutput ? { fastStart: true } : {},
			),
			target,
		});
		const outputCleanup = registerCancellableUntilSettled(scope, output);
		const conversion = await Conversion.init({
			audio: { discard: true },
			...(mixedAudioOutput ? { composable: true } : {}),
			// Copied video must keep the Selection-relative timeline because the
			// mixed audio is a separate zero-based source outside this Conversion.
			copy: { shiftTolerance: 0 },
			input,
			output,
			showWarnings: false,
			trim: {
				end: selection.endUs / 1_000_000,
				start: selection.startUs / 1_000_000,
			},
			video: {
				codec: resolvedOutput.videoCodec as VideoCodec,
				...(mediabunnyVideoQuality === undefined
					? {}
					: { quality: mediabunnyVideoQuality }),
				...(resolvedOutput.resolution?.kind === "target-dimensions"
					? {
							height: resolvedOutput.resolution.height,
							width: resolvedOutput.resolution.width,
							fit: "fill" as const,
						}
					: {}),
			},
		});
		const conversionCleanup = registerCancellableUntilSettled(
			scope,
			conversion,
		);

		if (
			mixedAudioOutput &&
			!conversion.utilizedTracks.some((track) => track.type === "video")
		) {
			throw new Error(
				"Default export Conversion could not utilize a video track.",
			);
		}

		const audioSource = mixedAudioOutput
			? new AudioBufferSource({
					codec: mixedAudioOutput.audioCodec,
					...(mixedAudioOutput.audioQuality === undefined
						? {}
						: { quality: mixedAudioOutput.audioQuality }),
				})
			: undefined;
		const closeAudioSource = audioSource
			? registerClosableCleanup(scope, audioSource)
			: undefined;
		if (audioSource) {
			output.addAudioTrack(audioSource, { name: "Mixed audio" });
		}

		throwIfAborted(signal);
		conversion.onProgress = (completedRatio) => {
			onProgress({
				completedRatio: Math.max(0, Math.min(completedRatio, 1)),
				phase: completedRatio >= 1 ? "muxing" : "encoding",
			});
		};

		if (mixedAudioOutput && audioSource && closeAudioSource) {
			const cancelUnsettledOutputWork = async () => {
				await Promise.all([conversionCleanup.cancel(), outputCleanup.cancel()]);
			};
			await raceWithAbort(output.start(), signal, cancelUnsettledOutputWork);
			await raceWithAbort(
				Promise.all([
					conversion.execute(),
					addMixedAudioBufferToSource({
						audioBuffer: mixedAudioOutput.audioBuffer,
						closeSource: closeAudioSource,
						source: audioSource,
					}),
				]),
				signal,
				cancelUnsettledOutputWork,
			);
			conversionCleanup.markSettled();
			onProgress({ completedRatio: 1, phase: "finalizing" });
			await raceWithAbort(output.finalize(), signal, () =>
				outputCleanup.cancel(),
			);
			outputCleanup.markSettled();
		} else {
			await raceWithAbort(conversion.execute(), signal, () =>
				conversionCleanup.cancel(),
			);
			conversionCleanup.markSettled();
			outputCleanup.markSettled();
			onProgress({ completedRatio: 1, phase: "finalizing" });
		}

		if (!target.buffer) {
			throw new Error(
				"Default export failed before producing generated media.",
			);
		}

		const mimeType = resolvedOutput.container.mimeType;

		return {
			blob: new Blob([target.buffer], { type: mimeType }),
			mimeType,
		};
	});
}

async function addMixedAudioBufferToSource({
	audioBuffer,
	closeSource,
	source,
}: {
	audioBuffer: AudioBuffer;
	closeSource: DisposableMediaCleanup;
	source: AudioBufferSource;
}) {
	await source.add(audioBuffer);
	await closeSource();
}

function throwIfAborted(signal: AbortSignal) {
	if (signal.aborted) {
		throw new DefaultExportCancelledError();
	}
}

function raceWithAbort<T>(
	work: Promise<T>,
	signal: AbortSignal,
	cancel: DisposableMediaCleanup,
): Promise<T> {
	if (signal.aborted) {
		return Promise.resolve(cancel()).then(() => {
			throw new DefaultExportCancelledError();
		});
	}

	return new Promise<T>((resolve, reject) => {
		let settled = false;

		async function handleAbort() {
			if (settled) {
				return;
			}

			settled = true;
			try {
				await cancel();
			} finally {
				reject(new DefaultExportCancelledError());
			}
		}

		signal.addEventListener("abort", handleAbort, { once: true });
		work.then(
			(value) => {
				if (settled) {
					return;
				}

				settled = true;
				signal.removeEventListener("abort", handleAbort);
				resolve(value);
			},
			(error) => {
				if (settled) {
					return;
				}

				settled = true;
				signal.removeEventListener("abort", handleAbort);
				reject(error);
			},
		);
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
		if (!settled) {
			await cancel();
		}
	});

	return {
		cancel,
		markSettled() {
			settled = true;
		},
	};
}
