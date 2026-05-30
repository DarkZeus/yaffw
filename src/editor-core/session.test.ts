import { describe, expect, it } from "vitest";

import type {
	GeneratedMedia,
	MediaAssetDraft,
	ReadyMediaAsset,
	Selection,
} from "./model";
import { DEFAULT_OUTPUT_PROFILE } from "./model";
import {
	evaluateRuntimeSupport,
	readRuntimeCapabilities,
} from "./runtime-capabilities";
import {
	canChangeEditingDecisions,
	canCloseEditorSession,
	createInitialEditorSession,
	editorSessionReducer,
	shouldProtectEditorBeforeUnload,
} from "./session";

describe("editor-next session runtime gate", () => {
	it("reads WebCodecs and browser media API basics from a runtime object", () => {
		expect(
			readRuntimeCapabilities({
				File: function File() {},
				MediaSource: function MediaSource() {},
				URL: {
					createObjectURL() {
						return "blob:asset";
					},
					revokeObjectURL() {},
				},
				VideoDecoder: function VideoDecoder() {},
				VideoEncoder: function VideoEncoder() {},
			}),
		).toEqual({
			fileApi: true,
			mediaSource: true,
			objectUrl: true,
			videoDecoder: true,
			videoEncoder: true,
		});
	});

	it("starts blocked when WebCodecs runtime basics are missing", () => {
		const runtime = evaluateRuntimeSupport({
			fileApi: true,
			mediaSource: true,
			objectUrl: true,
			videoDecoder: false,
			videoEncoder: false,
		});

		const session = createInitialEditorSession(runtime);

		expect(session.status).toBe("unsupported-runtime");
		if (session.status !== "unsupported-runtime") {
			throw new Error(`Expected unsupported runtime, got ${session.status}`);
		}

		expect(session.importEnabled).toBe(false);
		expect(session.message).toContain("WebCodecs");
	});

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

	it("starts a default export job from a valid review and captures a start-time snapshot", () => {
		const ready = createReadySession({
			endUs: 800_000,
			startUs: 200_000,
		});

		const exporting = editorSessionReducer(ready, {
			cancelSupported: true,
			jobId: "export-1",
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
		expect(exporting.export.job.snapshot.asset).toBe(readyAsset);
		expect(exporting.export.job.snapshot.selection).toEqual({
			endUs: 800_000,
			startUs: 200_000,
		});
		expect(exporting.export.job.snapshot.review.supported).toBe(true);
		expect(canChangeEditingDecisions(exporting)).toBe(false);
		expect(canCloseEditorSession(exporting)).toBe(false);

		const ignoredSelectionEdit = editorSessionReducer(exporting, {
			playheadUs: 400_000,
			type: "selection.start.setFromPlayhead",
		});

		expect(ignoredSelectionEdit).toBe(exporting);
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
			type: "export.started",
		});

		expect(ignoredStart).toBe(invalidReviewReady);

		const exporting = editorSessionReducer(createReadySession(), {
			cancelSupported: false,
			jobId: "export-uncancellable",
			type: "export.started",
		});

		const ignoredCancellation = editorSessionReducer(exporting, {
			jobId: "export-uncancellable",
			type: "export.cancelled",
		});

		expect(ignoredCancellation).toBe(exporting);
	});

	it("derives close availability and unload protection from session-local work", () => {
		const empty = createInitialEditorSession(supportedRuntime);
		const ready = createReadySession();
		const exporting = startExport(ready);
		const succeeded = editorSessionReducer(exporting, {
			generatedMedia,
			jobId: "export-1",
			type: "export.succeeded",
		});
		const closed = editorSessionReducer(succeeded, { type: "session.closed" });

		expect(canCloseEditorSession(empty)).toBe(false);
		expect(shouldProtectEditorBeforeUnload(empty)).toBe(false);

		expect(canCloseEditorSession(ready)).toBe(true);
		expect(shouldProtectEditorBeforeUnload(ready)).toBe(true);

		expect(canCloseEditorSession(exporting)).toBe(false);
		expect(shouldProtectEditorBeforeUnload(exporting)).toBe(true);

		expect(canCloseEditorSession(succeeded)).toBe(true);
		expect(shouldProtectEditorBeforeUnload(succeeded)).toBe(true);

		expect(closed.status).toBe("empty");
		expect(shouldProtectEditorBeforeUnload(closed)).toBe(false);
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
	exportCapability: {
		profile: {
			audioCodec: "aac",
			container: "mp4",
			videoCodec: "h264",
		},
		supported: true,
	},
	frameTiming: {
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
				id: "video-1",
				kind: "video",
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
	profile: DEFAULT_OUTPUT_PROFILE,
	selection: {
		endUs: 1_000_000,
		startUs: 0,
	},
	sizeBytes: 2_048,
} satisfies GeneratedMedia;

function createReadySession(selection: Selection = defaultSelection) {
	const ready = editorSessionReducer(
		editorSessionReducer(createInitialEditorSession(supportedRuntime), {
			draft: localDraft,
			type: "import.started",
		}),
		{
			asset: readyAsset,
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

const supportedRuntime = evaluateRuntimeSupport({
	fileApi: true,
	mediaSource: true,
	objectUrl: true,
	videoDecoder: true,
	videoEncoder: true,
});
