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
			audioMix: defaultAudioMix,
			exportState: {
				status: "reviewing",
			},
			outputSettings: createDefaultOutputSettings(),
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
			audioMix: {
				label: "Generated audio mix",
				value: "1 included source track to one AAC audio track",
			},
			audioQuality: {
				label: "Audio quality",
				value: "Preserve source",
			},
			method: { label: "Export", value: "Whole file export" },
			plannedOutput: {
				label: "Format",
				value: "MP4 / H.264 video / AAC audio",
			},
			precision: { label: "Range", value: "Whole file" },
			reason:
				"The current selection covers the full asset, so export can use the default output profile without boundary trimming.",
			resolution: { label: "Resolution", value: "1920x1080" },
			supported: true,
			videoQuality: {
				label: "Video quality",
				value: "Preserve source",
			},
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

	it("shows no output audio track when every source audio track is excluded", () => {
		const audioMix = createDefaultAudioMix(readyAsset);
		audioMix.tracks["audio-1"].include = false;

		const viewModel = createExportInspectorViewModel({
			asset: readyAsset,
			audioMix,
			exportState: { status: "reviewing" },
			outputSettings: createDefaultOutputSettings(),
			runtime: supportedRuntime,
			selection: fullSelection,
		});

		expect(viewModel.review.plannedOutput.value).toBe(
			"MP4 / H.264 video / No audio",
		);
		expect(viewModel.review.audioMix).toEqual({
			label: "Generated audio mix",
			value: "No audio track",
		});
	});

	it("reflects the resolved container and video codec in Export review", () => {
		const outputSettings = createDefaultOutputSettings();
		outputSettings.container = {
			container: "webm",
			kind: "documented-container",
		};
		outputSettings.videoCodec = {
			codec: "vp9",
			kind: "documented-codec",
		};
		outputSettings.audioCodec = { kind: "preserve-source" };

		const viewModel = createExportInspectorViewModel({
			asset: readyAsset,
			audioMix: createDefaultAudioMix(readyAsset),
			exportState: { status: "reviewing" },
			outputSettings,
			runtime: supportedRuntime,
			selection: fullSelection,
		});

		expect(viewModel.review.plannedOutput).toEqual({
			label: "Format",
			value: "WebM / VP9 video / OPUS audio",
		});
		expect(viewModel.review.audioMix).toEqual({
			label: "Generated audio mix",
			value: "1 included source track to one OPUS audio track",
		});
	});

	it("reflects the resolved downscale in Export review", () => {
		const outputSettings = createDefaultOutputSettings();
		outputSettings.resolution = {
			height: 720,
			kind: "target-dimensions",
			width: 1280,
		};

		const viewModel = createExportInspectorViewModel({
			asset: readyAsset,
			audioMix: defaultAudioMix,
			exportState: { status: "reviewing" },
			outputSettings,
			runtime: supportedRuntime,
			selection: fullSelection,
		});

		expect(viewModel.review.resolution).toEqual({
			label: "Resolution",
			value: "1280x720",
		});
	});

	it("derives a blocked review for impossible selections", () => {
		const viewModel = createExportInspectorViewModel({
			asset: readyAsset,
			audioMix: defaultAudioMix,
			exportState: {
				status: "reviewing",
			},
			outputSettings: createDefaultOutputSettings(),
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
			audioMix: {
				label: "Generated audio mix",
				value: "1 included source track to one AAC audio track",
			},
			audioQuality: {
				label: "Audio quality",
				value: "Preserve source",
			},
			plannedOutput: {
				label: "Format",
				value: "MP4 / H.264 video / AAC audio",
			},
			reason: "The current selection is outside the active media asset.",
			resolution: { label: "Resolution", value: "1920x1080" },
			supported: false,
			technicalDetails: `Expected selection inside [0, ${readyAsset.durationUs}], got [${invalidSelection.startUs}, ${invalidSelection.endUs}].`,
			videoQuality: {
				label: "Video quality",
				value: "Preserve source",
			},
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
			audioMix: defaultAudioMix,
			exportState: runningExport({
				cancelSupported: true,
				progress: {
					completedRatio: 0.42,
					phase: "encoding",
				},
			}),
			outputSettings: createDefaultOutputSettings(),
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
			audioMix: defaultAudioMix,
			exportState: runningExport({
				cancelSupported: false,
				progress: {
					phase: "preparing",
				},
			}),
			outputSettings: createDefaultOutputSettings(),
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
			audioMix: defaultAudioMix,
			exportState: {
				job: exportJob({ cancelSupported: true }),
				message: "Default export failed.",
				status: "failed",
				technicalDetails: "Encoder rejected the source video.",
			},
			outputSettings: createDefaultOutputSettings(),
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
			audioMix: defaultAudioMix,
			exportState: {
				delivered: false,
				generatedMedia,
				job: exportJob({ cancelSupported: true }),
				status: "succeeded",
			},
			outputSettings: createDefaultOutputSettings(),
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
			audioMix: defaultAudioMix,
			exportState: {
				delivered: true,
				generatedMedia,
				job: exportJob({ cancelSupported: true }),
				status: "succeeded",
			},
			outputSettings: createDefaultOutputSettings(),
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
			audioMix: defaultAudioMix,
			exportState: {
				job: exportJob({ cancelSupported: true }),
				status: "cancelled",
			},
			outputSettings: createDefaultOutputSettings(),
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

const defaultAudioMix = createDefaultAudioMix(readyAsset);

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
