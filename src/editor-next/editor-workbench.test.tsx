/* @vitest-environment jsdom */

import {
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
} from "@/editor-core/model";
import { evaluateRuntimeSupport } from "@/editor-core/runtime-capabilities";
import type { EditorSessionState } from "@/editor-core/session";
import {
	EditorSessionShell,
	EditorWorkbenchFrame,
	UnsupportedRuntimeState,
} from "./editor-workbench";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("Editor workbench", () => {
	it("renders the workbench top bar, active asset summary, and non-interactive rail", () => {
		render(
			<EditorWorkbenchFrame
				activeAsset={readyAsset}
				runtime={supportedRuntime}
				status="ready"
			>
				<div>Workbench child</div>
			</EditorWorkbenchFrame>,
		);

		expect(screen.getByText("YAFFW")).toBeTruthy();
		expect(screen.getByText("Editor workbench")).toBeTruthy();
		expect(screen.getByLabelText("Editor workbench top bar")).toBeTruthy();
		expect(screen.getByText("WebCodecs")).toBeTruthy();

		const topBarAssetSummary = screen.getByLabelText(
			"Top bar media asset summary",
		);
		expect(topBarAssetSummary.textContent).not.toContain("recording.mp4");
		expect(topBarAssetSummary.textContent).toContain("1920 x 1080");
		expect(topBarAssetSummary.textContent).toContain("30 fps");

		const rail = screen.getByLabelText("Editor workbench rail");
		expect(rail).toBeTruthy();
		expect(rail.tagName).toBe("ASIDE");
		expect(rail.parentElement?.className).toContain(
			"grid-cols-[4rem_minmax(0,1fr)]",
		);
		expect(within(rail).queryAllByRole("button")).toHaveLength(0);
		expect(within(rail).queryAllByRole("link")).toHaveLength(0);
		expect(
			screen.queryByRole("navigation", { name: "Editor workbench rail" }),
		).toBeNull();
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
			<EditorWorkbenchFrame
				activeAsset={null}
				runtime={unsupportedRuntime}
				status="unsupported-runtime"
			>
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
		expect(screen.queryByLabelText("Local video file")).toBeNull();
		expect(screen.queryByLabelText("Workbench media asset region")).toBeNull();
		expect(screen.queryByLabelText("Workbench inspector region")).toBeNull();
	});

	it("renders non-ready import shell and forwards file events", () => {
		const handleLocalFileDropped = vi.fn((event) => event.preventDefault());
		const handleLocalFileSelected = vi.fn();

		render(
			<EditorSessionShell
				exportInspector={null}
				localFileInputKey={0}
				mediaAssetContext={null}
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
		expect(screen.getByText("No media asset loaded")).toBeTruthy();
		expect(screen.getByText("Waiting for a media asset draft.")).toBeTruthy();
		expect(screen.getByLabelText("Local video file")).toBeTruthy();
		expect(screen.getByTestId("editor-next-drop-zone")).toBeTruthy();
		expect(screen.queryByLabelText("Workbench media asset region")).toBeNull();
		expect(screen.queryByLabelText("Workbench inspector region")).toBeNull();

		fireEvent.change(screen.getByLabelText("Local video file"), {
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

	it("renders loading state with disabled import controls", () => {
		render(
			<EditorSessionShell
				exportInspector={null}
				localFileInputKey={0}
				mediaAssetContext={null}
				onLocalFileDropped={() => undefined}
				onLocalFileSelected={() => undefined}
				previewPlayer={null}
				session={loadingSession}
			/>,
		);

		expect(screen.getByText("Analyzing media asset draft")).toBeTruthy();
		expect(
			screen.getByText("Preparing media asset draft loading.mp4."),
		).toBeTruthy();
		expect(
			(screen.getByLabelText("Local video file") as HTMLInputElement).disabled,
		).toBe(true);
	});

	it("places ready-state media, preview, and inspector slots in workbench regions", () => {
		render(
			<EditorSessionShell
				exportInspector={
					<section aria-label="Export inspector">Export inspector slot</section>
				}
				localFileInputKey={0}
				mediaAssetContext={
					<section aria-label="Media asset context">Media asset slot</section>
				}
				onLocalFileDropped={() => undefined}
				onLocalFileSelected={() => undefined}
				previewPlayer={
					<section aria-label="Preview slot">Preview slot</section>
				}
				session={readySession}
			/>,
		);

		const readyWorkbench = screen.getByLabelText("Editor workbench session");
		expect(readyWorkbench.className).toContain("grid-cols-1");
		expect(readyWorkbench.className).toContain("xl:h-full");
		expect(readyWorkbench.className).toContain(
			"xl:grid-cols-[16.25rem_minmax(30rem,1fr)_19.75rem]",
		);
		expect(readyWorkbench.className).toContain(
			"xl:grid-rows-[minmax(0,1fr)_2.75rem_38%]",
		);
		expect(readyWorkbench.className).toContain("xl:gap-0");
		expect(readyWorkbench.className).toContain("xl:overflow-hidden");

		const mediaAssetRegion = screen.getByLabelText(
			"Workbench media asset region",
		);
		expect(mediaAssetRegion.className).toContain("overflow-x-hidden");
		expect(mediaAssetRegion.className).toContain("xl:col-start-1");
		expect(mediaAssetRegion.className).toContain("xl:row-start-1");
		expect(mediaAssetRegion.className).toContain("xl:overflow-y-auto");
		expect(mediaAssetRegion.className).toContain("xl:border-r");
		expect(mediaAssetRegion.className).toContain("overscroll-contain");
		expect(mediaAssetRegion.className).toContain("xl:[contain:layout_paint]");
		expect(
			within(mediaAssetRegion).getByLabelText("Media asset context"),
		).toBeTruthy();

		const inspectorRegion = screen.getByLabelText("Workbench inspector region");
		expect(inspectorRegion.className).toContain("overflow-x-hidden");
		expect(inspectorRegion.className).toContain("xl:col-start-3");
		expect(inspectorRegion.className).toContain("xl:row-start-1");
		expect(inspectorRegion.className).toContain("xl:overflow-y-auto");
		expect(inspectorRegion.className).toContain("xl:border-l");
		expect(inspectorRegion.className).toContain("overscroll-contain");
		expect(inspectorRegion.className).toContain("xl:[contain:layout_paint]");
		expect(
			within(inspectorRegion).getByLabelText("Export inspector"),
		).toBeTruthy();

		expect(screen.getByLabelText("Preview slot")).toBeTruthy();
		expect(screen.queryByLabelText("Local video file")).toBeNull();
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
