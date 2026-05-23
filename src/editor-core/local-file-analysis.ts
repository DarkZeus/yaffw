import { isPlausibleVideoDraft } from "./local-file-import";
import {
	type AudioMediaTrack,
	DEFAULT_OUTPUT_PROFILE,
	type FrameTiming,
	type MediaAssetDraft,
	type ReadyMediaAsset,
	type Selection,
	type UnsupportedMediaFailure,
	type VideoMediaTrack,
} from "./model";

export type VideoTrackInspection = {
	codec?: string;
	height?: number;
	id: string;
	label?: string;
	width?: number;
};

export type AudioTrackInspection = {
	channels?: number;
	codec?: string;
	id: string;
	label?: string;
	language?: string;
	sampleRate?: number;
};

export type LocalMediaAssetInspection = {
	audioTracks: AudioTrackInspection[];
	defaultProfileExportable: boolean;
	durationUs: number;
	frameTiming?: FrameTiming;
	previewable: boolean;
	videoTracks: VideoTrackInspection[];
};

export type LocalMediaAssetAnalysisResult =
	| {
			asset: ReadyMediaAsset;
			selection: Selection;
			status: "ready";
	  }
	| {
			failure: UnsupportedMediaFailure;
			status: "unsupported";
	  };

export type LocalMediaAssetInspector = (
	draft: MediaAssetDraft,
) => LocalMediaAssetInspection | Promise<LocalMediaAssetInspection>;

type LocalMediaAssetAnalysisOptions = {
	createAssetId: () => string;
	inspect: LocalMediaAssetInspector;
};

export async function analyzeLocalMediaAssetDraft(
	draft: MediaAssetDraft,
	options: LocalMediaAssetAnalysisOptions,
): Promise<LocalMediaAssetAnalysisResult> {
	if (!isPlausibleVideoDraft(draft)) {
		return unsupported(
			"This file does not look like a supported video file.",
			`MIME type ${draft.provenance.mimeType ?? "(missing)"} and file name ${
				draft.label
			} were not recognized as a local video container.`,
		);
	}

	let inspection: LocalMediaAssetInspection;

	try {
		inspection = await options.inspect(draft);
	} catch (error) {
		return unsupported(
			"The media asset could not be read.",
			errorToTechnicalDetails(error),
		);
	}

	const basicFailure = validateInspection(inspection);

	if (basicFailure) {
		return unsupported(basicFailure.message, basicFailure.technicalDetails);
	}

	const asset: ReadyMediaAsset = {
		durationUs: inspection.durationUs,
		exportCapability: {
			profile: DEFAULT_OUTPUT_PROFILE,
			supported: true,
		},
		frameTiming: inspection.frameTiming ?? estimatedFrameTiming(),
		id: options.createAssetId(),
		label: draft.label,
		provenance: draft.provenance,
		tracks: {
			audio: inspection.audioTracks.map(toAudioTrack),
			video: inspection.videoTracks.map(toVideoTrack),
		},
	};

	return {
		asset,
		selection: {
			endUs: asset.durationUs,
			startUs: 0,
		},
		status: "ready",
	};
}

function validateInspection(
	inspection: LocalMediaAssetInspection,
): UnsupportedMediaFailure | null {
	if (
		!Number.isSafeInteger(inspection.durationUs) ||
		inspection.durationUs <= 0
	) {
		return {
			message: "The media asset could not be analyzed.",
			technicalDetails: `Expected a positive integer duration in microseconds, got ${inspection.durationUs}.`,
		};
	}

	if (
		inspection.videoTracks.length === 0 &&
		inspection.audioTracks.length > 0
	) {
		return {
			message: "Audio-only files are not supported in this first editor slice.",
			technicalDetails:
				"Analysis found audio tracks but no video track. The first slice is video-focused.",
		};
	}

	if (inspection.videoTracks.length === 0) {
		return {
			message: "This file does not contain a supported video track.",
			technicalDetails: "Analysis did not find any video tracks.",
		};
	}

	if (!inspection.previewable) {
		return {
			message: "This file cannot be previewed in this runtime.",
			technicalDetails:
				"The analyzed video track is not decodable by the current browser media APIs.",
		};
	}

	if (!inspection.defaultProfileExportable) {
		return {
			message:
				"This file cannot be exported with the default MP4/H.264/AAC profile in this runtime.",
			technicalDetails:
				"The current runtime cannot encode the default output profile for this media asset.",
		};
	}

	return null;
}

function toVideoTrack(track: VideoTrackInspection): VideoMediaTrack {
	return {
		codec: track.codec,
		height: track.height,
		id: track.id,
		kind: "video",
		label: track.label,
		width: track.width,
	};
}

function toAudioTrack(track: AudioTrackInspection): AudioMediaTrack {
	return {
		channels: track.channels,
		codec: track.codec,
		id: track.id,
		kind: "audio",
		label: track.label,
		language: track.language,
		sampleRate: track.sampleRate,
	};
}

function estimatedFrameTiming(): FrameTiming {
	return {
		fps: 30,
		frameDurationUs: 33_333,
		reason: "Exact frame timing was unavailable during local asset analysis.",
		source: "estimated",
	};
}

function unsupported(
	message: string,
	technicalDetails?: string,
): LocalMediaAssetAnalysisResult {
	return {
		failure: {
			message,
			technicalDetails,
		},
		status: "unsupported",
	};
}

function errorToTechnicalDetails(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}
