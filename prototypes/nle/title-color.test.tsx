// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { formatHex } from "culori";
import { afterEach, expect, it } from "vitest";
import { Inspector } from "./inspector";
import { useEditor } from "./use-editor";

afterEach(cleanup);

function TitleInspector() {
	const editor = useEditor();
	return (
		<>
			<button type="button" onClick={editor.addTitle}>
				Add title
			</button>
			<button type="button" onClick={editor.undo}>
				Undo
			</button>
			<output data-testid="stored-color">{editor.selected?.color}</output>
			<Inspector editor={editor} />
		</>
	);
}

it("adapts the native picker while storing OKLCH and preserving undo", () => {
	render(<TitleInspector />);
	fireEvent.click(screen.getByRole("button", { name: "Add title" }));
	const original = screen.getByTestId("stored-color").textContent;
	const input = screen.getByLabelText<HTMLInputElement>("Title color");
	expect(original).toMatch(/^oklch\(/);
	expect(input.value).toBe(formatHex(original ?? undefined));
	// Native color inputs exchange sRGB hex; authored/stored colors remain OKLCH.
	const chosen = formatHex("oklch(0.7 0.1 150)");
	fireEvent.change(input, { target: { value: chosen } });
	const stored = screen.getByTestId("stored-color").textContent;
	expect(stored).toMatch(/^oklch\(/);
	expect(formatHex(stored ?? undefined)).toBe(chosen);
	expect(input.value).toBe(chosen);
	fireEvent.click(screen.getByRole("button", { name: "Undo" }));
	expect(screen.getByTestId("stored-color").textContent).toBe(original);
});
