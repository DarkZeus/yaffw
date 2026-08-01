/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";

import { createLocalMediaAssetDraft } from "@/editor-core/local-file-import";

import { inspectBrowserLocalMediaAssetDraft } from "../adapters/browser-local-asset-analyzer";

const mediabunnyMock = vi.hoisted(() => ({
	canRead: vi.fn(),
	computeDuration: vi.fn(),
	dispose: vi.fn(),
	getAudioTracks: vi.fn(),
	getDurationFromMetadata: vi.fn(),
	getVideoTracks: vi.fn(),
}));

vi.mock("mediabunny", () => ({
	ALL_FORMATS: [],
	BlobSource: class BlobSource {},
	Input: class Input {
		canRead = mediabunnyMock.canRead;
		computeDuration = mediabunnyMock.computeDuration;
		dispose = mediabunnyMock.dispose;
		getAudioTracks = mediabunnyMock.getAudioTracks;
		getDurationFromMetadata = mediabunnyMock.getDurationFromMetadata;
		getVideoTracks = mediabunnyMock.getVideoTracks;
	},
}));

afterEach(() => {
	vi.clearAllMocks();
});

describe("inspectBrowserLocalMediaAssetDraft", () => {
	it("rejects a Blob that Mediabunny cannot read", async () => {
		mediabunnyMock.canRead.mockResolvedValueOnce(false);
		const draft = createLocalMediaAssetDraft(
			new File(["not media"], "notes.txt", { type: "text/plain" }),
			{ createDraftId: () => "draft-unreadable" },
		);

		await expect(inspectBrowserLocalMediaAssetDraft(draft, {})).rejects.toThrow(
			"Mediabunny cannot read this local media asset.",
		);
		expect(mediabunnyMock.getDurationFromMetadata).not.toHaveBeenCalled();
		expect(mediabunnyMock.computeDuration).not.toHaveBeenCalled();
		expect(mediabunnyMock.dispose).toHaveBeenCalledOnce();
	});

	it("uses container metadata duration without scanning packets", async () => {
		mediabunnyMock.canRead.mockResolvedValueOnce(true);
		mediabunnyMock.getDurationFromMetadata.mockResolvedValueOnce(2.5);
		mediabunnyMock.getAudioTracks.mockResolvedValueOnce([]);
		mediabunnyMock.getVideoTracks.mockResolvedValueOnce([]);
		const draft = createLocalMediaAssetDraft(
			new File(["media"], "metadata.mp4", { type: "video/mp4" }),
			{ createDraftId: () => "draft-metadata" },
		);

		await expect(
			inspectBrowserLocalMediaAssetDraft(draft, {}),
		).resolves.toEqual(expect.objectContaining({ durationUs: 2_500_000 }));
		expect(mediabunnyMock.computeDuration).not.toHaveBeenCalled();
		expect(mediabunnyMock.dispose).toHaveBeenCalledOnce();
	});

	it.each([null, Number.NaN])(
		"falls back to packet duration when metadata duration is %s",
		async (metadataDuration) => {
			mediabunnyMock.canRead.mockResolvedValueOnce(true);
			mediabunnyMock.getDurationFromMetadata.mockResolvedValueOnce(
				metadataDuration,
			);
			mediabunnyMock.computeDuration.mockResolvedValueOnce(3);
			mediabunnyMock.getAudioTracks.mockResolvedValueOnce([]);
			mediabunnyMock.getVideoTracks.mockResolvedValueOnce([]);
			const draft = createLocalMediaAssetDraft(
				new File(["media"], "fallback.mp4", { type: "video/mp4" }),
				{ createDraftId: () => "draft-fallback" },
			);

			await expect(
				inspectBrowserLocalMediaAssetDraft(draft, {}),
			).resolves.toEqual(expect.objectContaining({ durationUs: 3_000_000 }));
			expect(mediabunnyMock.computeDuration).toHaveBeenCalledOnce();
			expect(mediabunnyMock.dispose).toHaveBeenCalledOnce();
		},
	);

	it("falls back to packet duration when metadata duration cannot be read", async () => {
		mediabunnyMock.canRead.mockResolvedValueOnce(true);
		mediabunnyMock.getDurationFromMetadata.mockRejectedValueOnce(
			new Error("Duration metadata is malformed."),
		);
		mediabunnyMock.computeDuration.mockResolvedValueOnce(4);
		mediabunnyMock.getAudioTracks.mockResolvedValueOnce([]);
		mediabunnyMock.getVideoTracks.mockResolvedValueOnce([]);
		const draft = createLocalMediaAssetDraft(
			new File(["media"], "fallback.mp4", { type: "video/mp4" }),
			{ createDraftId: () => "draft-rejected-metadata" },
		);

		await expect(
			inspectBrowserLocalMediaAssetDraft(draft, {}),
		).resolves.toEqual(expect.objectContaining({ durationUs: 4_000_000 }));
		expect(mediabunnyMock.computeDuration).toHaveBeenCalledOnce();
		expect(mediabunnyMock.dispose).toHaveBeenCalledOnce();
	});

	it("disposes the browser media input when analysis is aborted", async () => {
		const duration = createDeferred<number>();
		mediabunnyMock.canRead.mockResolvedValueOnce(true);
		mediabunnyMock.getDurationFromMetadata.mockResolvedValueOnce(null);
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

	it("does not start a packet scan when analysis is aborted during metadata", async () => {
		const metadataDuration = createDeferred<number | null>();
		mediabunnyMock.canRead.mockResolvedValueOnce(true);
		mediabunnyMock.getDurationFromMetadata.mockReturnValueOnce(
			metadataDuration.promise,
		);
		mediabunnyMock.getAudioTracks.mockResolvedValueOnce([]);
		mediabunnyMock.getVideoTracks.mockResolvedValueOnce([]);
		const draft = createLocalMediaAssetDraft(
			new File(["pending media"], "pending.mp4", { type: "video/mp4" }),
			{ createDraftId: () => "draft-pending-metadata" },
		);
		const abortController = new AbortController();

		const inspection = inspectBrowserLocalMediaAssetDraft(draft, {
			signal: abortController.signal,
		});
		await vi.waitFor(() => {
			expect(mediabunnyMock.getDurationFromMetadata).toHaveBeenCalledOnce();
		});
		abortController.abort();
		metadataDuration.resolve(null);

		await expect(inspection).rejects.toMatchObject({ name: "AbortError" });
		expect(mediabunnyMock.computeDuration).not.toHaveBeenCalled();
		expect(mediabunnyMock.dispose).toHaveBeenCalled();
	});

	it("disposes the browser media input when inspection fails", async () => {
		mediabunnyMock.canRead.mockResolvedValueOnce(true);
		mediabunnyMock.getDurationFromMetadata.mockResolvedValueOnce(null);
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
