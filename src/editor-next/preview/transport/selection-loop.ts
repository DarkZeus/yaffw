import type { MediaTimeUs, Selection } from "@/editor-core/model";

type SelectionLoopPhase = "disabled" | "awaiting-entry" | "entered";

export function createSelectionLoop(initialSelection: Selection) {
	let selection = initialSelection;
	let phase: SelectionLoopPhase = "disabled";
	let previousUs: MediaTimeUs = 0;

	function isInside(timeUs: MediaTimeUs) {
		return timeUs >= selection.startUs && timeUs < selection.endUs;
	}

	function reposition(timeUs: MediaTimeUs) {
		previousUs = timeUs;
		if (phase !== "disabled") {
			phase = isInside(timeUs) ? "entered" : "awaiting-entry";
		}
	}

	return {
		get enabled() {
			return phase !== "disabled";
		},
		setEnabled(enabled: boolean, timeUs: MediaTimeUs) {
			phase = enabled ? "awaiting-entry" : "disabled";
			reposition(timeUs);
		},
		setSelection(next: Selection, timeUs: MediaTimeUs) {
			if (selection.startUs === next.startUs && selection.endUs === next.endUs)
				return;
			selection = next;
			reposition(timeUs);
		},
		reposition,
		getPlaybackEndUs() {
			return phase !== "disabled" && previousUs < selection.endUs
				? selection.endUs
				: null;
		},
		advancePlayback(timeUs: MediaTimeUs): MediaTimeUs | null {
			if (phase === "disabled" || !Number.isFinite(timeUs)) return null;

			// Consecutive playback samples may straddle the entire Selection.
			if (
				isInside(timeUs) ||
				(previousUs < selection.startUs && timeUs >= selection.startUs)
			) {
				phase = "entered";
			}
			previousUs = timeUs;
			if (phase === "entered" && timeUs >= selection.endUs) {
				previousUs = selection.startUs;
				return selection.startUs;
			}
			return null;
		},
	};
}
