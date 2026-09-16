import { planDefaultExportCapability } from "./export-capability";
import type {
	AudioMediaTrack,
	ExportCapability,
	FrameTiming,
	MediaAssetDraft,
	ReadyMediaAsset,
	Selection,
	UnsupportedMediaFailure,
	VideoMediaTrack,
} from "./model";
import type { RuntimeSupport } from "./runtime-capabilities";

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
	durationUs: number;
	frameTiming?: FrameTiming;
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
	request: LocalMediaAssetInspectionRequest,
) => LocalMediaAssetInspection | Promise<LocalMediaAssetInspection>;

export type LocalMediaAssetInspectionRequest = {
	signal?: AbortSignal;
};

type LocalMediaAssetAnalysisOptions = {
	createAssetId?: () => string;
	inspect: LocalMediaAssetInspector;
	runtime: RuntimeSupport;
	signal?: AbortSignal;
};

export async function analyzeLocalMediaAssetDraft(
	draft: MediaAssetDraft,
	options: LocalMediaAssetAnalysisOptions,
): Promise<LocalMediaAssetAnalysisResult> {
	let inspection: LocalMediaAssetInspection;

	try {
		inspection = await options.inspect(draft, { signal: options.signal });
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

	const frameTiming = inspection.frameTiming ?? estimatedFrameTiming();
	const tracks = {
		audio: inspection.audioTracks.map(toAudioTrack),
		video: inspection.videoTracks.map(toVideoTrack),
	};
	const selection = {
		endUs: inspection.durationUs,
		startUs: 0,
	};
	const exportCapabilityReview = planDefaultExportCapability({
		asset: {
			durationUs: inspection.durationUs,
			frameTiming,
			tracks,
		},
		runtime: options.runtime,
		selection,
	});
	const exportCapability = exportCapabilityFromReview(exportCapabilityReview);

	const asset: ReadyMediaAsset = {
		durationUs: inspection.durationUs,
		exportCapability,
		frameTiming,
		id: (options.createAssetId ?? createMediaAssetId)(),
		label: draft.label,
		provenance: draft.provenance,
		tracks,
	};

	return {
		asset,
		selection,
		status: "ready",
	};
}

function createMediaAssetId(): string {
	return createOwnedId("asset");
}

function createOwnedId(prefix: string): string {
	if (
		"crypto" in globalThis &&
		typeof globalThis.crypto.randomUUID === "function"
	) {
		return `${prefix}-${globalThis.crypto.randomUUID()}`;
	}

	return `${prefix}-${Date.now().toString(36)}-${Math.random()
		.toString(36)
		.slice(2)}`;
}

function exportCapabilityFromReview(
	review: ReturnType<typeof planDefaultExportCapability>,
): ExportCapability {
	if (review.supported) {
		return {
			profile: review.profile,
			supported: true,
		};
	}

	return {
		profile: review.profile,
		reason: review.reason,
		supported: false,
		technicalDetails: review.technicalDetails,
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
