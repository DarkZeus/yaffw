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

import { EditorNextRoute } from "./EditorNextRoute";

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

beforeEach(() => {
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
	vi.restoreAllMocks();
	restoreObjectUrl("createObjectURL", originalCreateObjectURL);
	restoreObjectUrl("revokeObjectURL", originalRevokeObjectURL);
});

describe("EditorNextRoute", () => {
	it("renders the empty local import shell when the runtime is supported", () => {
		render(
			<EditorNextRoute
				initialRuntime={evaluateRuntimeSupport({
					fileApi: true,
					mediaSource: true,
					objectUrl: true,
					videoDecoder: true,
					videoEncoder: true,
				})}
			/>,
		);

		expect(screen.getByText("YAFFW")).toBeTruthy();
		expect(screen.getByText("Editor workbench")).toBeTruthy();
		expect(screen.getByLabelText("Editor workbench top bar")).toBeTruthy();
		const rail = screen.getByLabelText("Editor workbench rail");
		expect(rail).toBeTruthy();
		expect(rail.tagName).toBe("ASIDE");
		expect(within(rail).queryAllByRole("button")).toHaveLength(0);
		expect(within(rail).queryAllByRole("link")).toHaveLength(0);
		expect(
			screen.queryByRole("navigation", { name: "Editor workbench rail" }),
		).toBeNull();
		expect(screen.getByLabelText("Workbench center region")).toBeTruthy();
		expect(screen.getByText("No media asset loaded")).toBeTruthy();
		expect(screen.getByLabelText("Local video file")).toBeTruthy();
		expect(screen.queryByLabelText("Workbench media asset region")).toBeNull();
		expect(screen.queryByLabelText("Workbench inspector region")).toBeNull();
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("can render the uploaded-media visual fixture without exposing upload controls", async () => {
		render(
			<EditorNextRoute
				initialRuntime={supportedRuntime}
				mockUploadedMediaState
			/>,
		);

		await waitFor(() => {
			expect(
				screen.getByLabelText("Preview for stalker-patch-1.5-teaser.mp4"),
			).toBeTruthy();
		});
		expect(screen.queryByLabelText("Local video file")).toBeNull();
		expect(
			screen.getAllByText("stalker-patch-1.5-teaser.mp4").length,
		).toBeGreaterThan(0);
		expect(screen.getByText("Selection and waveform")).toBeTruthy();
		expect(screen.getByText("Generated media")).toBeTruthy();
	});

	it("renders the unsupported runtime state before exposing local import", () => {
		render(
			<EditorNextRoute
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
		expect(screen.getByLabelText("Editor workbench top bar")).toBeTruthy();
		expect(screen.getByLabelText("Editor workbench rail")).toBeTruthy();
		expect(screen.getByLabelText("Workbench center region")).toBeTruthy();
		expect(screen.queryByLabelText("Workbench media asset region")).toBeNull();
		expect(screen.queryByLabelText("Workbench inspector region")).toBeNull();
		expect(screen.queryByLabelText("Local video file")).toBeNull();
	});

	it("renders importing and analyzing inside the workbench preview region", async () => {
		const inspection = createDeferred<LocalMediaAssetInspection>();

		render(
			<EditorNextRoute
				createAssetId={() => "asset-loading"}
				createDraftId={() => "draft-loading"}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={() => inspection.promise}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Local video file"), {
			target: {
				files: [new File(["video"], "loading.mp4", { type: "video/mp4" })],
			},
		});

		await waitFor(() => {
			expect(screen.getByText("Analyzing media asset draft")).toBeTruthy();
		});
		expect(
			screen.getByText("Preparing media asset draft loading.mp4."),
		).toBeTruthy();
		expect(
			(screen.getByLabelText("Local video file") as HTMLInputElement).disabled,
		).toBe(true);
		expect(screen.queryByLabelText("Workbench media asset region")).toBeNull();
		expect(screen.queryByLabelText("Workbench inspector region")).toBeNull();

		inspection.resolve(supportedInspection);
		await waitFor(() => {
			expect(screen.getByLabelText("Preview for loading.mp4")).toBeTruthy();
		});
	});

	it("imports a local file from the file picker into the ready editor state", async () => {
		render(
			<EditorNextRoute
				createAssetId={() => "asset-picked"}
				createDraftId={() => "draft-picked"}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => supportedInspection}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Local video file"), {
			target: {
				files: [new File(["video"], "picked.mp4", { type: "video/mp4" })],
			},
		});

		await waitFor(() => {
			expect(screen.getByLabelText("Preview for picked.mp4")).toBeTruthy();
		});

		expect(screen.getAllByText("picked.mp4").length).toBeGreaterThan(0);
		expect(screen.queryByLabelText("Local video file")).toBeNull();
		const mediaAssetRegion = screen.getByLabelText(
			"Workbench media asset region",
		);
		expect(mediaAssetRegion.className).toContain("overflow-x-hidden");
		expect(mediaAssetRegion.className).toContain("min-w-0");
		expect(mediaAssetRegion.className).toContain("xl:overflow-y-auto");
		const mediaAssetContext = screen.getByLabelText("Media asset context");
		expect(mediaAssetContext.className).toContain("overflow-x-hidden");
		expect(mediaAssetContext.className).toContain("rounded-md");
		expect(mediaAssetContext.className).toContain("bg-workbench-inspector");
		const loadedMediaAsset =
			within(mediaAssetContext).getByLabelText("Loaded media asset");
		expect(within(loadedMediaAsset).getByText("picked.mp4")).toBeTruthy();
		expect(loadedMediaAsset.className).toContain("rounded");
		expect(within(mediaAssetContext).getByText("Source")).toBeTruthy();
		expect(within(mediaAssetContext).getByText("Tracks")).toBeTruthy();
		expect(within(mediaAssetContext).getByText("Selection")).toBeTruthy();
		expect(
			within(mediaAssetContext).queryByText("Workbench intent"),
		).toBeNull();
		const mediaAnalytics =
			within(mediaAssetContext).getByLabelText("Media analytics");
		expect(within(mediaAnalytics).getByText("Analytics")).toBeTruthy();
		expect(within(mediaAnalytics).getByText("Source context")).toBeTruthy();
		expect(within(mediaAnalytics).getByText("Video facts")).toBeTruthy();
		expect(within(mediaAnalytics).getByText("Audio facts")).toBeTruthy();
		expect(within(mediaAnalytics).getByText("Selection facts")).toBeTruthy();
		expect(within(mediaAnalytics).getByText("Asset identity")).toBeTruthy();
		expect(within(mediaAnalytics).getByText("Asset coverage")).toBeTruthy();
		expect(within(mediaAnalytics).queryByText("Source file")).toBeNull();
		expect(
			within(mediaAssetContext).getAllByText("Size").length,
		).toBeGreaterThanOrEqual(1);
		expect(
			within(mediaAssetContext).getAllByText("5 B").length,
		).toBeGreaterThanOrEqual(1);
		expect(
			within(mediaAssetContext).getAllByText("Duration").length,
		).toBeGreaterThanOrEqual(2);
		expect(
			within(mediaAssetContext).getAllByText("Codec").length,
		).toBeGreaterThanOrEqual(1);
		expect(within(mediaAssetContext).getByText("AVC / AAC")).toBeTruthy();
		expect(
			within(mediaAssetContext).getAllByText("Frames").length,
		).toBeGreaterThanOrEqual(1);
		expect(
			within(mediaAssetContext).getAllByText("30 fps known").length,
		).toBeGreaterThanOrEqual(1);
		expect(
			within(mediaAssetContext).getAllByText("Main").length,
		).toBeGreaterThanOrEqual(1);
		expect(within(mediaAssetContext).getByText("1920 x 1080")).toBeTruthy();
		expect(
			within(mediaAssetContext).getAllByText("Voice").length,
		).toBeGreaterThanOrEqual(1);
		expect(
			within(mediaAssetContext).getAllByText("eng").length,
		).toBeGreaterThanOrEqual(1);
		expect(within(mediaAssetContext).getByText("Start")).toBeTruthy();
		expect(within(mediaAssetContext).getByText("End")).toBeTruthy();
		expect(within(mediaAssetContext).getByText("Coverage")).toBeTruthy();
		expect(
			within(mediaAssetContext).getAllByText("00:00:00.000").length,
		).toBeGreaterThan(0);
		expect(
			within(mediaAssetContext).getAllByText("00:00:12.000").length,
		).toBeGreaterThan(0);
		expect(
			within(mediaAssetContext).getAllByText("100%").length,
		).toBeGreaterThanOrEqual(1);
		expect(
			within(mediaAssetContext).queryByText("Runtime readiness"),
		).toBeNull();
		expect(within(mediaAssetContext).queryByText("Default export")).toBeNull();
		expect(screen.getByLabelText("Export review")).toBeTruthy();
		const inspectorRegion = screen.getByLabelText("Workbench inspector region");
		const exportInspector =
			within(inspectorRegion).getByLabelText("Export inspector");
		expect(within(exportInspector).getByText("Export review")).toBeTruthy();
		expect(within(exportInspector).getByText("Capability")).toBeTruthy();
		expect(within(exportInspector).getByText("Default profile")).toBeTruthy();
		expect(within(exportInspector).getByText("Selected range")).toBeTruthy();
		expect(within(exportInspector).getByText("Runtime checks")).toBeTruthy();
		expect(screen.getByText("Output")).toBeTruthy();
		expect(screen.getByText("MP4 / H.264 video / AAC audio")).toBeTruthy();
		expect(screen.getByText("Strategy")).toBeTruthy();
		expect(screen.getByText("Fast export")).toBeTruthy();
		expect(screen.getByText("Precision")).toBeTruthy();
		expect(screen.getAllByText("Full asset").length).toBeGreaterThan(0);
		expect(screen.queryByLabelText("Export strategy")).toBeNull();

		fireEvent.keyDown(document.body, { code: "KeyL", key: "l" });
		fireEvent.keyDown(document.body, { code: "BracketLeft", key: "[" });

		await waitFor(() => {
			expect(screen.getAllByText("00:00:10.000").length).toBeGreaterThan(0);
		});
		expect(screen.getAllByText("00:00:12.000").length).toBeGreaterThan(0);
		expect(
			within(mediaAssetContext).getAllByText("00:00:10.000").length,
		).toBeGreaterThan(0);
		expect(
			within(mediaAssetContext).getAllByText("00:00:02.000").length,
		).toBeGreaterThan(0);
		expect(
			within(mediaAssetContext).getAllByText("16.67%").length,
		).toBeGreaterThan(0);
		await waitFor(() => {
			expect(screen.getByText("Best-effort export")).toBeTruthy();
		});
	});

	it("places preview, transport, and selection in the resolved ready workbench layout", async () => {
		render(
			<EditorNextRoute
				createAssetId={() => "asset-center-preview"}
				createDraftId={() => "draft-center-preview"}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => supportedInspection}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Local video file"), {
			target: {
				files: [
					new File(["video"], "center-preview.mp4", { type: "video/mp4" }),
				],
			},
		});

		await waitFor(() => {
			expect(
				screen.getByLabelText("Preview for center-preview.mp4"),
			).toBeTruthy();
		});

		const topBarAssetSummary = screen.getByLabelText(
			"Top bar media asset summary",
		);
		expect(topBarAssetSummary.textContent).not.toContain("center-preview.mp4");
		expect(topBarAssetSummary.textContent).toContain("1920 x 1080");
		expect(topBarAssetSummary.textContent).toContain("30 fps known");
		expect(
			screen.getByLabelText("Editor workbench rail").parentElement?.className,
		).toContain("grid-cols-[4rem_minmax(0,1fr)]");
		const readyWorkbench = screen.getByLabelText("Editor workbench session");
		expect(readyWorkbench.className).toContain("xl:h-full");
		expect(readyWorkbench.className).toContain(
			"xl:grid-cols-[16.25rem_minmax(30rem,1fr)_19.75rem]",
		);
		expect(readyWorkbench.className).toContain(
			"xl:grid-rows-[minmax(0,1fr)_2.75rem_38%]",
		);
		expect(readyWorkbench.className).toContain("xl:gap-0");
		const centerRegion = screen.getByLabelText("Workbench center region");
		const transportRegion = screen.getByLabelText("Workbench transport region");
		const transportControls = within(transportRegion).getByLabelText(
			"Preview transport controls",
		);
		const mediaAssetRegion = screen.getByLabelText(
			"Workbench media asset region",
		);
		const inspectorRegion = screen.getByLabelText("Workbench inspector region");
		const selectionRegion = screen.getByLabelText("Workbench selection region");

		expect(
			within(centerRegion).getByLabelText("Preview for center-preview.mp4"),
		).toBeTruthy();
		expect(
			within(centerRegion).getByLabelText("Preview viewer header"),
		).toBeTruthy();
		expect(
			within(centerRegion).getByLabelText("Preview aperture"),
		).toBeTruthy();
		expect(
			within(centerRegion).queryByLabelText("Preview transport controls"),
		).toBeNull();
		expect(mediaAssetRegion.className).toContain("xl:col-start-1");
		expect(mediaAssetRegion.className).toContain("xl:row-start-1");
		expect(mediaAssetRegion.className).toContain("xl:border-r");
		expect(centerRegion.className).toContain("xl:col-start-2");
		expect(centerRegion.className).toContain("xl:row-start-1");
		expect(centerRegion.className).toContain("xl:rounded-none");
		expect(inspectorRegion.className).toContain("xl:col-start-3");
		expect(inspectorRegion.className).toContain("xl:row-start-1");
		expect(inspectorRegion.className).toContain("xl:border-l");
		expect(transportRegion.className).toContain("xl:col-span-3");
		expect(transportRegion.className).toContain("xl:row-start-2");
		expect(transportRegion.className).toContain("xl:rounded-none");
		expect(selectionRegion.className).toContain("xl:col-span-3");
		expect(selectionRegion.className).toContain("xl:row-start-3");
		expect(selectionRegion.className).toContain("xl:border-t");
		expect(
			within(selectionRegion).getByLabelText("Selection timeline"),
		).toBeTruthy();
		expect(
			within(transportControls).getByRole("button", { name: "Play" }),
		).toBeTruthy();
		expect(
			within(transportControls).getByLabelText("Primary preview controls"),
		).toBeTruthy();
		expect(
			within(transportControls).getByRole("button", {
				name: "Seek backward 10 seconds",
			}),
		).toBeTruthy();
		expect(
			within(transportControls).getByRole("button", {
				name: "Step forward one frame",
			}),
		).toBeTruthy();
		expect(
			within(transportControls).getByLabelText("Playback speed"),
		).toBeTruthy();
		expect(
			within(transportControls).getByLabelText("Preview volume"),
		).toBeTruthy();
		expect(
			within(transportControls).getByLabelText("Preview playback settings"),
		).toBeTruthy();
		expect(
			within(transportControls).getByLabelText("Preview media-time readouts")
				.className,
		).toContain("font-mono");
		expect(
			within(centerRegion).getByRole("button", {
				name: "Open fullscreen preview",
			}),
		).toBeTruthy();

		fireEvent.click(
			within(transportControls).getByRole("button", {
				name: "Seek forward 10 seconds",
			}),
		);

		await waitFor(() => {
			expect(
				within(transportRegion).getAllByText("00:00:10.000").length,
			).toBeGreaterThan(0);
		});
		expect(screen.getByLabelText("Export review")).toBeTruthy();
		expect(within(centerRegion).queryByLabelText("Export review")).toBeNull();
	});

	it("keeps ready-state overflow inside the workbench regions", async () => {
		render(
			<EditorNextRoute
				createAssetId={() => "asset-overflow"}
				createDraftId={() => "draft-overflow"}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => supportedInspection}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Local video file"), {
			target: {
				files: [new File(["video"], "overflow.mp4", { type: "video/mp4" })],
			},
		});

		await waitFor(() => {
			expect(screen.getByLabelText("Preview for overflow.mp4")).toBeTruthy();
		});

		const page = screen.getByLabelText("Editor workbench top bar").closest("main");
		expect(page?.className).toContain("h-screen");
		expect(page?.className).toContain("overflow-hidden");

		const readyWorkbench = screen.getByLabelText("Editor workbench session");
		expect(readyWorkbench.className).toContain("grid-cols-1");
		expect(readyWorkbench.className).toContain("xl:overflow-hidden");

		const mediaAssetRegion = screen.getByLabelText(
			"Workbench media asset region",
		);
		expect(mediaAssetRegion.className).toContain("overflow-x-hidden");
		expect(mediaAssetRegion.className).toContain("xl:overflow-y-auto");
		expect(mediaAssetRegion.className).toContain("overscroll-contain");

		const inspectorRegion = screen.getByLabelText("Workbench inspector region");
		expect(inspectorRegion.className).toContain("overflow-x-hidden");
		expect(inspectorRegion.className).toContain("xl:overflow-y-auto");
		expect(inspectorRegion.className).toContain("overscroll-contain");

		const selectionRegion = screen.getByLabelText("Workbench selection region");
		expect(selectionRegion.className).toContain("overflow-x-hidden");
		expect(selectionRegion.className).toContain("xl:overflow-y-auto");
		expect(selectionRegion.className).toContain("overscroll-contain");
		const selectionTimeline = within(selectionRegion).getByLabelText(
			"Selection timeline",
		);
		expect(selectionTimeline.className).toContain("min-h-full");
		expect(selectionTimeline.className).toContain(
			"grid-rows-[38px_minmax(0,1fr)]",
		);
		expect(
			within(selectionRegion).getByTestId("selection-timeline-scroll")
				.className,
		).toContain("min-h-0");
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
			<EditorNextRoute
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

		fireEvent.change(screen.getByLabelText("Local video file"), {
			target: {
				files: [new File(["video"], "picked.mp4", { type: "video/mp4" })],
			},
		});

		await waitFor(() => {
			expect(screen.getByLabelText("Export review")).toBeTruthy();
		});

		fireEvent.click(
			screen.getByRole("button", { name: "Start default export" }),
		);

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

		expect(deliverGeneratedMedia).not.toHaveBeenCalled();
		expect(screen.getByText("picked-export.mp4")).toBeTruthy();
		expect(
			within(screen.getByLabelText("Generated media status")).getByRole(
				"button",
				{
					name: "Download generated media",
				},
			),
		).toBeTruthy();
		expect(
			screen.getByLabelText("Generated media filename").className,
		).toContain("whitespace-normal");
		expect(screen.getByLabelText("Export review").className).toContain(
			"overflow-visible",
		);
		expect(screen.getByLabelText("Generated media status").className).toContain(
			"overflow-visible",
		);
		expect(
			screen.getByLabelText("Generated media filename").className,
		).toContain("[overflow-wrap:anywhere]");
		expect(
			screen.getByLabelText("Generated media filename").className,
		).not.toContain("break-all");
		expect(screen.getAllByLabelText(/^Preview for/)).toHaveLength(1);
		expect(screen.queryByRole("button", { name: /use generated/i })).toBeNull();
		expect(progressEvents[0]).toEqual({
			phase: "preparing",
		});

		fireEvent.click(
			screen.getByRole("button", { name: "Download generated media" }),
		);

		expect(deliverGeneratedMedia).toHaveBeenCalledWith({
			blob: generatedBlob,
			generatedMedia: {
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
			},
		});
		await waitFor(() => {
			expect(screen.getByText("Delivered")).toBeTruthy();
		});
	});

	it("asks for confirmation before close and leaves the loaded session unchanged when cancelled", async () => {
		const confirmClose = vi.spyOn(window, "confirm").mockReturnValue(false);

		render(
			<EditorNextRoute
				createAssetId={() => "asset-close-cancelled"}
				createDraftId={() => "draft-close-cancelled"}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => supportedInspection}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Local video file"), {
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

		fireEvent.click(screen.getByRole("button", { name: "Close file" }));

		expect(confirmClose).toHaveBeenCalledTimes(1);
		expect(
			screen.getByLabelText("Preview for close-cancelled.mp4"),
		).toBeTruthy();
		expect(screen.queryByLabelText("Local video file")).toBeNull();
		expect(URL.revokeObjectURL).not.toHaveBeenCalled();
	});

	it("closes a confirmed ready session, disposing preview resources and generated media", async () => {
		const generatedBlob = new Blob(["generated media"], { type: "video/mp4" });
		const deliverGeneratedMedia = vi.fn();
		vi.spyOn(window, "confirm").mockReturnValue(true);

		render(
			<EditorNextRoute
				createAssetId={() => "asset-close-confirmed"}
				createDraftId={() => "draft-close-confirmed"}
				createExportJobId={() => "export-close-confirmed"}
				createGeneratedMediaId={() => "generated-close-confirmed"}
				defaultExportRunner={{
					cancelSupported: true,
					run: vi.fn(() => Promise.resolve({ blob: generatedBlob })),
				}}
				deliverGeneratedMedia={deliverGeneratedMedia}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => supportedInspection}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Local video file"), {
			target: {
				files: [
					new File(["video"], "close-confirmed.mp4", { type: "video/mp4" }),
				],
			},
		});

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: "Start default export" }),
			).toBeTruthy();
		});

		fireEvent.click(
			screen.getByRole("button", { name: "Start default export" }),
		);

		await waitFor(() => {
			expect(screen.getByText("Export complete")).toBeTruthy();
		});

		fireEvent.click(screen.getByRole("button", { name: "Close file" }));

		await waitFor(() => {
			expect(screen.getByText("Waiting for a media asset draft.")).toBeTruthy();
		});

		expect(URL.revokeObjectURL).toHaveBeenCalledWith(
			"blob:editor-next-preview",
		);
		expect(
			screen.queryByLabelText("Preview for close-confirmed.mp4"),
		).toBeNull();
		expect(screen.queryByLabelText("Selection timeline")).toBeNull();
		expect(screen.queryByLabelText("Export review")).toBeNull();
		expect(
			screen.queryByRole("button", { name: "Download generated media" }),
		).toBeNull();
		expect(deliverGeneratedMedia).not.toHaveBeenCalled();
	});

	it("disables close while an export job is running", async () => {
		const exportStarted = createDeferred<{ blob: Blob }>();

		render(
			<EditorNextRoute
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

		fireEvent.change(screen.getByLabelText("Local video file"), {
			target: {
				files: [
					new File(["video"], "close-disabled.mp4", { type: "video/mp4" }),
				],
			},
		});

		await waitFor(() => {
			expect(screen.getByRole("button", { name: "Close file" })).toBeTruthy();
		});

		expect(
			(screen.getByRole("button", { name: "Close file" }) as HTMLButtonElement)
				.disabled,
		).toBe(false);

		fireEvent.click(
			screen.getByRole("button", { name: "Start default export" }),
		);

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
			<EditorNextRoute
				createAssetId={() => "asset-beforeunload"}
				createDraftId={() => "draft-beforeunload"}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => supportedInspection}
			/>,
		);

		expect(dispatchBeforeUnload()).toBe(false);

		fireEvent.change(screen.getByLabelText("Local video file"), {
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

		fireEvent.click(screen.getByRole("button", { name: "Close file" }));

		await waitFor(() => {
			expect(screen.getByText("Waiting for a media asset draft.")).toBeTruthy();
		});

		expect(dispatchBeforeUnload()).toBe(false);
	});

	it("does not persist active session state across a route remount", async () => {
		const { unmount } = render(
			<EditorNextRoute
				createAssetId={() => "asset-remount"}
				createDraftId={() => "draft-remount"}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => supportedInspection}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Local video file"), {
			target: {
				files: [new File(["video"], "remount.mp4", { type: "video/mp4" })],
			},
		});

		await waitFor(() => {
			expect(screen.getByLabelText("Preview for remount.mp4")).toBeTruthy();
		});

		unmount();

		render(
			<EditorNextRoute
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => supportedInspection}
			/>,
		);

		expect(screen.getByText("Waiting for a media asset draft.")).toBeTruthy();
		expect(screen.queryByText("Ready media asset")).toBeNull();
		expect(screen.queryByLabelText("Preview for remount.mp4")).toBeNull();
	});

	it("hides cancellation when the active export runner cannot stop safely", async () => {
		const exportStarted = createDeferred<{ blob: Blob }>();
		const exportRun = vi.fn(() => exportStarted.promise);

		render(
			<EditorNextRoute
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

		fireEvent.change(screen.getByLabelText("Local video file"), {
			target: {
				files: [
					new File(["video"], "uncancellable.mp4", { type: "video/mp4" }),
				],
			},
		});

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: "Start default export" }),
			).toBeTruthy();
		});

		fireEvent.click(
			screen.getByRole("button", { name: "Start default export" }),
		);

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
			<EditorNextRoute
				createAssetId={() => "asset-timeline"}
				createDraftId={() => "draft-timeline"}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => supportedInspection}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Local video file"), {
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
		expect(screen.getAllByText("Language eng").length).toBeGreaterThan(0);
		expect(within(selectionRegion).getByText("Selection and waveform")).toBeTruthy();
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
		expect(screen.getByText("Playhead")).toBeTruthy();
		expect(screen.getAllByText("00:00:06.000").length).toBeGreaterThan(0);
	});

	it("imports a local file from drag and drop into the ready editor state", async () => {
		render(
			<EditorNextRoute
				createAssetId={() => "asset-dropped"}
				createDraftId={() => "draft-dropped"}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => ({
					...supportedInspection,
					audioTracks: [],
				})}
			/>,
		);

		fireEvent.drop(screen.getByTestId("editor-next-drop-zone"), {
			dataTransfer: {
				files: [new File(["video"], "dropped.webm", { type: "video/webm" })],
			},
		});

		await waitFor(() => {
			expect(screen.getByLabelText("Preview for dropped.webm")).toBeTruthy();
		});

		expect(screen.getAllByText("dropped.webm").length).toBeGreaterThan(0);
		expect(screen.queryByLabelText("Local video file")).toBeNull();
		const mediaAssetContext = screen.getByLabelText("Media asset context");
		expect(within(mediaAssetContext).getByText("Tracks")).toBeTruthy();
		expect(within(mediaAssetContext).getByText("No audio tracks")).toBeTruthy();
		expect(within(mediaAssetContext).getByText("none")).toBeTruthy();
	});

	it("shows unsupported-media failures with technical details on demand", async () => {
		render(
			<EditorNextRoute
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

		fireEvent.change(screen.getByLabelText("Local video file"), {
			target: {
				files: [new File(["audio"], "audio-only.mp4", { type: "video/mp4" })],
			},
		});

		await waitFor(() => {
			expect(screen.getByRole("alert").textContent).toContain("Audio-only");
		});

		expect(screen.getByText("Media asset analysis failed")).toBeTruthy();
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
	defaultProfileExportable: true,
	durationUs: 12_000_000,
	frameTiming: {
		fps: 30,
		frameDurationUs: 33_333,
		source: "known",
	},
	previewable: true,
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
