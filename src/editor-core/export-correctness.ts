import type { FrameTiming, MediaTimeUs, Selection } from "./model";

export type GeneratedMediaTrackInspection = {
	channels?: number;
	codec?: string;
	durationUs?: MediaTimeUs;
	height?: number;
	id: string;
	kind: "audio" | "video";
	label?: string;
	language?: string;
	sampleRate?: number;
	width?: number;
};

export type GeneratedMediaInspection = {
	container: "mp4" | "unknown" | "webm";
	durationUs?: MediaTimeUs;
	mimeType?: string;
	sizeBytes: number;
	tracks: {
		audio: GeneratedMediaTrackInspection[];
		video: GeneratedMediaTrackInspection[];
	};
};

export type ExportBoundaryEvidence =
	| {
			kind: "none";
	  }
	| {
			generatedDurationUs: MediaTimeUs;
			kind: "duration-only";
	  }
	| {
			endDeltaUs: MediaTimeUs;
			generatedDurationUs?: MediaTimeUs;
			kind: "start-and-end";
			startDeltaUs: MediaTimeUs;
	  };

export type ExportRangeAccuracyReport =
	| {
			durationDeltaUs?: MediaTimeUs;
			generatedDurationUs?: MediaTimeUs;
			kind: "full-asset";
			label: "Full asset";
			precisionProven: false;
			reason: string;
			requestedDurationUs: MediaTimeUs;
			toleranceUs: MediaTimeUs;
	  }
	| {
			durationDeltaUs?: MediaTimeUs;
			endDeltaUs: MediaTimeUs;
			generatedDurationUs?: MediaTimeUs;
			kind: "proven-precise";
			label: "Proven precise";
			precisionProven: true;
			reason: string;
			requestedDurationUs: MediaTimeUs;
			startDeltaUs: MediaTimeUs;
			toleranceUs: MediaTimeUs;
	  }
	| {
			durationDeltaUs?: MediaTimeUs;
			endDeltaUs?: MediaTimeUs;
			generatedDurationUs?: MediaTimeUs;
			kind: "best-effort";
			label: "Best effort";
			precisionProven: false;
			reason: string;
			requestedDurationUs: MediaTimeUs;
			startDeltaUs?: MediaTimeUs;
			toleranceUs: MediaTimeUs;
	  };

type ClassifyExportRangeAccuracyOptions = {
	boundaryEvidence?: ExportBoundaryEvidence;
	frameTiming: FrameTiming;
	generatedMedia?: Pick<GeneratedMediaInspection, "durationUs">;
	selection: Selection;
	sourceDurationUs: MediaTimeUs;
};

export function classifyExportRangeAccuracy({
	boundaryEvidence,
	frameTiming,
	generatedMedia,
	selection,
	sourceDurationUs,
}: ClassifyExportRangeAccuracyOptions): ExportRangeAccuracyReport {
	const requestedDurationUs = selection.endUs - selection.startUs;
	const generatedDurationUs =
		generatedMedia?.durationUs ?? durationFromBoundaryEvidence(boundaryEvidence);
	const durationDeltaUs =
		generatedDurationUs === undefined
			? undefined
			: generatedDurationUs - requestedDurationUs;
	const toleranceUs = rangeAccuracyToleranceUs(frameTiming);

	if (selection.startUs === 0 && selection.endUs === sourceDurationUs) {
		return {
			durationDeltaUs,
			generatedDurationUs,
			kind: "full-asset",
			label: "Full asset",
			precisionProven: false,
			reason:
				"The selection covers the full asset, so selected-range boundary precision is not part of this export.",
			requestedDurationUs,
			toleranceUs,
		};
	}

	if (boundaryEvidence?.kind === "start-and-end") {
		const precise =
			Math.abs(boundaryEvidence.startDeltaUs) <= toleranceUs &&
			Math.abs(boundaryEvidence.endDeltaUs) <= toleranceUs;

		if (precise) {
			return {
				durationDeltaUs,
				endDeltaUs: boundaryEvidence.endDeltaUs,
				generatedDurationUs,
				kind: "proven-precise",
				label: "Proven precise",
				precisionProven: true,
				reason:
					"Generated-media evidence shows both selection boundaries within the current frame tolerance.",
				requestedDurationUs,
				startDeltaUs: boundaryEvidence.startDeltaUs,
				toleranceUs,
			};
		}

		return {
			durationDeltaUs,
			endDeltaUs: boundaryEvidence.endDeltaUs,
			generatedDurationUs,
			kind: "best-effort",
			label: "Best effort",
			precisionProven: false,
			reason:
				"Generated-media evidence shows at least one selection boundary outside the current frame tolerance.",
			requestedDurationUs,
			startDeltaUs: boundaryEvidence.startDeltaUs,
			toleranceUs,
		};
	}

	if (generatedDurationUs !== undefined) {
		return {
			durationDeltaUs,
			generatedDurationUs,
			kind: "best-effort",
			label: "Best effort",
			precisionProven: false,
			reason: measuredDurationOnlyReason(frameTiming),
			requestedDurationUs,
			toleranceUs,
		};
	}

	return {
		kind: "best-effort",
		label: "Best effort",
		precisionProven: false,
		reason: noGeneratedEvidenceReason(frameTiming),
		requestedDurationUs,
		toleranceUs,
	};
}

export function rangeAccuracyToleranceUs(
	frameTiming: FrameTiming,
): MediaTimeUs {
	return Math.max(1, frameTiming.frameDurationUs);
}

function durationFromBoundaryEvidence(
	boundaryEvidence: ExportBoundaryEvidence | undefined,
): MediaTimeUs | undefined {
	if (
		boundaryEvidence?.kind === "duration-only" ||
		boundaryEvidence?.kind === "start-and-end"
	) {
		return boundaryEvidence.generatedDurationUs;
	}

	return undefined;
}

function measuredDurationOnlyReason(frameTiming: FrameTiming): string {
	if (frameTiming.source === "estimated") {
		return "Exact frame timing is unavailable, and generated duration is measured without start and end boundary evidence, so selected-range precision has not been proven.";
	}

	return "Generated duration is measured, but start and end boundary evidence is unavailable, so selected-range precision has not been proven.";
}

function noGeneratedEvidenceReason(frameTiming: FrameTiming): string {
	if (frameTiming.source === "estimated") {
		return "Exact frame timing is unavailable, and generated-media evidence is unavailable, so selected-range precision has not been proven.";
	}

	return "Generated-media evidence is unavailable, so selected-range precision has not been proven.";
}
