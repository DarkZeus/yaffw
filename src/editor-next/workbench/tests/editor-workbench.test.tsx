/* @vitest-environment jsdom */

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import {
	DEFAULT_OUTPUT_PROFILE,
	type ReadyMediaAsset,
	createDefaultOutputSettings,
} from "@/editor-core/model";
import { evaluateRuntimeSupport } from "@/editor-core/runtime-capabilities";
import type { EditorSessionState } from "@/editor-core/session";
import {
	EditorSessionShell,
	type EditorSessionShellProps,
	EditorWorkbenchFrame,
	UnsupportedRuntimeState,
} from "../frame/editor-workbench";
import { EditorWorkbenchLayout } from "../frame/editor-workbench-layout";
import {
	WorkbenchInspectorTabs,
	useWorkbenchInspector,
} from "../frame/workbench-inspector";

afterEach(() => {
	cleanup();
	window.localStorage.clear();
	vi.restoreAllMocks();
});

describe("Editor workbench", () => {
	it("omits the header while editing and restores the logo for import", () => {
		const view = render(
			<EditorWorkbenchFrame activeAsset={readyAsset} runtime={supportedRuntime}>
				<div>Workbench child</div>
			</EditorWorkbenchFrame>,
		);

		expect(screen.queryByLabelText("Editor workbench top bar")).toBeNull();
		expect(screen.queryByText("YAFFW")).toBeNull();
		expect(screen.queryByText("recording.mp4")).toBeNull();
		expect(screen.queryByLabelText("Top bar media asset summary")).toBeNull();
		expect(screen.queryByText("Your media stays on this device")).toBeNull();

		const workbenchChild = screen.getByText("Workbench child");
		expect(workbenchChild).toBeTruthy();
		expect(workbenchChild.parentElement?.className).not.toContain(
			"grid-cols-[4rem_minmax(0,1fr)]",
		);
		expect(screen.queryByLabelText("Editor workbench rail")).toBeNull();
		expect(
			screen.queryByRole("navigation", { name: "Editor workbench rail" }),
		).toBeNull();
		view.rerender(
			<EditorWorkbenchFrame activeAsset={null} runtime={supportedRuntime}>
				<div>Import surface</div>
			</EditorWorkbenchFrame>,
		);
		expect(screen.getByLabelText("Editor workbench top bar")).toBeTruthy();
		expect(screen.getByRole("heading", { name: "YAFFW" })).toBeTruthy();
	});

	it("renders unsupported runtime state before exposing local import", () => {
		const unsupportedRuntime = evaluateRuntimeSupport({
			fileApi: true,
			mediaSource: true,
			objectUrl: true,
			videoDecoder: false,
			videoEncoder: false,
		});
		if (unsupportedRuntime.supported) {
			throw new Error("Expected unsupported runtime");
		}

		render(
			<EditorWorkbenchFrame activeAsset={null} runtime={unsupportedRuntime}>
				<UnsupportedRuntimeState
					session={{
						importEnabled: false,
						message: unsupportedRuntime.reason,
						runtime: unsupportedRuntime,
						status: "unsupported-runtime",
					}}
				/>
			</EditorWorkbenchFrame>,
		);

		const alert = screen.getByRole("alert");
		expect(alert.textContent).toContain("WebCodecs");
		expect(screen.getByText("Runtime blocked")).toBeTruthy();
		expect(screen.getByLabelText("Workbench center region")).toBeTruthy();
		expect(screen.queryByLabelText("Local media file")).toBeNull();
		expect(screen.queryByLabelText("Workbench media asset region")).toBeNull();
		expect(screen.queryByLabelText("Workbench inspector region")).toBeNull();
	});

	it("renders non-ready import shell and forwards file events", () => {
		const handleLocalFileDropped = vi.fn();
		const handleLocalFileSelected = vi.fn();

		render(
			<EditorSessionShell
				localFileInputKey={0}
				onLocalFileDropped={handleLocalFileDropped}
				onLocalFileSelected={handleLocalFileSelected}
				previewPlayer={null}
				session={{
					importEnabled: true,
					runtime: supportedRuntime,
					status: "empty",
				}}
			/>,
		);

		expect(screen.getByLabelText("Editor workbench session")).toBeTruthy();
		expect(screen.getByLabelText("Workbench center region")).toBeTruthy();
		expect(screen.getByText("Open a video")).toBeTruthy();
		expect(screen.getByLabelText("Local media file")).toBeTruthy();
		expect(screen.getByTestId("editor-next-drop-zone")).toBeTruthy();
		expect(screen.getByText("Drop your video or click to browse")).toBeTruthy();
		expect(screen.queryByText("or download from URL")).toBeNull();
		expect(screen.queryByPlaceholderText(/youtube/i)).toBeNull();
		expect(screen.queryByLabelText("Workbench media asset region")).toBeNull();
		expect(screen.queryByLabelText("Workbench inspector region")).toBeNull();

		fireEvent.change(screen.getByLabelText("Local media file"), {
			target: {
				files: [new File(["video"], "picked.mp4", { type: "video/mp4" })],
			},
		});
		fireEvent.drop(screen.getByTestId("editor-next-drop-zone"), {
			dataTransfer: {
				files: [new File(["video"], "dropped.mp4", { type: "video/mp4" })],
			},
		});

		expect(handleLocalFileSelected).toHaveBeenCalledTimes(1);
		expect(handleLocalFileDropped).toHaveBeenCalledTimes(1);
	});

	it("shows existing drag feedback across the page without flickering between children", () => {
		const onDrop = vi.fn();
		renderImportSurface(onDrop);
		const transfer = {
			types: ["Files"],
			items: [{ kind: "file", type: "video/mp4" }],
			files: [],
			dropEffect: "none",
		};
		fireEvent.dragEnter(document.body, { dataTransfer: transfer });
		expect(screen.getByText("Release to open")).toBeTruthy();
		fireEvent.dragEnter(screen.getByText("Open a video"), {
			dataTransfer: transfer,
		});
		fireEvent.dragLeave(document.body, { dataTransfer: transfer });
		expect(screen.getByText("Release to open")).toBeTruthy();
		expect(fireEvent.dragOver(document.body, { dataTransfer: transfer })).toBe(
			false,
		);
		expect(transfer.dropEffect).toBe("copy");
		fireEvent.dragLeave(screen.getByText("Open a video"), {
			dataTransfer: transfer,
		});
		expect(screen.getByText("Drop your video or click to browse")).toBeTruthy();
		fireEvent.dragEnter(document.body, { dataTransfer: transfer });
		fireEvent.blur(window);
		expect(screen.getByText("Drop your video or click to browse")).toBeTruthy();
		const file = new File(["video"], "anywhere.mp4", { type: "video/mp4" });
		fireEvent.drop(document.body, {
			dataTransfer: { ...transfer, files: [file] },
		});
		expect(onDrop).toHaveBeenCalledExactlyOnceWith(file);
	});

	it("rejects non-video files but leaves text drags alone", () => {
		const onDrop = vi.fn();
		renderImportSurface(onDrop);
		const textTransfer = {
			types: ["text/plain"],
			items: [{ kind: "string", type: "text/plain" }],
			files: [],
		};
		expect(
			fireEvent.dragOver(document.body, { dataTransfer: textTransfer }),
		).toBe(true);
		expect(screen.getByText("Drop your video or click to browse")).toBeTruthy();
		const invalidTransfer = {
			types: ["Files"],
			items: [{ kind: "file", type: "image/png" }],
			files: [new File(["image"], "image.png", { type: "image/png" })],
			dropEffect: "copy",
		};
		fireEvent.dragEnter(document.body, { dataTransfer: invalidTransfer });
		expect(screen.getByText("Invalid file type")).toBeTruthy();
		fireEvent.dragOver(document.body, { dataTransfer: invalidTransfer });
		expect(invalidTransfer.dropEffect).toBe("none");
		fireEvent.drop(document.body, { dataTransfer: invalidTransfer });
		expect(onDrop).not.toHaveBeenCalled();
		expect(screen.getByText("Drop your video or click to browse")).toBeTruthy();
	});

	it("blocks drops while loading and removes page listeners when the import surface unmounts", () => {
		const onDrop = vi.fn();
		const view = renderImportSurface(onDrop, loadingSession);
		const transfer = {
			types: ["Files"],
			items: [{ kind: "file", type: "video/mp4" }],
			files: [new File(["video"], "test.mp4", { type: "video/mp4" })],
			dropEffect: "copy",
		};
		fireEvent.dragEnter(document.body, { dataTransfer: transfer });
		fireEvent.dragOver(document.body, { dataTransfer: transfer });
		expect(transfer.dropEffect).toBe("none");
		expect(fireEvent.drop(document.body, { dataTransfer: transfer })).toBe(
			false,
		);
		expect(onDrop).not.toHaveBeenCalled();
		view.unmount();
		expect(fireEvent.drop(document.body, { dataTransfer: transfer })).toBe(
			true,
		);
		expect(onDrop).not.toHaveBeenCalled();
	});

	it("renders loading state with disabled import controls", () => {
		render(
			<EditorSessionShell
				localFileInputKey={0}
				onLocalFileDropped={() => undefined}
				onLocalFileSelected={() => undefined}
				previewPlayer={null}
				session={loadingSession}
			/>,
		);

		expect(screen.getByText("Opening video")).toBeTruthy();
		expect(screen.getByText("loading.mp4")).toBeTruthy();
		expect(
			(screen.getByLabelText("Local media file") as HTMLInputElement).disabled,
		).toBe(true);
	});

	it("keeps the right inspector visible and changes tabs without remounting the preview", () => {
		render(<ReadyWorkbench />);
		const preview = screen.getByLabelText("Preview slot");
		expect(screen.getByLabelText("Workbench inspector region")).toBeTruthy();
		expect(screen.getByLabelText("Resize inspector panel")).toBeTruthy();
		expect(
			screen.queryByRole("button", { name: "Toggle inspector" }),
		).toBeNull();
		expect(screen.getByLabelText("Media asset context")).toBeTruthy();
		activateTab(screen.getByRole("tab", { name: "Audio" }));
		expect(screen.getByLabelText("Audio panel")).toBeTruthy();
		activateTab(screen.getByRole("tab", { name: "Export" }));
		expect(screen.getByLabelText("Export inspector")).toBeTruthy();
		expect(screen.getByLabelText("Preview slot")).toBe(preview);
		expect(screen.getByLabelText("Selection slot")).toBeTruthy();
	});

	it("does not refocus tabs after pointer actions", () => {
		const frames = new Map<number, FrameRequestCallback>();
		let nextFrame = 0;
		vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
			frames.set(++nextFrame, callback);
			return nextFrame;
		});
		vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
			frames.delete(id);
		});
		const focus = vi.spyOn(HTMLElement.prototype, "focus");
		function flushFrames() {
			act(() => {
				const pending = [...frames.values()];
				frames.clear();
				for (const callback of pending) callback(0);
			});
		}
		render(<ReadyWorkbench />);
		focus.mockClear();
		flushFrames();
		expect(focus).not.toHaveBeenCalled();

		activateTab(screen.getByRole("tab", { name: "Audio" }));
		focus.mockClear();
		flushFrames();
		expect(focus).not.toHaveBeenCalled();

		activateTab(screen.getByRole("tab", { name: "Export" }));
		focus.mockClear();
		flushFrames();
		expect(focus).not.toHaveBeenCalled();
	});

	it("restores the last opened ready inspector tab", () => {
		const view = renderReadyEditorSessionShell();

		const inspectorRegion = screen.getByLabelText("Workbench inspector region");
		activateTab(within(inspectorRegion).getByRole("tab", { name: "Audio" }));

		expect(
			window.localStorage.getItem("editor-next-workbench-inspector-tab"),
		).toBe("audio");
		expect(within(inspectorRegion).getByLabelText("Audio panel")).toBeTruthy();

		view.unmount();
		renderReadyEditorSessionShell();

		const restoredInspectorRegion = screen.getByLabelText(
			"Workbench inspector region",
		);
		expect(
			within(restoredInspectorRegion)
				.getByRole("tab", { name: "Audio" })
				.getAttribute("aria-selected"),
		).toBe("true");
		expect(
			within(restoredInspectorRegion).getByLabelText("Audio panel"),
		).toBeTruthy();
	});
});

