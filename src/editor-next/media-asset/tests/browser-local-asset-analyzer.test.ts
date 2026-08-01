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

	it("resolves complete current Media track metadata for multiple audio tracks", async () => {
		mediabunnyMock.canRead.mockResolvedValueOnce(true);
		mediabunnyMock.getDurationFromMetadata.mockResolvedValueOnce(2.5);
		mediabunnyMock.getVideoTracks.mockResolvedValueOnce([
			createVideoTrack({
				codec: "avc",
				codecParameterString: "avc1.640028",
				displayHeight: 1080,
				displayWidth: 1920,
				id: 7,
				internalCodecId: "avc1",
				name: "Camera",
			}),
		]);
		mediabunnyMock.getAudioTracks.mockResolvedValueOnce([
			createAudioTrack({
				channels: 2,
				codec: "aac",
				codecParameterString: "mp4a.40.2",
				id: 8,
				internalCodecId: "mp4a",
				languageCode: "eng",
				name: "Voice",
				sampleRate: 48_000,
			}),
			createAudioTrack({
				channels: 1,
				codec: "opus",
				codecParameterString: null,
				id: 9,
				internalCodecId: "A_OPUS",
				languageCode: "ukr",
				name: "Room",
				sampleRate: 44_100,
			}),
		]);
		const draft = createLocalMediaAssetDraft(
			new File(["media"], "tracks.mp4", { type: "video/mp4" }),
			{ createDraftId: () => "draft-tracks" },
		);

		await expect(
			inspectBrowserLocalMediaAssetDraft(draft, {}),
		).resolves.toEqual({
			audioTracks: [
				{
					channels: 2,
					codec: "mp4a.40.2",
					id: "8",
					label: "Voice",
					language: "eng",
					sampleRate: 48_000,
				},
				{
					channels: 1,
					codec: "opus",
					id: "9",
					label: "Room",
					language: "ukr",
					sampleRate: 44_100,
				},
			],
			durationUs: 2_500_000,
			frameTiming: {
				fps: 30,
				frameDurationUs: 33_333,
				source: "known",
			},
			videoTracks: [
				{
					codec: "avc1.640028",
					height: 1080,
					id: "7",
					label: "Camera",
					width: 1920,
				},
			],
		});
		expect(mediabunnyMock.dispose).toHaveBeenCalledOnce();
	});

	it("keeps absent optional Media track metadata explicit", async () => {
		mediabunnyMock.canRead.mockResolvedValueOnce(true);
		mediabunnyMock.getDurationFromMetadata.mockResolvedValueOnce(1);
		mediabunnyMock.getVideoTracks.mockResolvedValueOnce([
			createVideoTrack({
				codec: null,
				codecParameterString: null,
				displayHeight: 720,
				displayWidth: 1280,
				id: 1,
				internalCodecId: null,
				name: null,
			}),
		]);
		mediabunnyMock.getAudioTracks.mockResolvedValueOnce([
			createAudioTrack({
				channels: 2,
				codec: null,
				codecParameterString: null,
				id: 2,
				internalCodecId: null,
				languageCode: "und",
				name: null,
				sampleRate: 48_000,
			}),
		]);
		const draft = createLocalMediaAssetDraft(
			new File(["media"], "unknown.mp4", { type: "video/mp4" }),
			{ createDraftId: () => "draft-unknown" },
		);

		const inspection = await inspectBrowserLocalMediaAssetDraft(draft, {});

		expect(inspection.videoTracks[0]).toEqual({
			codec: undefined,
			height: 720,
			id: "1",
			label: "Video 1",
			width: 1280,
		});
		expect(inspection.audioTracks[0]).toEqual({
			channels: 2,
			codec: undefined,
			id: "2",
			label: "Audio 1",
			language: "und",
			sampleRate: 48_000,
		});
	});

	it("rejects and disposes when required Media track metadata cannot be read", async () => {
		const failure = new Error("Video dimensions are malformed.");
		const videoTrack = createVideoTrack({
			codec: "avc",
			codecParameterString: "avc1.640028",
			displayHeight: 1080,
			displayWidth: 1920,
			id: 1,
			internalCodecId: "avc1",
			name: "Camera",
		});
		videoTrack.getDisplayWidth.mockRejectedValueOnce(failure);
		mediabunnyMock.canRead.mockResolvedValueOnce(true);
		mediabunnyMock.getDurationFromMetadata.mockResolvedValueOnce(1);
		mediabunnyMock.getVideoTracks.mockResolvedValueOnce([videoTrack]);
		mediabunnyMock.getAudioTracks.mockResolvedValueOnce([]);
		const draft = createLocalMediaAssetDraft(
			new File(["media"], "broken-metadata.mp4", { type: "video/mp4" }),
			{ createDraftId: () => "draft-broken-metadata" },
		);

		await expect(inspectBrowserLocalMediaAssetDraft(draft, {})).rejects.toBe(
			failure,
		);
		expect(mediabunnyMock.dispose).toHaveBeenCalledOnce();
	});
});

function createVideoTrack({
	codec,
	codecParameterString,
	displayHeight,
	displayWidth,
	id,
	internalCodecId,
	name,
}: {
	codec: string | null;
	codecParameterString: string | null;
	displayHeight: number;
	displayWidth: number;
	id: number;
	internalCodecId: string | null;
	name: string | null;
}) {
	return {
		computePacketStats: vi.fn(async () => ({ averagePacketRate: 30 })),
		getCodec: vi.fn(async () => codec),
		getCodecParameterString: vi.fn(async () => codecParameterString),
		getDisplayHeight: vi.fn(async () => displayHeight),
		getDisplayWidth: vi.fn(async () => displayWidth),
		getInternalCodecId: vi.fn(async () => internalCodecId),
		getName: vi.fn(async () => name),
		id,
	};
}

function createAudioTrack({
	channels,
	codec,
	codecParameterString,
	id,
	internalCodecId,
	languageCode,
	name,
	sampleRate,
}: {
	channels: number;
	codec: string | null;
	codecParameterString: string | null;
	id: number;
	internalCodecId: string | null;
	languageCode: string;
	name: string | null;
	sampleRate: number;
}) {
	return {
		getCodec: vi.fn(async () => codec),
		getCodecParameterString: vi.fn(async () => codecParameterString),
		getInternalCodecId: vi.fn(async () => internalCodecId),
		getLanguageCode: vi.fn(async () => languageCode),
		getName: vi.fn(async () => name),
		getNumberOfChannels: vi.fn(async () => channels),
		getSampleRate: vi.fn(async () => sampleRate),
		id,
	};
}

function createDeferred<T>() {
	let reject: (reason?: unknown) => void = () => {};
	let resolve: (value: T) => void = () => {};
	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		reject = promiseReject;
		resolve = promiseResolve;
	});

	return { promise, reject, resolve };
}
