import { useCallback, useEffect } from "react";

import type {
	PreviewShortcutHandlers,
	PreviewShortcutSuppressionOptions,
	UsePreviewKeyboardShortcutsOptions,
} from "./preview-keyboard-shortcuts.types";

const SHORT_SEEK_DELTA_US = 1_000_000;
const LARGE_SEEK_DELTA_US = 10_000_000;

export function usePreviewKeyboardShortcuts({
	getPlayheadUs,
	onFrameStep,
	onSeekBy,
	onSelectionEndRequested,
	onSelectionStartRequested,
	onTogglePlayback,
	shortcutsDisabled = false,
}: UsePreviewKeyboardShortcutsOptions) {
	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			if (
				isPreviewShortcutSuppressed({
					event,
					shortcutsDisabled,
				})
			) {
				return;
			}

			const handled = dispatchPreviewKeyboardShortcut(event, {
				getPlayheadUs,
				onFrameStep,
				onSeekBy,
				onSelectionEndRequested,
				onSelectionStartRequested,
				onTogglePlayback,
			});

			if (handled) {
				event.preventDefault();
			}
		},
		[
			getPlayheadUs,
			onFrameStep,
			onSeekBy,
			onSelectionEndRequested,
			onSelectionStartRequested,
			onTogglePlayback,
			shortcutsDisabled,
		],
	);

	useEffect(() => {
		window.addEventListener("keydown", handleKeyDown);

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [handleKeyDown]);
}

export function dispatchPreviewKeyboardShortcut(
	event: KeyboardEvent,
	handlers: PreviewShortcutHandlers,
): boolean {
	if (event.shiftKey && event.code === "ArrowLeft") {
		handlers.onFrameStep(-1);
		return true;
	}

	if (event.shiftKey && event.code === "ArrowRight") {
		handlers.onFrameStep(1);
		return true;
	}

	switch (event.code) {
		case "ArrowLeft":
			handlers.onSeekBy(-SHORT_SEEK_DELTA_US);
			return true;
		case "ArrowRight":
			handlers.onSeekBy(SHORT_SEEK_DELTA_US);
			return true;
		case "BracketLeft":
			handlers.onSelectionStartRequested(handlers.getPlayheadUs());
			return true;
		case "BracketRight":
			handlers.onSelectionEndRequested(handlers.getPlayheadUs());
			return true;
		case "KeyJ":
			handlers.onSeekBy(-LARGE_SEEK_DELTA_US);
			return true;
		case "KeyK":
		case "Space":
			handlers.onTogglePlayback();
			return true;
		case "KeyL":
			handlers.onSeekBy(LARGE_SEEK_DELTA_US);
			return true;
		default:
			return false;
	}
}

export function isPreviewShortcutSuppressed({
	event,
	shortcutsDisabled = false,
}: PreviewShortcutSuppressionOptions): boolean {
	if (shortcutsDisabled || event.defaultPrevented) {
		return true;
	}

	const target =
		event.target instanceof Element ? event.target : document.activeElement;

	if (target?.isConnected && isEditableTarget(target)) {
		return true;
	}

	return document.querySelector('[role="dialog"]') !== null;
}

function isEditableTarget(target: Element): boolean {
	if (target.closest('[contenteditable="true"]')) {
		return true;
	}

	const tagName = target.tagName.toLowerCase();

	return tagName === "input" || tagName === "textarea" || tagName === "select";
}
