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
	type ExportProgress,
	type GeneratedMedia,
	type ReadyMediaAsset,
	type Selection,
} from "@/editor-core/model";
import { evaluateRuntimeSupport } from "@/editor-core/runtime-capabilities";
import type { ExportSessionState } from "@/editor-core/session";
import { ExportInspectorPanel } from "./export-inspector";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("ExportInspectorPanel", () => {
	it("renders supported export review, requirements, and start action", () => {
		const onStartExport = vi.fn();

		render(
			<ExportInspectorPanel
				asset={readyAsset}
				exportState={{ status: "reviewing" }}
				onCancelExport={() => undefined}
				onDownloadGeneratedMedia={() => undefined}
				onStartExport={onStartExport}
				runtime={supportedRuntime}
				selection={fullSelection}
			/>,
		);

		const exportInspector = screen.getByLabelText("Export inspector");
		expect(exportInspector.className).toContain("bg-workbench-inspector");
		expect(screen.getByLabelText("Export review").className).toContain(
			"overflow-visible",
		);
		expect(within(exportInspector).getByText("Output")).toBeTruthy();
		expect(within(exportInspector).queryByText("Current settings")).toBeNull();
		expect(within(exportInspector).getByText("Requirements")).toBeTruthy();
		expect(within(exportInspector).getByText("MP4 export")).toBeTruthy();
		expect(within(exportInspector).getByText("Browser APIs")).toBeTruthy();
		expect(within(exportInspector).queryByText("Selected range")).toBeNull();
		expect(within(exportInspector).getByText("Format")).toBeTruthy();
		expect(
			within(exportInspector).getByText("MP4 / H.264 video / AAC audio"),
		).toBeTruthy();
		expect(
			within(exportInspector).getAllByText("Export").length,
		).toBeGreaterThan(0);
		expect(within(exportInspector).getByText("Whole file export")).toBeTruthy();
		expect(within(exportInspector).getByText("Range")).toBeTruthy();
		expect(
			within(exportInspector).getAllByText("Whole file").length,
		).toBeGreaterThan(0);
		expect(screen.queryByLabelText("Export strategy")).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "Start export" }));
		expect(onStartExport).toHaveBeenCalledTimes(1);
	});

	it("renders blocked export review with a disabled start action", () => {
		render(
			<ExportInspectorPanel
				asset={{
					...readyAsset,
					exportCapability: {
						profile: DEFAULT_OUTPUT_PROFILE,
						reason: "The browser cannot encode this source.",
						supported: false,
						technicalDetails: "VideoEncoder rejected the source.",
					},
				}}
				exportState={{ status: "reviewing" }}
				onCancelExport={() => undefined}
				onDownloadGeneratedMedia={() => undefined}
				onStartExport={() => undefined}
				runtime={supportedRuntime}
				selection={fullSelection}
			/>,
		);

		const exportInspector = screen.getByLabelText("Export inspector");
		expect(within(exportInspector).getAllByText("Blocked").length).toBe(2);
		expect(within(exportInspector).getByText("MP4 export")).toBeTruthy();
		expect(
			within(exportInspector).getByText(
				"The default output profile is unavailable for this media asset, and editor-next does not silently fall back to another output format.",
			),
		).toBeTruthy();
		expect(
			(
				screen.getByRole("button", {
					name: "Start export",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
	});

	it("renders running export progress and cancel action when cancellation is supported", () => {
		const onCancelExport = vi.fn();

		render(
			<ExportInspectorPanel
				asset={readyAsset}
				exportState={runningExport({
					cancelSupported: true,
					progress: {
						completedRatio: 0.42,
						phase: "encoding",
					},
				})}
				onCancelExport={onCancelExport}
				onDownloadGeneratedMedia={() => undefined}
				onStartExport={() => undefined}
				runtime={supportedRuntime}
				selection={fullSelection}
			/>,
		);

		expect(screen.getByText("Encoding")).toBeTruthy();
		expect(screen.getByText("export-job")).toBeTruthy();
		expect(screen.getByLabelText("Export progress")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Cancel export" }));
		expect(onCancelExport).toHaveBeenCalledTimes(1);
	});

	it("hides cancel action when a running export cannot stop safely", () => {
		render(
			<ExportInspectorPanel
				asset={readyAsset}
				exportState={runningExport({
					cancelSupported: false,
					progress: {
						phase: "preparing",
					},
				})}
				onCancelExport={() => undefined}
				onDownloadGeneratedMedia={() => undefined}
				onStartExport={() => undefined}
				runtime={supportedRuntime}
				selection={fullSelection}
			/>,
		);

		expect(screen.getByText("Preparing")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Cancel export" })).toBeNull();
		expect(screen.getByText("Cancellation unavailable")).toBeTruthy();
	});

	it("renders generated media status and forwards explicit delivery action", () => {
		const onDownloadGeneratedMedia = vi.fn();

		render(
			<ExportInspectorPanel
				asset={readyAsset}
				exportState={{
					delivered: false,
					generatedMedia,
					job: exportJob({ cancelSupported: true }),
					status: "succeeded",
				}}
				onCancelExport={() => undefined}
				onDownloadGeneratedMedia={onDownloadGeneratedMedia}
				onStartExport={() => undefined}
				runtime={supportedRuntime}
				selection={fullSelection}
			/>,
		);

		expect(screen.getByText("Export complete")).toBeTruthy();
		expect(screen.getByText("Ready to download")).toBeTruthy();
		expect(screen.getByText("recording-export.mp4")).toBeTruthy();
		expect(
			within(screen.getByLabelText("Generated media status")).getByRole(
				"button",
				{
					name: "Download export",
				},
			),
		).toBeTruthy();
		expect(screen.getByLabelText("Generated media status").className).toContain(
			"overflow-visible",
		);
		expect(
			screen.getByLabelText("Generated media filename").className,
		).toContain("whitespace-normal");
		expect(
			screen.getByLabelText("Generated media filename").className,
		).toContain("[overflow-wrap:anywhere]");
		expect(
			screen.getByLabelText("Generated media filename").className,
		).not.toContain("break-all");

		fireEvent.click(screen.getByRole("button", { name: "Download export" }));
		expect(onDownloadGeneratedMedia).toHaveBeenCalledWith(generatedMedia);
	});

	it("renders delivered, failed, and cancelled export states", () => {
		const { rerender } = render(
			<ExportInspectorPanel
				asset={readyAsset}
				exportState={{
					delivered: true,
					generatedMedia,
					job: exportJob({ cancelSupported: true }),
					status: "succeeded",
				}}
				onCancelExport={() => undefined}
				onDownloadGeneratedMedia={() => undefined}
				onStartExport={() => undefined}
				runtime={supportedRuntime}
				selection={fullSelection}
			/>,
		);

		expect(screen.getByText("Delivered")).toBeTruthy();

		rerender(
			<ExportInspectorPanel
				asset={readyAsset}
				exportState={{
					job: exportJob({ cancelSupported: true }),
					message: "Default export failed.",
					status: "failed",
					technicalDetails: "Encoder rejected the source video.",
				}}
				onCancelExport={() => undefined}
				onDownloadGeneratedMedia={() => undefined}
				onStartExport={() => undefined}
				runtime={supportedRuntime}
				selection={fullSelection}
			/>,
		);

		expect(screen.getByText("Default export failed.")).toBeTruthy();
		expect(screen.getByText("Technical details")).toBeTruthy();

		rerender(
			<ExportInspectorPanel
				asset={readyAsset}
				exportState={{
					job: exportJob({ cancelSupported: true }),
					status: "cancelled",
				}}
				onCancelExport={() => undefined}
				onDownloadGeneratedMedia={() => undefined}
				onStartExport={() => undefined}
				runtime={supportedRuntime}
				selection={fullSelection}
			/>,
		);

		expect(screen.getByText("Export cancelled.")).toBeTruthy();
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
	id: "asset-export",
	label: "recording.mp4",
	provenance: {
		fileName: "recording.mp4",
		mimeType: "video/mp4",
		sizeBytes: 4_718_592,
	},
	tracks: {
		audio: [
			{
				channels: 2,
				codec: "aac",
				id: "audio-main",
				kind: "audio",
				label: "Voice",
				language: "eng",
				sampleRate: 48_000,
			},
		],
		video: [
			{
				codec: "h264",
				height: 1080,
				id: "video-main",
				kind: "video",
				label: "Main",
				width: 1920,
			},
		],
	},
} satisfies ReadyMediaAsset;

const fullSelection = {
	endUs: 12_000_000,
	startUs: 0,
} satisfies Selection;

const generatedMedia = {
	assetId: "asset-export",
	createdAtMs: 1_717_171_717,
	fileName: "recording-export.mp4",
	id: "generated-export",
	mimeType: "video/mp4",
	profile: DEFAULT_OUTPUT_PROFILE,
	selection: fullSelection,
	sizeBytes: 123,
} satisfies GeneratedMedia;

function runningExport({
	cancelSupported,
	progress,
}: {
	cancelSupported: boolean;
	progress: ExportProgress;
}): Extract<ExportSessionState, { status: "running" }> {
	return {
		job: exportJob({ cancelSupported, progress }),
		status: "running",
	};
}

function exportJob({
	cancelSupported,
	progress = {
		phase: "preparing",
	},
}: {
	cancelSupported: boolean;
	progress?: ExportProgress;
}): Extract<ExportSessionState, { status: "running" }>["job"] {
	return {
		cancelSupported,
		id: "export-job",
		progress,
		snapshot: {
			asset: readyAsset,
			audioMix: createDefaultAudioMix(readyAsset),
			review: {
				method: {
					key: "fast",
					label: "Whole file export",
				},
				plannedOutput: {
					audioCodec: "aac",
					container: "mp4",
					label: "MP4 / H.264 video / AAC audio",
					videoCodec: "h264",
				},
				precision: {
					key: "full-asset",
					label: "Whole file",
				},
				profile: DEFAULT_OUTPUT_PROFILE,
				reason:
					"The current selection covers the full asset, so export can use the default output profile without boundary trimming.",
				supported: true,
			},
			selection: fullSelection,
		},
	};
}
