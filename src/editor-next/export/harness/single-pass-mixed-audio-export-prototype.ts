import {
	ALL_FORMATS,
	AudioBufferSource,
	type AudioCodec,
	BlobSource,
	BufferTarget,
	Conversion,
	type ConversionVideoOptions,
	Input,
	Output,
	type VideoCodec,
} from "mediabunny";

import type { Selection } from "@/editor-core/model";
import {
	type DisposableMediaCleanup,
	type DisposableMediaWorkScope,
	createDisposableMediaCleanup,
	withDisposableMediaWorkScope,
} from "../../media-work/scopes/disposable-media-work-scope";
import { createMediabunnyOutputFormat } from "../adapters/mediabunny-output-support";

export type SinglePassMixedAudioExportPrototypeRequest = {
	audioBuffer: AudioBuffer;
	audioCodec: AudioCodec;
	audioQuality?: ConstructorParameters<typeof AudioBufferSource>[0]["quality"];
	containerId: string;
	mimeType: string;
	resolution?: {
		height: number;
		width: number;
	};
	selection: Selection;
	signal: AbortSignal;
	source: Blob;
	videoCodec: VideoCodec;
	videoQuality?: ConversionVideoOptions["quality"];
};

export type SinglePassMixedAudioExportPrototypeResult = {
	blob: Blob;
	metrics: {
		intermediateBytes: 0;
		outputCount: 1;
		videoPipelinePasses: 1;
	};
};

export class SinglePassMixedAudioPrototypeCancelledError extends Error {
	constructor() {
		super("Single-pass mixed-audio export prototype was cancelled.");
		this.name = "SinglePassMixedAudioPrototypeCancelledError";
	}
}

/**
 * Issue #105 investigation code only. Production export continues to use the
 * default runner until the evidence-backed follow-up is approved.
 */
export async function runSinglePassMixedAudioExportPrototype({
	audioBuffer,
	audioCodec,
	audioQuality,
	containerId,
	mimeType,
	resolution,
	selection,
	signal,
	source,
	videoCodec,
	videoQuality,
}: SinglePassMixedAudioExportPrototypeRequest): Promise<SinglePassMixedAudioExportPrototypeResult> {
	throwIfAborted(signal);

	return withDisposableMediaWorkScope(async (scope) => {
		const input = scope.registerDisposable(
			new Input({
				formats: ALL_FORMATS,
				source: new BlobSource(source),
			}),
		);
		const target = new BufferTarget();
		const output = new Output({
			format: createMediabunnyOutputFormat(containerId, { fastStart: true }),
			target,
		});
		const outputCleanup = registerCancellableUntilSettled(scope, output);
		const conversion = await Conversion.init({
			audio: { discard: true },
			composable: true,
			input,
			output,
			showWarnings: false,
			trim: {
				end: selection.endUs / 1_000_000,
				start: selection.startUs / 1_000_000,
			},
			video: {
				codec: videoCodec,
				...(videoQuality === undefined ? {} : { quality: videoQuality }),
				...(resolution
					? {
							...resolution,
							fit: "fill" as const,
						}
					: {}),
			},
		});
		const conversionCleanup = registerCancellableUntilSettled(
			scope,
			conversion,
		);
		const audioSource = new AudioBufferSource({
			codec: audioCodec,
			...(audioQuality === undefined ? {} : { quality: audioQuality }),
		});
		const closeAudioSource = registerClosableCleanup(scope, audioSource);
		const cancelUnsettledOutputWork = async () => {
			await Promise.all([conversionCleanup.cancel(), outputCleanup.cancel()]);
		};

		output.addAudioTrack(audioSource, { name: "Mixed audio" });
		throwIfAborted(signal);
		await raceWithAbort(output.start(), signal, cancelUnsettledOutputWork);

		await raceWithAbort(
			Promise.all([
				conversion.execute(),
				addMixedAudioBuffer({
					audioBuffer,
					closeAudioSource,
					source: audioSource,
				}),
			]),
			signal,
			cancelUnsettledOutputWork,
		);
		conversionCleanup.markSettled();

		await raceWithAbort(output.finalize(), signal, () =>
			outputCleanup.cancel(),
		);
		outputCleanup.markSettled();

		if (!target.buffer) {
			throw new Error(
				"Single-pass prototype finalized without producing generated media.",
			);
		}

		return {
			blob: new Blob([target.buffer], { type: mimeType }),
			metrics: {
				intermediateBytes: 0,
				outputCount: 1,
				videoPipelinePasses: 1,
			},
		};
	});
}

async function addMixedAudioBuffer({
	audioBuffer,
	closeAudioSource,
	source,
}: {
	audioBuffer: AudioBuffer;
	closeAudioSource: DisposableMediaCleanup;
	source: AudioBufferSource;
}) {
	await source.add(audioBuffer);
	await closeAudioSource();
}

function throwIfAborted(signal: AbortSignal) {
	if (signal.aborted) {
		throw new SinglePassMixedAudioPrototypeCancelledError();
	}
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

function raceWithAbort<T>(
	work: Promise<T>,
	signal: AbortSignal,
	cancel: DisposableMediaCleanup,
): Promise<T> {
	if (signal.aborted) {
		return Promise.resolve(cancel()).then(() => {
			throw new SinglePassMixedAudioPrototypeCancelledError();
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
				reject(new SinglePassMixedAudioPrototypeCancelledError());
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
