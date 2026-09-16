// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTrack } from "./model";
import { TrackResizeHandle } from "./track-resize-handle";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});
function ResizableTrack() {
	const [height, setHeight] = useState(48);
	return (
		<TrackResizeHandle
			track={makeTrack("v1", "Picture", "video")}
			height={height}
			onHeightChange={setHeight}
		/>
	);
}
describe("bottom track resizing", () => {
	it("supports keyboard steps, bounds, and resetting to the track default", () => {
		render(<ResizableTrack />);
		const handle = screen.getByRole("separator");
		fireEvent.keyDown(handle, { key: "ArrowDown" });
		expect(handle.getAttribute("aria-valuenow")).toBe("52");
		fireEvent.keyDown(handle, { key: "ArrowUp", shiftKey: true });
		expect(handle.getAttribute("aria-valuenow")).toBe("32");
		fireEvent.keyDown(handle, { key: "Home" });
		fireEvent.keyDown(handle, { key: "ArrowUp" });
		expect(handle.getAttribute("aria-valuenow")).toBe("28");
		fireEvent.keyDown(handle, { key: "End" });
		fireEvent.keyDown(handle, { key: "ArrowDown" });
		expect(handle.getAttribute("aria-valuenow")).toBe("180");
		fireEvent.doubleClick(handle);
		expect(handle.getAttribute("aria-valuenow")).toBe("48");
	});
	it("grows downward, restores a cancelled drag, and retains a completed drag", () => {
		vi.stubGlobal("PointerEvent", MouseEvent);
		render(<ResizableTrack />);
		const handle = screen.getByRole("separator");
		handle.setPointerCapture = vi.fn();
		fireEvent.pointerDown(handle, { button: 0, clientY: 100 });
		fireEvent.pointerMove(handle, { clientY: 132 });
		expect(handle.getAttribute("aria-valuenow")).toBe("80");
		expect(document.activeElement).not.toBe(handle);
		fireEvent.keyDown(document.body, { key: "Escape" });
		expect(handle.getAttribute("aria-valuenow")).toBe("48");
		fireEvent.pointerDown(handle, { button: 0, clientY: 100 });
		fireEvent.pointerMove(handle, { clientY: 132 });
		fireEvent.pointerCancel(handle);
		expect(handle.getAttribute("aria-valuenow")).toBe("48");
		fireEvent.pointerDown(handle, { button: 0, clientY: 100 });
		fireEvent.pointerMove(handle, { clientY: 132 });
		fireEvent.pointerUp(handle);
		fireEvent.lostPointerCapture(handle);
		expect(handle.getAttribute("aria-valuenow")).toBe("80");
	});
});
