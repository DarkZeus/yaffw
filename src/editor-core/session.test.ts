import { describe, expect, it } from "vitest";

import { planDefaultExportCapability } from "./export-capability";
import type {
	GeneratedMedia,
	MediaAssetDraft,
	OutputSettings,
	ReadyMediaAsset,
	Selection,
} from "./model";
import { createDefaultOutputSettings } from "./model";
import { resolveOutputPlan } from "./output-settings";
import { evaluateRuntimeSupport } from "./runtime-capabilities";
import {
	canChangeEditingDecisions,
	canCloseEditorSession,
	createInitialEditorSession,
	editorSessionReducer,
} from "./session";

describe("editor-next session runtime gate", () => {
	it("moves a supported session through loading, ready asset, failure, and confirmed close back to empty", () => {
		const runtime = evaluateRuntimeSupport({
			fileApi: true,
			mediaSource: true,
			objectUrl: true,
			videoDecoder: true,
			videoEncoder: true,
		});
		const empty = createInitialEditorSession(runtime);

		expect(empty.status).toBe("empty");
		expect(empty.importEnabled).toBe(true);

		const loading = editorSessionReducer(empty, {
			draft: localDraft,
			type: "import.started",
		});

		expect(loading.status).toBe("loading");
		if (loading.status !== "loading") {
			throw new Error(`Expected loading, got ${loading.status}`);
		}

		expect(loading.importEnabled).toBe(false);
		expect(loading.draft.label).toBe("clip.mp4");

		const ready = editorSessionReducer(loading, {
			asset: readyAsset,
			selection: defaultSelection,
			type: "asset.ready",
		});

		expect(ready.status).toBe("ready");
		if (ready.status !== "ready") {
			throw new Error(`Expected ready, got ${ready.status}`);
		}

		expect(ready.asset).toBe(readyAsset);
		expect(ready.selection).toBe(defaultSelection);

		const failed = editorSessionReducer(loading, {
			message: "The media asset could not be analyzed.",
			technicalDetails: "No readable duration was found.",
			type: "session.failed",
		});

		expect(failed.status).toBe("failure");
		if (failed.status !== "failure") {
			throw new Error(`Expected failure, got ${failed.status}`);
		}

		expect(failed.message).toBe("The media asset could not be analyzed.");
		expect(failed.technicalDetails).toBe("No readable duration was found.");

		const retryLoading = editorSessionReducer(failed, {
			draft: localDraft,
			type: "import.started",
		});

		expect(retryLoading.status).toBe("loading");
		if (retryLoading.status !== "loading") {
			throw new Error(`Expected loading, got ${retryLoading.status}`);
		}

		expect(retryLoading.draft).toBe(localDraft);

		const closed = editorSessionReducer(ready, { type: "session.closed" });

		expect(closed.status).toBe("empty");
		expect(closed.importEnabled).toBe(true);
	});

	it("sets selection boundaries from explicit playhead events without storing playhead state", () => {
		const runtime = evaluateRuntimeSupport({
			fileApi: true,
			mediaSource: true,
			objectUrl: true,
			videoDecoder: true,
			videoEncoder: true,
		});
		const ready = editorSessionReducer(
			editorSessionReducer(createInitialEditorSession(runtime), {
				draft: localDraft,
				type: "import.started",
			}),
			{
				asset: readyAsset,
				selection: {
					endUs: 800_000,
					startUs: 200_000,
				},
				type: "asset.ready",
			},
		);

		expect(ready.status).toBe("ready");
		if (ready.status !== "ready") {
			throw new Error(`Expected ready, got ${ready.status}`);
		}

		const startFromPlayhead = editorSessionReducer(ready, {
			playheadUs: 790_000,
			type: "selection.start.setFromPlayhead",
		});

		expect(startFromPlayhead.status).toBe("ready");
		if (startFromPlayhead.status !== "ready") {
			throw new Error(`Expected ready, got ${startFromPlayhead.status}`);
		}

		expect(startFromPlayhead.selection).toEqual({
			endUs: 823_333,
			startUs: 790_000,
		});
		expect("playheadUs" in startFromPlayhead).toBe(false);

		const endFromPlayhead = editorSessionReducer(startFromPlayhead, {
			playheadUs: 0,
			type: "selection.end.setFromPlayhead",
		});

		expect(endFromPlayhead.status).toBe("ready");
		if (endFromPlayhead.status !== "ready") {
			throw new Error(`Expected ready, got ${endFromPlayhead.status}`);
		}

		expect(endFromPlayhead.selection).toEqual({
			endUs: 33_333,
			startUs: 0,
		});
		expect("playheadUs" in endFromPlayhead).toBe(false);
	});

	it("preserves a measured non-30 estimated frame as the minimum selection duration", () => {
		const ready = createReadySession({ startUs: 200_000, endUs: 800_000 });
		if (ready.status !== "ready") throw new Error("Expected ready session");
		const estimated = {
			...ready,
			asset: {
				...ready.asset,
				frameTiming: {
					analysis: {
						averageFrameRate: 22,
						frameRateIsConstant: false,
						maxFrameRate: 40,
						medianFrameRate: 23.5,
						minFrameRate: 12,
						probedPacketCount: 256,
						underlyingFrameRate: null,
					},
					fps: 23.5,
					frameDurationUs: 42_553,
					reason: "No consistent underlying frame rate was detected.",
					source: "estimated" as const,
				},
			},
		};
		const start = editorSessionReducer(estimated, {
			playheadUs: 790_000,
			type: "selection.start.setFromPlayhead",
		});
		expect(start.status).toBe("ready");
		if (start.status !== "ready") throw new Error("Expected ready session");
		expect(start.selection).toEqual({ startUs: 790_000, endUs: 832_553 });
		const end = editorSessionReducer(start, {
			playheadUs: 0,
			type: "selection.end.setFromPlayhead",
		});
		expect(end.status).toBe("ready");
		if (end.status !== "ready") throw new Error("Expected ready session");
		expect(end.selection).toEqual({ startUs: 0, endUs: 42_553 });
		const replacement = editorSessionReducer(estimated, {
			selection: { startUs: 0, endUs: 1 },
			type: "selection.replaced",
		});
		expect(replacement.status).toBe("ready");
		if (replacement.status !== "ready")
			throw new Error("Expected ready session");
		expect(replacement.selection).toEqual({ startUs: 0, endUs: 42_553 });
	});

	it("moves and resets the committed selection without introducing preview state", () => {
		const runtime = evaluateRuntimeSupport({
			fileApi: true,
			mediaSource: true,
			objectUrl: true,
			videoDecoder: true,
			videoEncoder: true,
		});
		const ready = editorSessionReducer(
			editorSessionReducer(createInitialEditorSession(runtime), {
				draft: localDraft,
				type: "import.started",
			}),
			{
				asset: readyAsset,
				selection: {
					endUs: 600_000,
					startUs: 200_000,
				},
				type: "asset.ready",
			},
		);

		expect(ready.status).toBe("ready");
		if (ready.status !== "ready") {
			throw new Error(`Expected ready, got ${ready.status}`);
		}

		const moved = editorSessionReducer(ready, {
			deltaUs: 700_000,
			type: "selection.range.moved",
		});

		expect(moved.status).toBe("ready");
		if (moved.status !== "ready") {
			throw new Error(`Expected ready, got ${moved.status}`);
		}

		expect(moved.selection).toEqual({
			endUs: 1_000_000,
			startUs: 600_000,
		});
		expect("playheadUs" in moved).toBe(false);

		const reset = editorSessionReducer(moved, { type: "selection.reset" });

		expect(reset.status).toBe("ready");
		if (reset.status !== "ready") {
			throw new Error(`Expected ready, got ${reset.status}`);
		}

		expect(reset.selection).toEqual({
			endUs: 1_000_000,
			startUs: 0,
		});
		expect("playheadUs" in reset).toBe(false);
	});

	it("replaces the committed selection atomically for chapter jumps", () => {
		const ready = createReadySession({
			endUs: 500_000,
			startUs: 100_000,
		});

		const replaced = editorSessionReducer(ready, {
			selection: {
				endUs: 900_000,
				startUs: 700_000,
			},
			type: "selection.replaced",
		});

		expect(replaced.status).toBe("ready");
		if (replaced.status !== "ready") {
			throw new Error(`Expected ready, got ${replaced.status}`);
		}

		expect(replaced.selection).toEqual({
			endUs: 900_000,
			startUs: 700_000,
		});
		expect("playheadUs" in replaced).toBe(false);
	});

	it("starts an export from a valid review and locks editing decisions until it settles", () => {
		const ready = createReadySession({
			endUs: 800_000,
			startUs: 200_000,
		});

		const exporting = editorSessionReducer(ready, {
			cancelSupported: true,
			jobId: "export-1",
			review: reviewForSession(ready),
			type: "export.started",
		});

		expect(exporting.status).toBe("ready");
		if (exporting.status !== "ready") {
			throw new Error(`Expected ready, got ${exporting.status}`);
		}

		expect(exporting.export.status).toBe("running");
		if (exporting.export.status !== "running") {
			throw new Error(`Expected running, got ${exporting.export.status}`);
		}

		expect(exporting.export.job.id).toBe("export-1");
		expect(exporting.export.job.cancelSupported).toBe(true);
		expect(canChangeEditingDecisions(exporting)).toBe(false);
		expect(canCloseEditorSession(exporting)).toBe(false);

		const ignoredSelectionEdit = editorSessionReducer(exporting, {
			playheadUs: 400_000,
			type: "selection.start.setFromPlayhead",
		});

		expect(ignoredSelectionEdit).toBe(exporting);
	});

	it("owns Output settings as editing decisions and blocks changes while export is running", () => {
		const ready = createReadySession();

		expect(ready.outputSettings).toEqual(createDefaultOutputSettings());

		const changedOutputSettings = downscaledOutputSettings();
		const changed = editorSessionReducer(ready, {
			outputSettings: changedOutputSettings,
			type: "output-settings.applied",
		});

		expect(changed.status).toBe("ready");
		if (changed.status !== "ready") {
			throw new Error(`Expected ready, got ${changed.status}`);
		}
		expect(changed.outputSettings).toEqual(changedOutputSettings);
		expect(changed.export).toEqual({ status: "reviewing" });

		const unchanged = editorSessionReducer(changed, {
			outputSettings: downscaledOutputSettings(),
			type: "output-settings.applied",
		});
		expect(unchanged).toBe(changed);

		const exporting = startExport(changed);
		expect(
			editorSessionReducer(exporting, {
				outputSettings: createDefaultOutputSettings(),
				type: "output-settings.applied",
			}),
		).toBe(exporting);
	});

	it("tracks export progress and successful generated media without automatic delivery", () => {
		const exporting = startExport(createReadySession());

		const progressed = editorSessionReducer(exporting, {
			jobId: "export-1",
			progress: {
				completedRatio: 0.5,
				phase: "encoding",
			},
			type: "export.progressed",
		});

		expect(progressed.status).toBe("ready");
		if (progressed.status !== "ready") {
			throw new Error(`Expected ready, got ${progressed.status}`);
		}
		expect(progressed.export.status).toBe("running");
		if (progressed.export.status !== "running") {
			throw new Error(`Expected running, got ${progressed.export.status}`);
		}

		expect(progressed.export.job.progress).toEqual({
			completedRatio: 0.5,
			phase: "encoding",
		});

		const succeeded = editorSessionReducer(progressed, {
			generatedMedia,
			jobId: "export-1",
			type: "export.succeeded",
		});

		expect(succeeded.status).toBe("ready");
		if (succeeded.status !== "ready") {
			throw new Error(`Expected ready, got ${succeeded.status}`);
		}
		expect(succeeded.export.status).toBe("succeeded");
		if (succeeded.export.status !== "succeeded") {
			throw new Error(`Expected succeeded, got ${succeeded.export.status}`);
		}

		expect(succeeded.export.generatedMedia).toBe(generatedMedia);
		expect(succeeded.export.delivered).toBe(false);

		const delivered = editorSessionReducer(succeeded, {
			generatedMediaId: generatedMedia.id,
			type: "generated-media.delivered",
		});

		expect(delivered.status).toBe("ready");
		if (delivered.status !== "ready") {
			throw new Error(`Expected ready, got ${delivered.status}`);
		}
		expect(delivered.export.status).toBe("succeeded");
		if (delivered.export.status !== "succeeded") {
			throw new Error(`Expected succeeded, got ${delivered.export.status}`);
		}
		expect(delivered.export.delivered).toBe(true);
	});

	it("keeps the active media asset and editing decisions after export failure or cancellation", () => {
		const ready = createReadySession({
			endUs: 900_000,
			startUs: 300_000,
		});
		const exporting = startExport(ready);

		const failed = editorSessionReducer(exporting, {
			jobId: "export-1",
			message: "Default export failed.",
			technicalDetails: "Encoder rejected the source video.",
			type: "export.failed",
		});

		expect(failed.status).toBe("ready");
		if (failed.status !== "ready") {
			throw new Error(`Expected ready, got ${failed.status}`);
		}
		expect(failed.asset).toBe(readyAsset);
		expect(failed.selection).toEqual({
			endUs: 900_000,
			startUs: 300_000,
		});
		expect(failed.export.status).toBe("failed");
		if (failed.export.status !== "failed") {
			throw new Error(`Expected failed, got ${failed.export.status}`);
		}
		expect(failed.export.message).toBe("Default export failed.");
		expect(failed.export.technicalDetails).toBe(
			"Encoder rejected the source video.",
		);

		const cancelled = editorSessionReducer(exporting, {
			jobId: "export-1",
			type: "export.cancelled",
		});

		expect(cancelled.status).toBe("ready");
		if (cancelled.status !== "ready") {
			throw new Error(`Expected ready, got ${cancelled.status}`);
		}
		expect(cancelled.asset).toBe(readyAsset);
		expect(cancelled.selection).toEqual({
			endUs: 900_000,
			startUs: 300_000,
		});
		expect(cancelled.export.status).toBe("cancelled");
	});

	it("ignores stale export events after a failed job is retried", () => {
		const retrying = editorSessionReducer(
			editorSessionReducer(startExport(createReadySession()), {
				jobId: "export-1",
				message: "Default export failed.",
				type: "export.failed",
			}),
			{
				cancelSupported: true,
				jobId: "export-2",
				review: reviewForSession(createReadySession()),
				type: "export.started",
			},
		);

		expect(retrying.status).toBe("ready");
		if (retrying.status !== "ready") {
			throw new Error(`Expected ready, got ${retrying.status}`);
		}
		expect(retrying.export.status).toBe("running");
		if (retrying.export.status !== "running") {
			throw new Error(`Expected running, got ${retrying.export.status}`);
		}

		expect(
			editorSessionReducer(retrying, {
				jobId: "export-1",
				progress: {
					completedRatio: 0.95,
					phase: "muxing",
				},
				type: "export.progressed",
			}),
		).toBe(retrying);
		expect(
			editorSessionReducer(retrying, {
				generatedMedia,
				jobId: "export-1",
				type: "export.succeeded",
			}),
		).toBe(retrying);
		expect(
			editorSessionReducer(retrying, {
				jobId: "export-1",
				message: "Late failure from the previous export.",
				type: "export.failed",
			}),
		).toBe(retrying);
		expect(
			editorSessionReducer(retrying, {
				jobId: "export-1",
				type: "export.cancelled",
			}),
		).toBe(retrying);
	});

	it("does not start export from an invalid review and ignores unsupported cancellation", () => {
		const invalidReviewReady = createReadySession({
			endUs: 1_500_000,
			startUs: 100_000,
		});

		const ignoredStart = editorSessionReducer(invalidReviewReady, {
			cancelSupported: true,
			jobId: "export-invalid",
			review: reviewForSession(invalidReviewReady),
			type: "export.started",
		});

		expect(ignoredStart).toBe(invalidReviewReady);

		const exporting = editorSessionReducer(createReadySession(), {
			cancelSupported: false,
			jobId: "export-uncancellable",
			review: reviewForSession(createReadySession()),
			type: "export.started",
		});

		const ignoredCancellation = editorSessionReducer(exporting, {
			jobId: "export-uncancellable",
			type: "export.cancelled",
		});

		expect(ignoredCancellation).toBe(exporting);
	});
});

