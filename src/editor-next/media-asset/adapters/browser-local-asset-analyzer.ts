import type {
	LocalMediaAssetInspection,
	LocalMediaAssetInspector,
} from "@/editor-core/local-file-analysis";
import type { FrameTiming } from "@/editor-core/model";

export type BrowserVideoTrack = {
	computePacketStats: (targetPacketCount?: number) => Promise<{
		averagePacketRate: number;
	}>;
	displayHeight: number;
	displayWidth: number;
};

export const inspectBrowserLocalMediaAssetDraft: LocalMediaAssetInspector =
	async (draft, request) => {
		if (!(draft.source instanceof Blob)) {
			throw new Error("Local file analysis requires a browser Blob source.");
		}
		throwIfAborted(request.signal);

		const { ALL_FORMATS, BlobSource, Input } = await import("mediabunny");

		const input = new Input({
			formats: ALL_FORMATS,
			source: new BlobSource(draft.source),
		});
		const unregisterAbort = disposeInputOnAbort(input, request.signal);

		try {
			throwIfAborted(request.signal);
			if (!(await input.canRead())) {
				throw new Error("Mediabunny cannot read this local media asset.");
			}
			throwIfAborted(request.signal);
			const [metadataDurationSeconds, videoTracks, audioTracks] =
				await Promise.all([
					input.getDurationFromMetadata().catch(() => null),
					input.getVideoTracks(),
					input.getAudioTracks(),
				]);
			throwIfAborted(request.signal);
			const durationSeconds = isUsableDuration(metadataDurationSeconds)
				? metadataDurationSeconds
				: await input.computeDuration();
			throwIfAborted(request.signal);
			const [videoTrackInspections, audioTrackInspections] = await Promise.all([
				Promise.all(
					videoTracks.map(async (track, index) => ({
						codec: readableCodec(
							(await track.getCodecParameterString()) ??
								track.codec ??
								track.internalCodecId,
						),
						height: track.displayHeight,
						id: String(track.id),
						label: track.name || `Video ${index + 1}`,
						width: track.displayWidth,
					})),
				),
				Promise.all(
					audioTracks.map(async (track, index) => ({
						channels: track.numberOfChannels,
						codec: readableCodec(
							(await track.getCodecParameterString()) ??
								track.codec ??
								track.internalCodecId,
						),
						id: String(track.id),
						label: track.name || `Audio ${index + 1}`,
						language: track.languageCode,
						sampleRate: track.sampleRate,
					})),
				),
			]);
			const frameTiming = await computeFrameTiming(videoTracks[0]);
			throwIfAborted(request.signal);

			return {
				audioTracks: audioTrackInspections,
				durationUs: secondsToMicroseconds(durationSeconds),
				frameTiming,
				videoTracks: videoTrackInspections,
			} satisfies LocalMediaAssetInspection;
		} finally {
			unregisterAbort();
			input.dispose();
		}
	};

async function computeFrameTiming(
	track: BrowserVideoTrack | undefined,
): Promise<FrameTiming | undefined> {
	if (!track) {
		return undefined;
	}

	try {
		const stats = await track.computePacketStats(30);

		if (
			Number.isFinite(stats.averagePacketRate) &&
			stats.averagePacketRate > 0
		) {
			return {
				fps: stats.averagePacketRate,
				frameDurationUs: Math.max(
					1,
					Math.round(1_000_000 / stats.averagePacketRate),
				),
				source: "known",
			};
		}
	} catch {
		return undefined;
	}

	return undefined;
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

function readableCodec(codec: unknown): string | undefined {
	return typeof codec === "string" && codec.length > 0 ? codec : undefined;
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
