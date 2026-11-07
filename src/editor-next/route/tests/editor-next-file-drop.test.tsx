/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { evaluateRuntimeSupport } from "@/editor-core/runtime-capabilities";
import { EditorNextRouteTestHarness } from "./editor-next-route-test-harness";

const supportedRuntime = evaluateRuntimeSupport({
	fileApi: true,
	mediaSource: true,
	objectUrl: true,
	videoDecoder: true,
	videoEncoder: true,
});

const idlePrompt = "Drop your video or click to browse";

afterEach(cleanup);

it("keeps file feedback across nested targets and clears it when the drag leaves the page", () => {
	render(<EditorNextRouteTestHarness initialRuntime={supportedRuntime} />);
	const zone = screen.getByTestId("editor-next-drop-zone");
	const heading = screen.getByText(idlePrompt);
	const transfer = fileTransfer(["video/mp4"]);

	drag("dragenter", zone, transfer);
	expect(heading.textContent).toBe("Release to open");

	fireEvent.blur(window);
	expect(heading.textContent).toBe(idlePrompt);
	drag("dragover", zone, transfer);
	drag("dragenter", heading, transfer, zone);
	drag("dragleave", zone, transfer, heading);
	expect(heading.textContent).toBe("Release to open");

	drag("dragleave", heading, transfer);
	expect(heading.textContent).toBe(idlePrompt);
});

it("uses the first file for feedback and imports it once after an unsupported drop", () => {
	const inspectLocalAsset = vi.fn(() => new Promise<never>(() => {}));
	render(
		<EditorNextRouteTestHarness
			initialRuntime={supportedRuntime}
			inspectLocalAsset={inspectLocalAsset}
		/>,
	);
	const zone = screen.getByTestId("editor-next-drop-zone");
	const heading = screen.getByText(idlePrompt);
	const video = new File(["video"], "clip.mp4", { type: "video/mp4" });
	const text = new File(["text"], "notes.txt", { type: "text/plain" });
	const nonFile = {
		dropEffect: "none",
		files: [],
		items: [],
		types: ["text/uri-list"],
	};
	const rejected = fileTransfer([text.type, video.type]);
	const accepted = fileTransfer([video.type, text.type]);

	expect(drag("dragenter", zone, nonFile)).toBe(true);
	expect(drag("dragover", zone, nonFile)).toBe(true);
	expect(heading.textContent).toBe(idlePrompt);

	drag("dragenter", zone, rejected);
	drag("dragover", zone, rejected);
	expect(heading.textContent).toBe("Invalid file type");
	expect(rejected.dropEffect).toBe("none");
	expect(
		drag("drop", zone, fileTransfer([text.type, video.type], [text, video])),
	).toBe(false);
	expect(heading.textContent).toBe(idlePrompt);
	expect(inspectLocalAsset).not.toHaveBeenCalled();

	drag("dragenter", zone, accepted);
	drag("dragover", zone, accepted);
	expect(heading.textContent).toBe("Release to open");
	expect(accepted.dropEffect).toBe("copy");
	drag("dragend", zone, accepted);
	expect(heading.textContent).toBe(idlePrompt);

	drag("dragenter", zone, accepted);
	expect(
		drag("drop", zone, fileTransfer([video.type, text.type], [video, text])),
	).toBe(false);
	expect(heading.textContent).toBe("Opening video…");
	expect(inspectLocalAsset).toHaveBeenCalledExactlyOnceWith(
		expect.objectContaining({ source: video }),
		expect.anything(),
	);
});

it("defers unrecognized file metadata until the filename is available on drop", () => {
	const inspectLocalAsset = vi.fn(() => new Promise<never>(() => {}));
	render(
		<EditorNextRouteTestHarness
			initialRuntime={supportedRuntime}
			inspectLocalAsset={inspectLocalAsset}
		/>,
	);
	const zone = screen.getByTestId("editor-next-drop-zone");
	const heading = screen.getByText(idlePrompt);
	const unknown = new File(["data"], "notes.unknown");
	const genericVideo = new File(["video"], "CLIP.MKV", {
		type: "application/octet-stream",
	});

	drag("dragenter", zone, fileTransfer([unknown.type]));
	expect(heading.textContent).toBe("Release to check file type");
	drag("drop", zone, fileTransfer([unknown.type], [unknown]));
	expect(heading.textContent).toBe(idlePrompt);
	expect(inspectLocalAsset).not.toHaveBeenCalled();

	const transfer = fileTransfer([genericVideo.type]);
	drag("dragenter", zone, transfer);
	drag("dragover", zone, transfer);
	expect(heading.textContent).toBe("Release to check file type");
	expect(transfer.dropEffect).toBe("copy");
	drag("drop", zone, fileTransfer([genericVideo.type], [genericVideo]));
	expect(heading.textContent).toBe("Opening video…");
});

function fileTransfer(mimeTypes: string[], files: File[] = []) {
	return {
		dropEffect: "none",
		files,
		items: mimeTypes.map((type) => ({ kind: "file", type })),
		types: ["Files"],
	};
}

function drag(
	type: string,
	target: Element,
	dataTransfer: ReturnType<typeof fileTransfer>,
	relatedTarget: Element | null = null,
) {
	const event = new MouseEvent(type, {
		bubbles: true,
		cancelable: true,
		relatedTarget,
	});
	Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
	return fireEvent(target, event);
}