const localDraft = {
	id: "draft-1",
	kind: "local-file",
	label: "clip.mp4",
	provenance: {
		fileName: "clip.mp4",
		mimeType: "video/mp4",
		sizeBytes: 1_024,
	},
	source: {
		name: "clip.mp4",
		size: 1_024,
		type: "video/mp4",
	},
} satisfies MediaAssetDraft;

const readyAsset = {
	durationUs: 1_000_000,
	frameTiming: {
		analysis: {
			averageFrameRate: 30,
			frameRateIsConstant: true,
			maxFrameRate: 30,
			medianFrameRate: 30,
			minFrameRate: 30,
			probedPacketCount: 256,
			underlyingFrameRate: 30,
		},
		fps: 30,
		frameDurationUs: 33_333,
		source: "known",
	},
	id: "asset-1",
	label: "clip.mp4",
	provenance: localDraft.provenance,
	tracks: {
		audio: [],
		video: [
			{
				codec: "avc",
				height: 1080,
				id: "video-1",
				kind: "video",
				width: 1920,
			},
		],
	},
} satisfies ReadyMediaAsset;

const defaultSelection = {
	endUs: 1_000_000,
	startUs: 0,
} satisfies Selection;

const generatedMedia = {
	assetId: "asset-1",
	createdAtMs: 1_717_171_717,
	fileName: "clip-export.mp4",
	id: "generated-1",
	mimeType: "video/mp4",
	outputSettings: createDefaultOutputSettings(),
	resolvedOutput: {
		audioQuality: { kind: "preserve-source" },
		container: {
			fileExtension: ".mp4",
			id: "mp4",
			label: "MP4",
			mimeType: "video/mp4",
		},
		includedAudioTrackCount: 0,
		videoCodec: "avc",
		videoQuality: { kind: "preserve-source" },
	},
	selection: {
		endUs: 1_000_000,
		startUs: 0,
	},
	sizeBytes: 2_048,
} satisfies GeneratedMedia;

