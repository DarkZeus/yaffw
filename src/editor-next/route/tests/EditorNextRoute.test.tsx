/* @vitest-environment jsdom */

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LocalMediaAssetInspection } from "@/editor-core/local-file-analysis";
import type { ExportProgress } from "@/editor-core/model";
import { evaluateRuntimeSupport } from "@/editor-core/runtime-capabilities";

import { EditorNextRoute } from "../entry/EditorNextRoute";
import { EditorNextRouteTestHarness } from "./editor-next-route-test-harness";

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

beforeEach(() => {
	window.history.replaceState(null, "", "/");
	vi.stubGlobal("MediaSource", class MediaSource {});
	vi.stubGlobal("VideoDecoder", class VideoDecoder {});
	vi.stubGlobal("VideoEncoder", class VideoEncoder {});
	Object.defineProperty(URL, "createObjectURL", {
		configurable: true,
		value: vi.fn(() => "blob:editor-next-preview"),
	});
	Object.defineProperty(URL, "revokeObjectURL", {
		configurable: true,
		value: vi.fn(),
	});
});

afterEach(() => {
	cleanup();
	window.localStorage.clear();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	restoreObjectUrl("createObjectURL", originalCreateObjectURL);
	restoreObjectUrl("revokeObjectURL", originalRevokeObjectURL);
});

