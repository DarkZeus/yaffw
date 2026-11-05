import type { Input, InputTrack, InputVideoTrack } from "mediabunny";

import type {
	LocalMediaAssetInspection,
	LocalMediaAssetInspector,
} from "@/editor-core/local-file-analysis";
import type { FrameTiming, FrameTimingAnalysis } from "@/editor-core/model";
import { resolveMediabunnyInputTrackCodec } from "../../media-work/adapters/mediabunny-input-track-metadata";
import { createMediaSourceFailureBoundary } from "../../media-work/scopes/media-source-failure-boundary";

export const inspectBrowserLocalMediaAssetDraft: LocalMediaAssetInspector =
	async (draft, request) => {
		if (!(draft.source instanceof Blob)) {
			throw new Error("Local file analysis requires a browser Blob source.");
		}
		throwIfAborted(request.signal);

		const { ALL_FORMATS, BlobSource, Input } = await import("mediabunny");
		const sourceFailure = createMediaSourceFailureBoundary();

		const input = new Input({
			formats: ALL_FORMATS,
			source: new BlobSource(draft.source, {
				handleUnhandledError: sourceFailure.handleUnhandledError,
			}),
		});
		const unregisterAbort = disposeInputOnAbort(input, request.signal);

		try {
			return await sourceFailure.run(inspectInput(input, request.signal));
		} finally {
			unregisterAbort();
			input.dispose();
		}
	};

async function inspectInput(
	input: Input,
	signal: AbortSignal | undefined,
): Promise<LocalMediaAssetInspection> {
	throwIfAborted(signal);
	if (!(await input.canRead())) {
		throw new Error("Mediabunny cannot read this local media asset.");
	}
	throwIfAborted(signal);
	const [metadataDurationSeconds, videoTracks, audioTracks] = await Promise.all(
		[
			input.getDurationFromMetadata().catch(() => null),
			input.getVideoTracks(),
			input.getAudioTracks(),
		],
	);
	throwIfAborted(signal);
	const durationSeconds = isUsableDuration(metadataDurationSeconds)
		? metadataDurationSeconds
		: await input.computeDuration();
	throwIfAborted(signal);
	const [videoTrackInspections, audioTrackInspections] = await Promise.all([
		Promise.all(
			videoTracks.map(async (track, index) => {
				const [bitrate, codec, height, name, width] = await Promise.all([
					resolveTrackBitrate(track),
					resolveMediabunnyInputTrackCodec(track),
					track.getDisplayHeight(),
					track.getName(),
					track.getDisplayWidth(),
				]);

				return {
					bitrate,
					codec,
					height,
					id: String(track.id),
					label: name || `Video ${index + 1}`,
					width,
				};
			}),
		),
		Promise.all(
			audioTracks.map(async (track, index) => {
				const [bitrate, channels, codec, language, name, sampleRate] =
					await Promise.all([
						resolveTrackBitrate(track),
						track.getNumberOfChannels(),
						resolveMediabunnyInputTrackCodec(track),
						track.getLanguageCode(),
						track.getName(),
						track.getSampleRate(),
					]);

				return {
					bitrate,
					channels,
					codec,
					id: String(track.id),
					label: name || `Audio ${index + 1}`,
					language,
					sampleRate,
				};
			}),
		),
	]);
	throwIfAborted(signal);
	const frameTiming = await computeFrameTiming(videoTracks[0]);
	throwIfAborted(signal);

	return {
		audioTracks: audioTrackInspections,
		durationUs: secondsToMicroseconds(durationSeconds),
		frameTiming,
		videoTracks: videoTrackInspections,
	} satisfies LocalMediaAssetInspection;
}

async function computeFrameTiming(
	track: Pick<InputVideoTrack, "computeFrameRateMetrics"> | undefined,
): Promise<FrameTiming | undefined> {
	if (!track) {
		return undefined;
	}

	try {
		const metrics = await track.computeFrameRateMetrics({
			targetPacketCount: 256,
		});
		const { bestGuessFrameRate, underlyingFrameRate } = metrics;
		// A single packet has no timestamp interval. The library returns the time
		// resolution as its rate in this case, which is not usable frame timing.
		if (
			!Number.isSafeInteger(metrics.probedPacketCount) ||
			metrics.probedPacketCount < 2 ||
			!isUsableFrameRate(bestGuessFrameRate) ||
			!isUsableFrameRate(metrics.averageFrameRate) ||
			!isUsableFrameRate(metrics.medianFrameRate) ||
			!isUsableFrameRate(metrics.minFrameRate) ||
			!isUsableFrameRate(metrics.maxFrameRate) ||
			typeof metrics.frameRateIsConstant !== "boolean" ||
			(underlyingFrameRate === null && metrics.frameRateIsConstant) ||
			(underlyingFrameRate !== null && !isUsableFrameRate(underlyingFrameRate))
		) {
			return undefined;
		}

		const analysis: FrameTimingAnalysis = {
			averageFrameRate: metrics.averageFrameRate,
			frameRateIsConstant: metrics.frameRateIsConstant,
			maxFrameRate: metrics.maxFrameRate,
			medianFrameRate: metrics.medianFrameRate,
			minFrameRate: metrics.minFrameRate,
			probedPacketCount: metrics.probedPacketCount,
			underlyingFrameRate,
		};
		const fps = underlyingFrameRate ?? bestGuessFrameRate;
		const frameDurationUs = Math.max(1, Math.round(1_000_000 / fps));

		if (underlyingFrameRate !== null) {
			return {
				analysis: { ...analysis, underlyingFrameRate },
				fps,
				frameDurationUs,
				source: "known",
			};
		}

		return {
			analysis: { ...analysis, underlyingFrameRate: null },
			fps,
			frameDurationUs,
			reason:
				"No consistent underlying frame rate was detected in the packet sample; frame actions use the estimated rate.",
			source: "estimated",
		};
	} catch {
		return undefined;
	}
}

function isUsableFrameRate(value: number): boolean {
	return (
		Number.isFinite(value) &&
		value > 0 &&
		Number.isSafeInteger(Math.round(1_000_000 / value))
	);
}

async function resolveTrackBitrate(
	track: Pick<InputTrack, "getAverageBitrate" | "getBitrate">,
): Promise<number | undefined> {
	const bitrate =
		(await track.getAverageBitrate()) ?? (await track.getBitrate());

	return bitrate !== null && Number.isFinite(bitrate) && bitrate > 0
		? bitrate
		: undefined;
}

function secondsToMicroseconds(seconds: number): number {
	return Math.round(seconds * 1_000_000);
}

function isUsableDuration(
	durationSeconds: number | null,
): durationSeconds is number {
	return (
		typeof durationSeconds === "number" &&
		Number.isFinite(durationSeconds) &&
		durationSeconds > 0
	);
}

function throwIfAborted(signal: AbortSignal | undefined) {
	if (signal?.aborted) {
		throw signal.reason;
	}
}

function disposeInputOnAbort(
	input: { dispose: () => void },
	signal: AbortSignal | undefined,
) {
	if (!signal) {
		return () => {};
	}

	const disposeInput = () => input.dispose();
	signal.addEventListener("abort", disposeInput, { once: true });
	if (signal.aborted) {
		disposeInput();
	}

	return () => signal.removeEventListener("abort", disposeInput);
}
