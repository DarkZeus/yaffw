/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";

import { createLocalMediaAssetDraft } from "@/editor-core/local-file-import";

import { inspectBrowserLocalMediaAssetDraft } from "../adapters/browser-local-asset-analyzer";

const mediabunnyMock = vi.hoisted(() => ({
	computeDuration: vi.fn(),
	dispose: vi.fn(),
	getAudioTracks: vi.fn(),
	getVideoTracks: vi.fn(),
}));

vi.mock("mediabunny", () => ({
	ALL_FORMATS: [],
	BlobSource: class BlobSource {},
	Input: class Input {
		computeDuration = mediabunnyMock.computeDuration;
		dispose = mediabunnyMock.dispose;
		getAudioTracks = mediabunnyMock.getAudioTracks;
		getVideoTracks = mediabunnyMock.getVideoTracks;
	},
}));

afterEach(() => {
	vi.clearAllMocks();
});

describe("inspectBrowserLocalMediaAssetDraft", () => {
	it("disposes the browser media input when analysis is aborted", async () => {
		const duration = createDeferred<number>();
		mediabunnyMock.computeDuration.mockReturnValueOnce(duration.promise);
		mediabunnyMock.getAudioTracks.mockResolvedValueOnce([]);
		mediabunnyMock.getVideoTracks.mockResolvedValueOnce([]);
		const draft = createLocalMediaAssetDraft(
			new File(["pending media"], "pending.mp4", { type: "video/mp4" }),
			{ createDraftId: () => "draft-pending" },
		);
		const abortController = new AbortController();

		const inspection = inspectBrowserLocalMediaAssetDraft(draft, {
			signal: abortController.signal,
		});
		await vi.waitFor(() => {
			expect(mediabunnyMock.computeDuration).toHaveBeenCalledOnce();
		});
		abortController.abort();

		expect(mediabunnyMock.dispose).toHaveBeenCalledOnce();
		duration.reject(new Error("Input disposed."));
		await expect(inspection).rejects.toThrow("Input disposed.");
	});

	it("disposes the browser media input when inspection fails", async () => {
		mediabunnyMock.computeDuration.mockRejectedValueOnce(
			new Error("Container could not be read."),
		);
		mediabunnyMock.getAudioTracks.mockResolvedValueOnce([]);
		mediabunnyMock.getVideoTracks.mockResolvedValueOnce([]);
		const draft = createLocalMediaAssetDraft(
			new File(["broken media"], "broken.mp4", { type: "video/mp4" }),
			{ createDraftId: () => "draft-broken" },
		);

		await expect(inspectBrowserLocalMediaAssetDraft(draft, {})).rejects.toThrow(
			"Container could not be read.",
		);
		expect(mediabunnyMock.dispose).toHaveBeenCalledTimes(1);
	});
});

function createDeferred<T>() {
	let reject: (reason?: unknown) => void = () => {};
	let resolve: (value: T) => void = () => {};
	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		reject = promiseReject;
		resolve = promiseResolve;
	});

	return { promise, reject, resolve };
}
