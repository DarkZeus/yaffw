import type {
	LocalMediaAssetInspection,
	LocalMediaAssetInspector,
} from "@/editor-core/local-file-analysis";
import type { FrameTiming } from "@/editor-core/model";
import type {
	BrowserVideoTrack,
	CanEncodeDefaultProfileOptions,
} from "./browser-local-asset-analyzer.types";

export const inspectBrowserLocalMediaAssetDraft: LocalMediaAssetInspector =
	async (draft) => {
		if (!(draft.source instanceof Blob)) {
			throw new Error("Local file analysis requires a browser Blob source.");
		}

		const {
			ALL_FORMATS,
			BlobSource,
			Input,
			QUALITY_HIGH,
			canEncodeAudio,
			canEncodeVideo,
		} = await import("mediabunny");

		const input = new Input({
			formats: ALL_FORMATS,
			source: new BlobSource(draft.source),
		});

		try {
			const [durationSeconds, videoTracks, audioTracks] = await Promise.all([
				input.computeDuration(),
				input.getVideoTracks(),
				input.getAudioTracks(),
			]);
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

			return {
				audioTracks: audioTrackInspections,
				defaultProfileExportable: await canExportDefaultProfile({
					audioTracks,
					canEncodeAudio,
					canEncodeVideo,
					qualityHigh: QUALITY_HIGH,
					videoTracks,
				}),
				durationUs: secondsToMicroseconds(durationSeconds),
				frameTiming: await computeFrameTiming(videoTracks[0]),
				previewable:
					videoTracks.length > 0 &&
					(
						await Promise.all(videoTracks.map((track) => track.canDecode()))
					).every(Boolean),
				videoTracks: videoTrackInspections,
			} satisfies LocalMediaAssetInspection;
		} finally {
			input.dispose();
		}
	};

async function canExportDefaultProfile({
	audioTracks,
	canEncodeAudio,
	canEncodeVideo,
	qualityHigh,
	videoTracks,
}: CanEncodeDefaultProfileOptions): Promise<boolean> {
	const primaryVideoTrack = videoTracks[0];

	if (!primaryVideoTrack) {
		return false;
	}

	try {
		const videoExportable = await canEncodeVideo("avc", {
			bitrate: qualityHigh,
			height: primaryVideoTrack.displayHeight,
			width: primaryVideoTrack.displayWidth,
		});

		if (!videoExportable) {
			return false;
		}

		const audioExportability = await Promise.all(
			audioTracks.map((track) =>
				canEncodeAudio("aac", {
					bitrate: 128_000,
					numberOfChannels: track.numberOfChannels,
					sampleRate: track.sampleRate,
				}),
			),
		);

		return audioExportability.every(Boolean);
	} catch {
		return false;
	}
}

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

function readableCodec(codec: unknown): string | undefined {
	return typeof codec === "string" && codec.length > 0 ? codec : undefined;
}