const supportedRuntime = evaluateRuntimeSupport({
	fileApi: true,
	mediaSource: true,
	objectUrl: true,
	videoDecoder: true,
	videoEncoder: true,
});

const readyAsset = {
	durationUs: 12_000_000,
	exportCapability: {
		profile: DEFAULT_OUTPUT_PROFILE,
		supported: true,
	},
	frameTiming: {
		fps: 30,
		frameDurationUs: 33_333,
		source: "known",
	},
	id: "asset-workbench",
	label: "recording.mp4",
	provenance: {
		fileName: "recording.mp4",
		mimeType: "video/mp4",
		sizeBytes: 12_345,
	},
	tracks: {
		audio: [],
		video: [
			{
				codec: "avc",
				height: 1080,
				id: "video-workbench",
				kind: "video",
				label: "Main",
				width: 1920,
			},
		],
	},
} satisfies ReadyMediaAsset;

const readySession = {
	asset: readyAsset,
	audioMix: createDefaultAudioMix(readyAsset),
	export: {
		status: "reviewing",
	},
	importEnabled: false,
	outputSettings: createDefaultOutputSettings(),
	runtime: supportedRuntime,
	selection: {
		endUs: 12_000_000,
		startUs: 0,
	},
	status: "ready",
} satisfies Extract<EditorSessionState, { status: "ready" }>;

