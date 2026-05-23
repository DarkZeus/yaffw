import { describe, expect, it } from "vitest";

import type { MediaAssetDraft, ReadyMediaAsset, Selection } from "./model";
import {
	evaluateRuntimeSupport,
	readRuntimeCapabilities,
} from "./runtime-capabilities";
import { createInitialEditorSession, editorSessionReducer } from "./session";

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

	it("moves a supported session through loading, ready asset, failure, and closed states", () => {
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

		expect(closed.status).toBe("closed");
		expect(closed.importEnabled).toBe(false);
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