function downscaledOutputSettings(): OutputSettings {
	return {
		...createDefaultOutputSettings(),
		resolution: {
			height: 720,
			kind: "target-dimensions",
			width: 1280,
		},
	};
}

function createReadySession(selection: Selection = defaultSelection) {
	return createReadySessionWithAsset(readyAsset, selection);
}

function createReadySessionWithAsset(
	asset: ReadyMediaAsset,
	selection: Selection = defaultSelection,
) {
	const ready = editorSessionReducer(
		editorSessionReducer(createInitialEditorSession(supportedRuntime), {
			draft: localDraft,
			type: "import.started",
		}),
		{
			asset,
			selection,
			type: "asset.ready",
		},
	);

	if (ready.status !== "ready") {
		throw new Error(`Expected ready, got ${ready.status}`);
	}

	return ready;
}

function startExport(ready: ReturnType<typeof createReadySession>) {
	const exporting = editorSessionReducer(ready, {
		cancelSupported: true,
		jobId: "export-1",
		review: reviewForSession(ready),
		type: "export.started",
	});

	if (exporting.status !== "ready") {
		throw new Error(`Expected ready, got ${exporting.status}`);
	}

	if (exporting.export.status !== "running") {
		throw new Error(`Expected running, got ${exporting.export.status}`);
	}

	return exporting;
}

function reviewForSession(ready: ReturnType<typeof createReadySession>) {
	return planDefaultExportCapability({
		asset: ready.asset,
		output: resolveOutputPlan({
			asset: ready.asset,
			audioMix: ready.audioMix,
			outputSettings: ready.outputSettings,
			support: {
				containers: [
					{
						id: "mp4",
						label: "MP4",
						fileExtension: ".mp4",
						mimeType: "video/mp4",
						audioCodecs: ["aac"],
						videoCodecs: ["avc"],
					},
				],
			},
		}),
		outputSettings: ready.outputSettings,
		runtime: ready.runtime,
		selection: ready.selection,
	});
}

const supportedRuntime = evaluateRuntimeSupport({
	fileApi: true,
	mediaSource: true,
	objectUrl: true,
	videoDecoder: true,
	videoEncoder: true,
});
