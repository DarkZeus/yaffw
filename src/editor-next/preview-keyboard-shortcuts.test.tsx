/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MediaTimeUs } from "@/editor-core/model";

import {
	isPreviewShortcutSuppressed,
	usePreviewKeyboardShortcuts,
} from "./preview-keyboard-shortcuts";

afterEach(() => {
	cleanup();
	document.body.replaceChildren();
});

describe("preview keyboard shortcuts", () => {
	it("dispatches page-level preview commands", () => {
		const handlers = createShortcutHandlers();
		render(<KeyboardShortcutHarness {...handlers} />);

		fireEvent.keyDown(window, { code: "Space", key: " " });
		fireEvent.keyDown(window, { code: "KeyK", key: "k" });
		fireEvent.keyDown(window, { code: "ArrowLeft", key: "ArrowLeft" });
		fireEvent.keyDown(window, { code: "ArrowRight", key: "ArrowRight" });
		fireEvent.keyDown(window, { code: "KeyJ", key: "j" });
		fireEvent.keyDown(window, { code: "KeyL", key: "l" });
		fireEvent.keyDown(window, {
			code: "ArrowLeft",
			key: "ArrowLeft",
			shiftKey: true,
		});
		fireEvent.keyDown(window, {
			code: "ArrowRight",
			key: "ArrowRight",
			shiftKey: true,
		});

		expect(handlers.onTogglePlayback).toHaveBeenCalledTimes(2);
		expect(handlers.onSeekBy).toHaveBeenNthCalledWith(1, -1_000_000);
		expect(handlers.onSeekBy).toHaveBeenNthCalledWith(2, 1_000_000);
		expect(handlers.onSeekBy).toHaveBeenNthCalledWith(3, -10_000_000);
		expect(handlers.onSeekBy).toHaveBeenNthCalledWith(4, 10_000_000);
		expect(handlers.onFrameStep).toHaveBeenNthCalledWith(1, -1);
		expect(handlers.onFrameStep).toHaveBeenNthCalledWith(2, 1);
	});

	it("reads live Playhead media time when bracket shortcuts dispatch", () => {
		const handlers = createShortcutHandlers();
		render(<KeyboardShortcutHarness {...handlers} />);

		fireEvent.click(screen.getByRole("button", { name: "Move playhead" }));
		fireEvent.keyDown(window, { code: "BracketLeft", key: "[" });
		fireEvent.click(screen.getByRole("button", { name: "Move playhead" }));
		fireEvent.keyDown(window, { code: "BracketRight", key: "]" });

		expect(handlers.onSelectionStartRequested).toHaveBeenCalledWith(2_000_000);
		expect(handlers.onSelectionEndRequested).toHaveBeenCalledWith(3_000_000);
	});

	it("suppresses shortcuts while typing, in dialogs, after default prevention, or when disabled", () => {
		const input = document.createElement("input");
		const textarea = document.createElement("textarea");
		const select = document.createElement("select");
		const editable = document.createElement("div");
		const dialog = document.createElement("div");
		editable.setAttribute("contenteditable", "true");
		dialog.setAttribute("role", "dialog");
		document.body.append(input, textarea, select, editable);

		for (const target of [input, textarea, select, editable]) {
			target.focus();

			expect(
				isPreviewShortcutSuppressed({
					event: new KeyboardEvent("keydown", { code: "Space" }),
					shortcutsDisabled: false,
				}),
			).toBe(true);
		}

		input.blur();
		document.body.append(dialog);

		expect(
			isPreviewShortcutSuppressed({
				event: new KeyboardEvent("keydown", { code: "Space" }),
				shortcutsDisabled: false,
			}),
		).toBe(true);

		dialog.remove();

		expect(
			isPreviewShortcutSuppressed({
				event: new KeyboardEvent("keydown", { code: "Space" }),
				shortcutsDisabled: true,
			}),
		).toBe(true);

		const preventedEvent = new KeyboardEvent("keydown", { code: "Space" });
		preventedEvent.preventDefault();

		expect(
			isPreviewShortcutSuppressed({
				event: preventedEvent,
				shortcutsDisabled: false,
			}),
		).toBe(true);

		input.remove();
		textarea.remove();
		select.remove();
		editable.remove();
	});

	it("removes the page-level listener when the shortcut owner unmounts", () => {
		const handlers = createShortcutHandlers();
		const view = render(<KeyboardShortcutHarness {...handlers} />);

		view.unmount();
		fireEvent.keyDown(window, { code: "Space", key: " " });

		expect(handlers.onTogglePlayback).not.toHaveBeenCalled();
	});

	it("does not dispatch commands while shortcut dispatch is disabled", () => {
		const handlers = createShortcutHandlers();
		render(<KeyboardShortcutHarness {...handlers} shortcutsDisabled />);

		fireEvent.keyDown(window, { code: "Space", key: " " });

		expect(handlers.onTogglePlayback).not.toHaveBeenCalled();
	});
});

function KeyboardShortcutHarness({
	getPlayheadUs,
	onFrameStep,
	onSeekBy,
	onSelectionEndRequested,
	onSelectionStartRequested,
	onTogglePlayback,
	shortcutsDisabled = false,
}: ReturnType<typeof createShortcutHandlers> & {
	shortcutsDisabled?: boolean;
}) {
	const playheadRef = useRef<MediaTimeUs>(1_000_000);

	usePreviewKeyboardShortcuts({
		getPlayheadUs: getPlayheadUs ?? (() => playheadRef.current),
		onFrameStep,
		onSeekBy,
		onSelectionEndRequested,
		onSelectionStartRequested,
		onTogglePlayback,
		shortcutsDisabled,
	});

	return (
		<button
			aria-label="Move playhead"
			onClick={() => {
				playheadRef.current += 1_000_000;
			}}
			type="button"
		/>
	);
}

function createShortcutHandlers() {
	return {
		getPlayheadUs: undefined as (() => MediaTimeUs) | undefined,
		onFrameStep: vi.fn(),
		onSeekBy: vi.fn(),
		onSelectionEndRequested: vi.fn(),
		onSelectionStartRequested: vi.fn(),
		onTogglePlayback: vi.fn(),
	};
}
