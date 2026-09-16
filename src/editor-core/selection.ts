import type { FrameTiming, MediaTimeUs, Selection } from "./model";

export type SelectionCommandContext = {
	durationUs: MediaTimeUs;
	frameTiming: FrameTiming;
};

export function setSelectionStartFromPlayhead(
	selection: Selection,
	playheadUs: MediaTimeUs,
	context: SelectionCommandContext,
): Selection {
	const minimumDurationUs = minimumSelectionDurationUs(context);
	const startUs = clampMediaTime(
		Math.round(playheadUs),
		0,
		Math.max(0, context.durationUs - minimumDurationUs),
	);
	const endUs = clampMediaTime(
		Math.max(selection.endUs, startUs + minimumDurationUs),
		startUs + minimumDurationUs,
		context.durationUs,
	);

	return {
		endUs,
		startUs,
	};
}

export function setSelectionEndFromPlayhead(
	selection: Selection,
	playheadUs: MediaTimeUs,
	context: SelectionCommandContext,
): Selection {
	const minimumDurationUs = minimumSelectionDurationUs(context);
	const endUs = clampMediaTime(
		Math.round(playheadUs),
		minimumDurationUs,
		context.durationUs,
	);
	const startUs = clampMediaTime(
		Math.min(selection.startUs, endUs - minimumDurationUs),
		0,
		endUs - minimumDurationUs,
	);

	return {
		endUs,
		startUs,
	};
}

export function moveSelectionRangeByDelta(
	selection: Selection,
	deltaUs: MediaTimeUs,
	context: SelectionCommandContext,
): Selection {
	const minimumDurationUs = minimumSelectionDurationUs(context);
	const selectionDurationUs = clampMediaTime(
		selection.endUs - selection.startUs,
		minimumDurationUs,
		context.durationUs,
	);
	const startUs = clampMediaTime(
		Math.round(selection.startUs + deltaUs),
		0,
		context.durationUs - selectionDurationUs,
	);

	return {
		endUs: startUs + selectionDurationUs,
		startUs,
	};
}

export function replaceSelection(
	selection: Selection,
	context: SelectionCommandContext,
): Selection {
	const minimumDurationUs = minimumSelectionDurationUs(context);
	const startUs = clampMediaTime(
		Math.round(selection.startUs),
		0,
		Math.max(0, context.durationUs - minimumDurationUs),
	);
	const endUs = clampMediaTime(
		Math.round(selection.endUs),
		startUs + minimumDurationUs,
		context.durationUs,
	);

	return {
		endUs,
		startUs,
	};
}

export function resetSelection(context: SelectionCommandContext): Selection {
	return {
		endUs: context.durationUs,
		startUs: 0,
	};
}

function minimumSelectionDurationUs({
	durationUs,
	frameTiming,
}: SelectionCommandContext): MediaTimeUs {
	return Math.max(1, Math.min(frameTiming.frameDurationUs, durationUs));
}

function clampMediaTime(
	valueUs: MediaTimeUs,
	minUs: MediaTimeUs,
	maxUs: MediaTimeUs,
): MediaTimeUs {
	return Math.min(Math.max(valueUs, minUs), maxUs);
}