const loadingSession = {
	draft: {
		id: "draft-loading",
		kind: "local-file",
		label: "loading.mp4",
		provenance: {
			fileName: "loading.mp4",
			mimeType: "video/mp4",
			sizeBytes: 5,
		},
		source: {
			lastModified: 1_717_171_717,
			name: "loading.mp4",
			size: 5,
			type: "video/mp4",
		},
	},
	importEnabled: false,
	runtime: supportedRuntime,
	status: "loading",
} satisfies Extract<EditorSessionState, { status: "loading" }>;

function activateTab(tab: HTMLElement) {
	fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
	fireEvent.click(tab);
}

function ReadyWorkbench() {
	const inspector = useWorkbenchInspector();
	return (
		<EditorWorkbenchFrame activeAsset={readyAsset} runtime={supportedRuntime}>
			<EditorSessionShell
				localFileInputKey={0}
				onLocalFileDropped={() => undefined}
				onLocalFileSelected={() => undefined}
				session={readySession}
				previewPlayer={
					<EditorWorkbenchLayout
						viewer={<section aria-label="Preview slot">Preview slot</section>}
						transport={<div>Transport</div>}
						selection={<section aria-label="Selection slot">Selection</section>}
						inspector={
							<WorkbenchInspectorTabs
								activeTab={inspector.activeTab}
								onTabChange={inspector.selectTab}
								audioPanel={
									<section aria-label="Audio panel">Audio panel slot</section>
								}
								exportInspector={
									<section aria-label="Export inspector">
										Export inspector slot
									</section>
								}
								mediaAssetContext={
									<section aria-label="Media asset context">
										Media asset slot
									</section>
								}
							/>
						}
					/>
				}
			/>
		</EditorWorkbenchFrame>
	);
}
function renderReadyEditorSessionShell() {
	const view = render(<ReadyWorkbench />);
	return view;
}

function renderImportSurface(
	onLocalFileDropped: (file: File) => void,
	session: EditorSessionShellProps["session"] = {
		status: "empty",
		importEnabled: true,
		runtime: supportedRuntime,
	},
) {
	return render(
		<EditorSessionShell
			localFileInputKey={0}
			onLocalFileDropped={onLocalFileDropped}
			onLocalFileSelected={() => undefined}
			previewPlayer={null}
			session={session}
		/>,
	);
}
