import type { MediaTimeUs } from "@/editor-core/model";

export type UsePreviewKeyboardShortcutsOptions = {
	getPlayheadUs: () => MediaTimeUs;
	onFrameStep: (direction: -1 | 1) => void;
	onSeekBy: (deltaUs: MediaTimeUs) => void;
	onSelectionEndRequested: (playheadUs: MediaTimeUs) => void;
	onSelectionStartRequested: (playheadUs: MediaTimeUs) => void;
	onTogglePlayback: () => void;
	shortcutsDisabled?: boolean;
};

export type PreviewShortcutSuppressionOptions = {
	event: KeyboardEvent;
	shortcutsDisabled?: boolean;
};

export type PreviewShortcutHandlers = {
	getPlayheadUs: () => MediaTimeUs;
	onFrameStep: (direction: -1 | 1) => void;
	onSeekBy: (deltaUs: MediaTimeUs) => void;
	onSelectionEndRequested: (playheadUs: MediaTimeUs) => void;
	onSelectionStartRequested: (playheadUs: MediaTimeUs) => void;
	onTogglePlayback: () => void;
};