describe("EditorNextRoute", () => {
	it("renders the empty local import shell when the runtime is supported", () => {
		render(<EditorNextRoute />);

		expect(screen.getByText("Open a video")).toBeTruthy();
		expect(screen.getByLabelText("Local media file")).toBeTruthy();
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("renders the unsupported runtime state before exposing local import", () => {
		render(
			<EditorNextRouteTestHarness
				initialRuntime={evaluateRuntimeSupport({
					fileApi: true,
					mediaSource: true,
					objectUrl: true,
					videoDecoder: false,
					videoEncoder: false,
				})}
			/>,
		);

		const alert = screen.getByRole("alert");

		expect(alert.textContent).toContain("WebCodecs");
		expect(screen.queryByLabelText("Local media file")).toBeNull();
	});

	it("renders importing and analyzing inside the workbench preview region", async () => {
		const inspection = createDeferred<LocalMediaAssetInspection>();

		render(
			<EditorNextRouteTestHarness
				createAssetId={() => "asset-loading"}
				createDraftId={() => "draft-loading"}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={() => inspection.promise}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Local media file"), {
			target: {
				files: [new File(["video"], "loading.mp4", { type: "video/mp4" })],
			},
		});

		await waitFor(() => {
			expect(screen.getByText("Opening video")).toBeTruthy();
		});
		expect(screen.getByText("loading.mp4")).toBeTruthy();
		expect(
			(screen.getByLabelText("Local media file") as HTMLInputElement).disabled,
		).toBe(true);

		inspection.resolve(supportedInspection);
		await waitFor(() => {
			expect(screen.getByLabelText("Preview for loading.mp4")).toBeTruthy();
		});
	});

	it("imports a local file from the file picker into the ready editor state", async () => {
		render(
			<EditorNextRouteTestHarness
				createAssetId={() => "asset-picked"}
				createDraftId={() => "draft-picked"}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => supportedInspection}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Local media file"), {
			target: {
				files: [new File(["video"], "picked.mp4", { type: "video/mp4" })],
			},
		});

		await waitFor(() => {
			expect(screen.getByLabelText("Preview for picked.mp4")).toBeTruthy();
		});

		expect(screen.getAllByText("picked.mp4").length).toBeGreaterThan(0);
		expect(screen.queryByLabelText("Local media file")).toBeNull();
		openMediaTab();
		expect(screen.getByLabelText("Media asset context")).toBeTruthy();

		openExportTab();
		expect(screen.getByLabelText("Export review")).toBeTruthy();
		expect(screen.getByLabelText("Export inspector")).toBeTruthy();

		fireEvent.keyDown(document.body, { code: "KeyL", key: "l" });
		fireEvent.keyDown(document.body, { code: "BracketLeft", key: "[" });

		await waitFor(() => {
			expect(screen.getAllByText("00:00:10.000").length).toBeGreaterThan(0);
		});
		expect(screen.getAllByText("00:00:12.000").length).toBeGreaterThan(0);
		await waitFor(() => {
			expect(screen.getByText("Standard export")).toBeTruthy();
		});
	});

	it("keeps Audio panel controls synced with Waveform lane quick controls", async () => {
		mockTimelineGeometry();
		render(
			<EditorNextRouteTestHarness
				createAssetId={() => "asset-audio-controls"}
				createDraftId={() => "draft-audio-controls"}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => supportedInspection}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Local media file"), {
			target: {
				files: [
					new File(["video"], "audio-controls.mp4", { type: "video/mp4" }),
				],
			},
		});

		await waitFor(() => {
			expect(screen.getByLabelText("Selection timeline")).toBeTruthy();
		});
		openAudioTab();

		const audioPanel = screen.getByLabelText("Audio panel");
		const selectionRegion = screen.getByLabelText("Workbench selection region");

		fireEvent.click(
			within(audioPanel).getByRole("button", {
				name: "Exclude Voice from output",
			}),
		);

		await waitFor(() => {
			expect(
				within(audioPanel).getByRole("button", {
					name: "Include Voice in output",
				}),
			).toBeTruthy();
		});
		expect(
			within(selectionRegion).getByRole("button", {
				name: "Include Voice in output",
			}),
		).toBeTruthy();

		fireEvent.click(
			within(selectionRegion).getByRole("button", {
				name: "Include Voice in output",
			}),
		);

		await waitFor(() => {
			expect(
				within(audioPanel).getByRole("button", {
					name: "Exclude Voice from output",
				}),
			).toBeTruthy();
		});

		fireEvent.click(
			within(audioPanel).getByRole("button", {
				name: "Solo Voice for preview",
			}),
		);

		await waitFor(() => {
			expect(
				within(selectionRegion).getByRole("button", {
					name: "Clear Voice preview solo",
				}),
			).toBeTruthy();
		});

		fireEvent.click(
			within(selectionRegion).getByRole("button", {
				name: "Clear Voice preview solo",
			}),
		);

		await waitFor(() => {
			expect(
				within(audioPanel).getByRole("button", {
					name: "Solo Voice for preview",
				}),
			).toBeTruthy();
		});
	});

	it("runs default export from the review and requires explicit generated-media delivery", async () => {
		const generatedBlob = new Blob(["generated media"], { type: "video/mp4" });
		const progressEvents: ExportProgress[] = [];
		const exportStarted = createDeferred<{ blob: Blob }>();
		const exportRun = vi.fn(({ onProgress }) => {
			const emitProgress = (progress: ExportProgress) => {
				progressEvents.push(progress);
				onProgress(progress);
			};

			emitProgress({
				phase: "preparing",
			});
			emitProgress({
				completedRatio: 0.4,
				phase: "encoding",
			});

			return exportStarted.promise;
		});
		const deliverGeneratedMedia = vi.fn();

		render(
			<EditorNextRouteTestHarness
				createAssetId={() => "asset-exported"}
				createDraftId={() => "draft-exported"}
				createExportJobId={() => "export-route"}
				createGeneratedMediaId={() => "generated-route"}
				defaultExportRunner={{
					cancelSupported: true,
					run: exportRun,
				}}
				deliverGeneratedMedia={deliverGeneratedMedia}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => supportedInspection}
				now={() => 1_717_171_717}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Local media file"), {
			target: {
				files: [new File(["video"], "picked.mp4", { type: "video/mp4" })],
			},
		});

		await waitFor(() => {
			expect(screen.getByLabelText("Preview for picked.mp4")).toBeTruthy();
		});
		openExportTab();
		expect(screen.getByLabelText("Export review")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Start export" }));

		await waitFor(() => {
			expect(exportRun).toHaveBeenCalledTimes(1);
		});
		expect(screen.getByRole("button", { name: "Cancel export" })).toBeTruthy();

		exportStarted.resolve({
			blob: generatedBlob,
		});

		await waitFor(() => {
			expect(screen.getByText("Export complete")).toBeTruthy();
		});
		expect(
			screen.getByLabelText("Generated media output").textContent,
		).toContain("MP4 · H.264 · AAC · 1920x1080");

		expect(deliverGeneratedMedia).not.toHaveBeenCalled();
		expect(screen.getByText("picked-export.mp4")).toBeTruthy();
		expect(
			within(screen.getByLabelText("Generated media status")).getByRole(
				"button",
				{
					name: "Download export",
				},
			),
		).toBeTruthy();
		expect(screen.getAllByLabelText(/^Preview for/)).toHaveLength(1);
		expect(progressEvents[0]).toEqual({
			phase: "preparing",
		});

		fireEvent.click(screen.getByRole("button", { name: "Download export" }));

		expect(deliverGeneratedMedia).toHaveBeenCalledWith({
			blob: generatedBlob,
			generatedMedia: expect.objectContaining({
				assetId: "asset-exported",
				createdAtMs: 1_717_171_717,
				fileName: "picked-export.mp4",
				id: "generated-route",
				mimeType: "video/mp4",
				profile: {
					audioCodec: "aac",
					container: "mp4",
					videoCodec: "h264",
				},
				selection: {
					endUs: 12_000_000,
					startUs: 0,
				},
				sizeBytes: generatedBlob.size,
			}),
		});
		await waitFor(() => {
			expect(screen.getByText("Delivered")).toBeTruthy();
		});
	});

	it("asks for confirmation before close and leaves the loaded session unchanged when cancelled", async () => {
		const confirmClose = vi.spyOn(window, "confirm").mockReturnValue(false);

		render(
			<EditorNextRouteTestHarness
				createAssetId={() => "asset-close-cancelled"}
				createDraftId={() => "draft-close-cancelled"}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => supportedInspection}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Local media file"), {
			target: {
				files: [
					new File(["video"], "close-cancelled.mp4", { type: "video/mp4" }),
				],
			},
		});

		await waitFor(() => {
			expect(
				screen.getByLabelText("Preview for close-cancelled.mp4"),
			).toBeTruthy();
		});

		openMediaTab();
		fireEvent.click(screen.getByRole("button", { name: "Close file" }));

		expect(confirmClose).toHaveBeenCalledTimes(1);
		expect(
			screen.getByLabelText("Preview for close-cancelled.mp4"),
		).toBeTruthy();
		expect(screen.queryByLabelText("Local media file")).toBeNull();
		expect(URL.revokeObjectURL).not.toHaveBeenCalled();
	});

	it("disables close while an export job is running", async () => {
		const exportStarted = createDeferred<{ blob: Blob }>();

		render(
			<EditorNextRouteTestHarness
				createAssetId={() => "asset-close-disabled"}
				createDraftId={() => "draft-close-disabled"}
				createExportJobId={() => "export-close-disabled"}
				defaultExportRunner={{
					cancelSupported: true,
					run: vi.fn(() => exportStarted.promise),
				}}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => supportedInspection}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Local media file"), {
			target: {
				files: [
					new File(["video"], "close-disabled.mp4", { type: "video/mp4" }),
				],
			},
		});

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: "Export" })).toBeTruthy();
		});
		openMediaTab();

		expect(
			(screen.getByRole("button", { name: "Close file" }) as HTMLButtonElement)
				.disabled,
		).toBe(false);

		openExportTab();
		fireEvent.click(screen.getByRole("button", { name: "Start export" }));

		openMediaTab();
		await waitFor(() => {
			expect(
				(
					screen.getByRole("button", {
						name: "Close file",
					}) as HTMLButtonElement
				).disabled,
			).toBe(true);
		});

		exportStarted.resolve({
			blob: new Blob(["export"], { type: "video/mp4" }),
		});
	});

	it("protects beforeunload only while session-local editor work exists", async () => {
		vi.spyOn(window, "confirm").mockReturnValue(true);

		render(
			<EditorNextRouteTestHarness
				createAssetId={() => "asset-beforeunload"}
				createDraftId={() => "draft-beforeunload"}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => supportedInspection}
			/>,
		);

		expect(dispatchBeforeUnload()).toBe(false);

		fireEvent.change(screen.getByLabelText("Local media file"), {
			target: {
				files: [new File(["video"], "beforeunload.mp4", { type: "video/mp4" })],
			},
		});

		await waitFor(() => {
			expect(
				screen.getByLabelText("Preview for beforeunload.mp4"),
			).toBeTruthy();
		});

		await waitFor(() => {
			expect(dispatchBeforeUnload()).toBe(true);
		});

		openMediaTab();
		fireEvent.click(screen.getByRole("button", { name: "Close file" }));

		await waitFor(() => {
			expect(screen.getByText("Open a video")).toBeTruthy();
		});

		expect(dispatchBeforeUnload()).toBe(false);
	});

	it("does not persist active session state across a route remount", async () => {
		const { unmount } = render(
			<EditorNextRouteTestHarness
				createAssetId={() => "asset-remount"}
				createDraftId={() => "draft-remount"}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => supportedInspection}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Local media file"), {
			target: {
				files: [new File(["video"], "remount.mp4", { type: "video/mp4" })],
			},
		});

		await waitFor(() => {
			expect(screen.getByLabelText("Preview for remount.mp4")).toBeTruthy();
		});

		unmount();

		render(
			<EditorNextRouteTestHarness
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => supportedInspection}
			/>,
		);

		expect(screen.getByText("Open a video")).toBeTruthy();
		expect(screen.queryByText("Ready media asset")).toBeNull();
		expect(screen.queryByLabelText("Preview for remount.mp4")).toBeNull();
	});

	it("hides cancellation when the active export runner cannot stop safely", async () => {
		const exportStarted = createDeferred<{ blob: Blob }>();
		const exportRun = vi.fn(() => exportStarted.promise);

		render(
			<EditorNextRouteTestHarness
				createAssetId={() => "asset-uncancellable"}
				createDraftId={() => "draft-uncancellable"}
				createExportJobId={() => "export-uncancellable"}
				createGeneratedMediaId={() => "generated-uncancellable"}
				defaultExportRunner={{
					cancelSupported: false,
					run: exportRun,
				}}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => supportedInspection}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Local media file"), {
			target: {
				files: [
					new File(["video"], "uncancellable.mp4", { type: "video/mp4" }),
				],
			},
		});

		await waitFor(() => {
			expect(
				screen.getByLabelText("Preview for uncancellable.mp4"),
			).toBeTruthy();
		});
		openExportTab();
		expect(screen.getByRole("button", { name: "Start export" })).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Start export" }));

		await waitFor(() => {
			expect(exportRun).toHaveBeenCalledTimes(1);
		});
		expect(screen.queryByRole("button", { name: "Cancel export" })).toBeNull();
		expect(screen.getByText("Cancellation unavailable")).toBeTruthy();

		exportStarted.resolve({
			blob: new Blob(["export"], { type: "video/mp4" }),
		});

		await waitFor(() => {
			expect(screen.getByText("Export complete")).toBeTruthy();
		});
	});

	it("renders a shared selection timeline with progressive waveform lanes and commits handle drags through the session", async () => {
		mockTimelineGeometry();
		render(
			<EditorNextRouteTestHarness
				createAssetId={() => "asset-timeline"}
				createDraftId={() => "draft-timeline"}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => supportedInspection}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Local media file"), {
			target: {
				files: [new File(["video"], "timeline.mp4", { type: "video/mp4" })],
			},
		});

		await waitFor(() => {
			expect(screen.getByLabelText("Selection timeline")).toBeTruthy();
		});

		const selectionRegion = screen.getByLabelText("Workbench selection region");
		const centerRegion = screen.getByLabelText("Workbench center region");

		expect(
			within(selectionRegion).getByLabelText("Selection timeline"),
		).toBeTruthy();
		expect(
			within(centerRegion).queryByLabelText("Selection timeline"),
		).toBeNull();
		expect(screen.getAllByText("Voice").length).toBeGreaterThan(0);
		expect(screen.queryByText("Language eng")).toBeNull();
		expect(screen.getAllByText("AAC / 2 channels").length).toBeGreaterThan(0);
		expect(within(selectionRegion).getByText("Selection")).toBeTruthy();
		expect(screen.getAllByText("00:00:12.000").length).toBeGreaterThan(0);

		fireEvent.mouseDown(screen.getByLabelText("Selection start handle"), {
			clientX: 0,
		});
		fireEvent.mouseMove(window, { clientX: 600 });
		fireEvent.mouseUp(window, { clientX: 600 });

		await waitFor(() => {
			expect(screen.getAllByText("00:00:06.000").length).toBeGreaterThan(0);
		});
		expect(screen.getAllByText("00:00:12.000").length).toBeGreaterThan(0);

		fireEvent.click(screen.getByRole("button", { name: "Reset selection" }));

		await waitFor(() => {
			expect(screen.getAllByText("00:00:00.000").length).toBeGreaterThan(0);
		});
		expect(screen.getByLabelText("Preview playhead time")).toBeTruthy();
		expect(screen.getAllByText("00:00:06.000").length).toBeGreaterThan(0);
	});

	it("imports a local file dropped on the page header into the ready editor state", async () => {
		render(
			<EditorNextRouteTestHarness
				createAssetId={() => "asset-dropped"}
				createDraftId={() => "draft-dropped"}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => ({
					...supportedInspection,
					audioTracks: [],
				})}
			/>,
		);

		fireEvent.drop(screen.getByLabelText("Editor workbench top bar"), {
			dataTransfer: {
				files: [new File(["video"], "dropped.webm", { type: "video/webm" })],
			},
		});

		await waitFor(() => {
			expect(screen.getByLabelText("Preview for dropped.webm")).toBeTruthy();
		});

		expect(screen.getAllByText("dropped.webm").length).toBeGreaterThan(0);
		expect(screen.queryByLabelText("Local media file")).toBeNull();
		openMediaTab();
		expect(screen.getByLabelText("Media asset context")).toBeTruthy();
	});

	it("shows unsupported-media failures with technical details on demand", async () => {
		render(
			<EditorNextRouteTestHarness
				createAssetId={() => "asset-audio-only"}
				createDraftId={() => "draft-audio-only"}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => ({
					...supportedInspection,
					audioTracks: supportedInspection.audioTracks,
					videoTracks: [],
				})}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Local media file"), {
			target: {
				files: [new File(["audio"], "audio-only.mp4", { type: "video/mp4" })],
			},
		});

		await waitFor(() => {
			expect(screen.getByRole("alert").textContent).toContain("Audio-only");
		});

		expect(screen.getByText("Couldn’t open video")).toBeTruthy();
		expect(screen.getByText("Technical details")).toBeTruthy();
	});
});

