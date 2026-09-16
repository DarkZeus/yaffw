// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SequenceTimeline } from "./sequence-timeline";
import { useEditor } from "./use-editor";

afterEach(cleanup);
function Timeline() {
	const editor = useEditor();
	return (
		<>
			<button type="button" onClick={editor.undo}>
				Undo
			</button>
			<button type="button" onClick={editor.redo}>
				Redo
			</button>
			<SequenceTimeline editor={editor} toolbar={null} />
		</>
	);
}
it("renames only the chosen track and supports undo/redo", () => {
	render(<Timeline />);
	fireEvent.doubleClick(
		screen.getByRole("button", { name: "Rename Main picture track" }),
	);
	const input = screen.getByRole("textbox", {
		name: "Rename Main picture track",
	});
	expect(document.activeElement).toBe(input);
	fireEvent.change(input, { target: { value: "  Camera A  " } });
	fireEvent.keyDown(input, { key: "Enter" });
	expect(
		screen.getByRole("button", { name: "Rename Camera A track" }),
	).toBeTruthy();
	expect(
		screen.getByRole("separator", {
			name: "Resize Camera A track from bottom",
		}),
	).toBeTruthy();
	expect(
		screen.getByRole("button", { name: "Rename Inserts track" }),
	).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "Undo" }));
	expect(
		screen.getByRole("button", { name: "Rename Main picture track" }),
	).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "Redo" }));
	expect(
		screen.getByRole("button", { name: "Rename Camera A track" }),
	).toBeTruthy();
});
it("supports keyboard editing, cancels with Escape, and ignores blank names", () => {
	render(<Timeline />);
	const button = () =>
		screen.getByRole("button", { name: "Rename Score track" });
	fireEvent.keyDown(button(), { key: "F2" });
	let input = screen.getByRole("textbox");
	fireEvent.change(input, { target: { value: "Discard this" } });
	fireEvent.keyDown(input, { key: "Escape" });
	expect(button()).toBeTruthy();
	fireEvent.keyDown(button(), { key: "Enter" });
	input = screen.getByRole("textbox");
	fireEvent.change(input, { target: { value: "   " } });
	fireEvent.blur(input);
	expect(button()).toBeTruthy();
	fireEvent.doubleClick(button());
	input = screen.getByRole("textbox");
	fireEvent.change(input, { target: { value: "Music" } });
	fireEvent.blur(input);
	expect(
		screen.getByRole("button", { name: "Rename Music track" }),
	).toBeTruthy();
});
