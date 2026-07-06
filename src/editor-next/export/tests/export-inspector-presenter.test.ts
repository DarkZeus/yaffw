import { describe, expect, it } from "vitest";

import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import {
	DEFAULT_OUTPUT_PROFILE,
	type ExportProgress,
	type ReadyMediaAsset,
	type Selection,
	createDefaultOutputSettings,
} from "@/editor-core/model";
import { evaluateRuntimeSupport } from "@/editor-core/runtime-capabilities";
import type { ExportSessionState } from "@/editor-core/session";

import { createExportInspectorViewModel } from "../inspector/export-inspector-presenter";

describe("export inspector presenter", () => {
	it("derives a supported export review with a start action", () => {
		const viewModel = createExportInspectorViewModel({
			asset: readyAsset,
			exportState: {
				status: "reviewing",
			},
			runtime: supportedRuntime,
			selection: fullSelection,
		});

		expect(viewModel.badge).toEqual({
			label: "Ready",
			tone: "ready",
		});
		expect(viewModel.capability).toEqual({
			label: "Export capability",
			tone: "ready",
			value: "Ready",
		});
		expect(viewModel.runtimeChecks).toEqual([
			{ available: true, label: "Video decoder", status: "Ready" },
			{ available: true, label: "Video encoder", status: "Ready" },
			{ available: true, label: "Media source", status: "Ready" },
			{ available: true, label: "Local file APIs", status: "Ready" },
		]);
		expect(viewModel.review).toEqual({
			method: { label: "Export", value: "Whole file export" },
			plannedOutput: {
				label: "Format",
				value: "MP4 / H.264 video / AAC audio",
			},
			precision: { label: "Range", value: "Whole file" },
			reason:
				"The current selection covers the full asset, so export can use the default output profile without boundary trimming.",
			supported: true,
		});
		expect(viewModel.status).toEqual({
			kind: "idle",
		});
		expect(viewModel.action).toEqual({
			disabled: false,
			kind: "start",
			label: "Start export",
		});
	});

	it("derives a blocked review for impossible selections", () => {
		const viewModel = createExportInspectorViewModel({
			asset: readyAsset,
			exportState: {
				status: "reviewing",
			},
			runtime: supportedRuntime,
			selection: invalidSelection,
		});

		expect(viewModel.badge).toEqual({
			label: "Blocked",
			tone: "blocked",
		});
		expect(viewModel.capability).toEqual({
			label: "Export capability",
			tone: "blocked",
			value: "Blocked",
		});
		expect(viewModel.review).toEqual({
			plannedOutput: {
				label: "Format",
				value: "MP4 / H.264 video / AAC audio",
			},
			reason: "The current selection is outside the active media asset.",
			supported: false,
			technicalDetails: `Expected selection inside [0, ${readyAsset.durationUs}], got [${invalidSelection.startUs}, ${invalidSelection.endUs}].`,
		});
		expect(viewModel.action).toEqual({
			disabled: true,
			kind: "start",
			label: "Start export",
		});
	});

	it("derives running progress and cancellation availability", () => {
		const cancellable = createExportInspectorViewModel({
			asset: readyAsset,
			exportState: runningExport({
				cancelSupported: true,
				progress: {
					completedRatio: 0.42,
					phase: "encoding",
				},
			}),
			runtime: supportedRuntime,
			selection: fullSelection,
		});

		expect(cancellable.status).toEqual({
			cancelUnavailableMessage: undefined,
			jobId: "export-job",
			kind: "running",
			progressPercent: 42,
			title: "Encoding",
		});
		expect(cancellable.action).toEqual({
			disabled: false,
			kind: "cancel",
			label: "Cancel export",
		});

		const uncancellable = createExportInspectorViewModel({
			asset: readyAsset,
			exportState: runningExport({
				cancelSupported: false,
				progress: {
					phase: "preparing",
				},
			}),
			runtime: supportedRuntime,
			selection: fullSelection,
		});

		expect(uncancellable.status).toEqual({
			cancelUnavailableMessage: "Cancellation unavailable",
			jobId: "export-job",
			kind: "running",
			progressPercent: 5,
			title: "Preparing",
		});
		expect(uncancellable.action).toEqual({
			kind: "none",
		});
	});

	it("derives failed export state with retry available", () => {
		const viewModel = createExportInspectorViewModel({
			asset: readyAsset,
			exportState: {
				job: exportJob({ cancelSupported: true }),
				message: "Default export failed.",
				status: "failed",
				technicalDetails: "Encoder rejected the source video.",
			},
			runtime: supportedRuntime,
			selection: fullSelection,
		});

		expect(viewModel.status).toEqual({
			kind: "failed",
			message: "Default export failed.",
			technicalDetails: "Encoder rejected the source video.",
		});
		expect(viewModel.action).toEqual({
			disabled: false,
			kind: "start",
			label: "Start export",
		});
	});

	it("derives succeeded, delivered, and explicit delivery action states", () => {
		const succeeded = createExportInspectorViewModel({
			asset: readyAsset,
			exportState: {
				delivered: false,
				generatedMedia,
				job: exportJob({ cancelSupported: true }),
				status: "succeeded",
			},
			runtime: supportedRuntime,
			selection: fullSelection,
		});

		expect(succeeded.status).toEqual({
			deliveryState: "Ready to download",
			fileName: "recording-export.mp4",
			kind: "succeeded",
			title: "Export complete",
		});
		expect(succeeded.action).toEqual({
			disabled: false,
			generatedMedia,
			kind: "download",
			label: "Download export",
		});

		const delivered = createExportInspectorViewModel({
			asset: readyAsset,
			exportState: {
				delivered: true,
				generatedMedia,
				job: exportJob({ cancelSupported: true }),
				status: "succeeded",
			},
			runtime: supportedRuntime,
			selection: fullSelection,
		});

		expect(delivered.status).toEqual({
			deliveryState: "Delivered",
			fileName: "recording-export.mp4",
			kind: "succeeded",
			title: "Export complete",
		});
		expect(delivered.action).toEqual({
			disabled: false,
			generatedMedia,
			kind: "download",
			label: "Download export",
		});
	});

	it("derives cancelled export state with retry available", () => {
		const viewModel = createExportInspectorViewModel({
			asset: readyAsset,
			exportState: {
				job: exportJob({ cancelSupported: true }),
				status: "cancelled",
			},
			runtime: supportedRuntime,
			selection: fullSelection,
		});

		expect(viewModel.status).toEqual({
			kind: "cancelled",
			message: "Export cancelled.",
		});
		expect(viewModel.action).toEqual({
			disabled: false,
			kind: "start",
			label: "Start export",
		});
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
		sizeBytes: 5_000_000,
	},
	tracks: {
		audio: [
			{
				channels: 2,
				codec: "aac",
				id: "audio-1",
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
				id: "video-1",
				kind: "video",
				label: "Screen",
				width: 1920,
			},
		],
	},
} satisfies ReadyMediaAsset;

const fullSelection = {
	endUs: 12_000_000,
	startUs: 0,
} satisfies Selection;

const invalidSelection = {
	endUs: 12_000_001,
	startUs: 1_000_000,
} satisfies Selection;

const generatedMedia = {
	assetId: "asset-export",
	createdAtMs: 1_717_171_717,
	fileName: "recording-export.mp4",
	id: "generated-export",
	mimeType: "video/mp4",
	profile: DEFAULT_OUTPUT_PROFILE,
	selection: fullSelection,
	sizeBytes: 15,
};

function runningExport({
	cancelSupported,
	progress,
}: {
	cancelSupported: boolean;
	progress: ExportProgress;
}): ExportSessionState {
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
			outputSettings: createDefaultOutputSettings(),
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