const supportedRuntime = evaluateRuntimeSupport({
	fileApi: true,
	mediaSource: true,
	objectUrl: true,
	videoDecoder: true,
	videoEncoder: true,
});

const supportedInspection = {
	audioTracks: [
		{
			channels: 2,
			codec: "aac",
			id: "audio-1",
			language: "eng",
			label: "Voice",
			sampleRate: 48_000,
		},
	],
	durationUs: 12_000_000,
	frameTiming: {
		fps: 30,
		frameDurationUs: 33_333,
		source: "known",
	},
	videoTracks: [
		{
			codec: "avc",
			height: 1080,
			id: "video-1",
			label: "Main",
			width: 1920,
		},
	],
} satisfies LocalMediaAssetInspection;

function restoreObjectUrl(
	key: "createObjectURL" | "revokeObjectURL",
	value: typeof URL.createObjectURL | typeof URL.revokeObjectURL | undefined,
) {
	if (value) {
		Object.defineProperty(URL, key, {
			configurable: true,
			value,
		});
		return;
	}

	delete URL[key];
}

function openExportTab() {
	activateTab(screen.getByRole("tab", { name: "Export" }));
}

function openAudioTab() {
	activateTab(screen.getByRole("tab", { name: "Audio" }));
}

function openMediaTab() {
	activateTab(screen.getByRole("tab", { name: "Media" }));
}

function activateTab(tab: HTMLElement) {
	fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
	fireEvent.click(tab);
}

function mockTimelineGeometry() {
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
		function getBoundingClientRect(this: HTMLElement) {
			if (
				this instanceof HTMLElement &&
				this.dataset.testid === "selection-timeline-track"
			) {
				return {
					bottom: 80,
					height: 80,
					left: 0,
					right: 1200,
					toJSON: () => ({}),
					top: 0,
					width: 1200,
					x: 0,
					y: 0,
				};
			}

			return {
				bottom: 0,
				height: 0,
				left: 0,
				right: 0,
				toJSON: () => ({}),
				top: 0,
				width: 0,
				x: 0,
				y: 0,
			};
		},
	);
}

function dispatchBeforeUnload() {
	const event = new Event("beforeunload", {
		cancelable: true,
	}) as BeforeUnloadEvent;

	window.dispatchEvent(event);

	return event.defaultPrevented;
}

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		resolve = promiseResolve;
		reject = promiseReject;
	});

	return {
		promise,
		reject,
		resolve,
	};
}
