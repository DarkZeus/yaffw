// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TimelineToolbar } from "./timeline-controls";
import { useEditor } from "./use-editor";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});
function Toolbar() {
	const editor = useEditor();
	return (
		<TimelineToolbar
			editor={editor}
			openMedia={() => {}}
			openProperties={() => {}}
		/>
	);
}
it("renames the sequence with undo/redo and exports the same name", async () => {
	let saved: Blob | undefined;
	vi.stubGlobal(
		"URL",
		class extends URL {
			static createObjectURL(blob: Blob) {
				saved = blob;
				return "blob:test";
			}
			static revokeObjectURL() {}
		},
	);
	vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
	render(<Toolbar />);
	// jsdom does not implement the native popover API.
	for (const popover of document.querySelectorAll<HTMLElement>("[popover]")) {
		popover.hidePopover = vi.fn();
	}
	fireEvent.doubleClick(
		screen.getByRole("button", { name: "Rename sequence" }),
	);
	const input = screen.getByRole("textbox", { name: "Rename sequence" });
	fireEvent.change(input, { target: { value: "  Summer edit  " } });
	fireEvent.keyDown(input, { key: "Enter" });
	expect(
		screen.getByRole("button", { name: "Rename sequence" }).textContent,
	).toBe("Summer edit");
	fireEvent.click(screen.getByRole("button", { name: "Undo" }));
	expect(
		screen.getByRole("button", { name: "Rename sequence" }).textContent,
	).toBe("Sequence 01");
	fireEvent.click(screen.getByRole("button", { name: "Redo" }));
	fireEvent.click(screen.getByRole("button", { name: "Save sequence" }));
	if (!saved) throw new Error("No sequence download");
	const savedBlob = saved;
	const text = await new Promise<string>((resolve) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.readAsText(savedBlob);
	});
	const data = JSON.parse(text);
	expect(data.name).toBe("Summer edit");
	expect(data.sequence.name).toBe("Summer edit");
});
