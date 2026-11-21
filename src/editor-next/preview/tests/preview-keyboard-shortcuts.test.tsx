/* @vitest-environment jsdom */

import { cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePreviewKeyboardShortcuts } from "../keyboard/preview-keyboard-shortcuts";

afterEach(() => {
	cleanup();
	document.body.replaceChildren();
});

function handlers() {
	return {
		getPlayheadUs: () => 1_250_000,
		onFrameStep: vi.fn(),
		onSeekBy: vi.fn(),
		onSelectionEndRequested: vi.fn(),
		onSelectionStartRequested: vi.fn(),
		onTogglePlayback: vi.fn(),
	};
}

describe("Preview shortcut ownership", () => {
	it("leaves editable fields and modal dialogs in control of keyboard input", () => {
		const commands = handlers();
		renderHook(() => usePreviewKeyboardShortcuts(commands));
		const editable = document.createElement("div");
		editable.contentEditable = "true";
		editable.setAttribute("contenteditable", "true");
		const child = editable.appendChild(document.createElement("span"));
		for (const target of [
			document.createElement("input"),
			document.createElement("textarea"),
			document.createElement("select"),
			child,
		]) {
			document.body.append(target === child ? editable : target);
			expect(fireEvent.keyDown(target, { code: "Space" })).toBe(true);
			expect(fireEvent.keyDown(target, { code: "BracketLeft" })).toBe(true);
		}
		const dialog = document.createElement("div");
		dialog.setAttribute("role", "dialog");
		document.body.append(dialog);
		fireEvent.keyDown(window, { code: "Space" });
		fireEvent.keyDown(window, { code: "BracketLeft" });
		expect(commands.onTogglePlayback).not.toHaveBeenCalled();
		expect(commands.onSelectionStartRequested).not.toHaveBeenCalled();
		dialog.remove();
		expect(fireEvent.keyDown(window, { code: "BracketLeft" })).toBe(false);
		expect(commands.onSelectionStartRequested).toHaveBeenCalledExactlyOnceWith(
			1_250_000,
		);
	});

	it("blocks shortcuts while export locks editing and respects an already handled event", () => {
		const commands = handlers();
		const { rerender } = renderHook(
			({ disabled }) =>
				usePreviewKeyboardShortcuts({
					...commands,
					shortcutsDisabled: disabled,
				}),
			{ initialProps: { disabled: true } },
		);
		fireEvent.keyDown(window, { code: "BracketRight" });
		fireEvent.keyDown(window, { code: "Space" });
		expect(commands.onSelectionEndRequested).not.toHaveBeenCalled();
		expect(commands.onTogglePlayback).not.toHaveBeenCalled();
		rerender({ disabled: false });
		const handled = new KeyboardEvent("keydown", {
			code: "Space",
			cancelable: true,
		});
		handled.preventDefault();
		window.dispatchEvent(handled);
		expect(commands.onTogglePlayback).not.toHaveBeenCalled();
		fireEvent.keyDown(window, { code: "Space" });
		expect(commands.onTogglePlayback).toHaveBeenCalledTimes(1);
	});

	it("uses current callbacks and removes global shortcuts on unmount", () => {
		const previous = handlers();
		const current = { ...handlers(), getPlayheadUs: () => 2_500_000 };
		const { rerender, unmount } = renderHook(usePreviewKeyboardShortcuts, {
			initialProps: previous,
		});
		rerender(current);
		fireEvent.keyDown(window, { code: "BracketLeft" });
		expect(previous.onSelectionStartRequested).not.toHaveBeenCalled();
		expect(current.onSelectionStartRequested).toHaveBeenCalledExactlyOnceWith(
			2_500_000,
		);
		unmount();
		fireEvent.keyDown(window, { code: "BracketLeft" });
		expect(current.onSelectionStartRequested).toHaveBeenCalledTimes(1);
	});
});
