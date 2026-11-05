/* @vitest-environment jsdom */

import type { FrameRateMetrics } from "mediabunny";
import { afterEach, describe, expect, it, vi } from "vitest";

import { analyzeLocalMediaAssetDraft } from "@/editor-core/local-file-analysis";
import { evaluateRuntimeSupport } from "@/editor-core/runtime-capabilities";

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
	it.each([24, 25, 30_000 / 1_001, 60_000 / 1_001])(
		"preserves a confident %s fps underlying rate and bounded sample statistics",
		async (fps) => {
			const metrics = frameMetrics({
				averageFrameRate: fps,
				bestGuessFrameRate: fps,
				maxFrameRate: fps,
				medianFrameRate: fps,
				minFrameRate: fps,
				underlyingFrameRate: fps,
			});
			const { draft, track } = prepareFrameTimingInspection(metrics);
			const inspection = await inspectBrowserLocalMediaAssetDraft(draft, {});

			expect(inspection.frameTiming).toEqual({
				analysis: timingAnalysis(metrics),
				fps,
				frameDurationUs: Math.round(1_000_000 / fps),
				source: "known",
			});
			expect(track.computeFrameRateMetrics).toHaveBeenCalledExactlyOnceWith({
				targetPacketCount: 256,
			});
			expect(mediabunnyMock.dispose).toHaveBeenCalledOnce();
		},
	);

	it("keeps dropped-frame variation separate from a confident underlying rate", async () => {
		const metrics = frameMetrics({
			averageFrameRate: 25,
			frameRateIsConstant: false,
			minFrameRate: 15,
		});
		const { draft } = prepareFrameTimingInspection(metrics);

		expect(
			(await inspectBrowserLocalMediaAssetDraft(draft, {})).frameTiming,
		).toEqual({
			analysis: timingAnalysis(metrics),
			fps: 30,
			frameDurationUs: 33_333,
			source: "known",
		});
	});

	it("retains VFR statistics and a useful non-30 estimated rate", async () => {
		const metrics = frameMetrics({
			averageFrameRate: 22,
			bestGuessFrameRate: 23.5,
			frameRateIsConstant: false,
			maxFrameRate: 40,
			medianFrameRate: 23.5,
			minFrameRate: 12,
			underlyingFrameRate: null,
		});
		const { draft } = prepareFrameTimingInspection(metrics);
		const result = await analyzeLocalMediaAssetDraft(draft, {
			inspect: inspectBrowserLocalMediaAssetDraft,
			runtime: supportedRuntime,
		});

		expect(result.status).toBe("ready");
		if (result.status !== "ready") throw new Error("Expected ready asset");
		expect(result.asset.frameTiming).toEqual({
			analysis: timingAnalysis(metrics),
			fps: 23.5,
			frameDurationUs: 42_553,
			reason: expect.stringContaining("No consistent underlying frame rate"),
			source: "estimated",
		});
	});

	it("accepts a short usable sample without requiring the full probe target", async () => {
		const metrics = frameMetrics({ probedPacketCount: 2 });
		const { draft } = prepareFrameTimingInspection(metrics);

		expect(
			(await inspectBrowserLocalMediaAssetDraft(draft, {})).frameTiming,
		).toMatchObject({
			analysis: { probedPacketCount: 2 },
			source: "known",
		});
	});

	it.each([
		{ underlyingFrameRate: null, frameRateIsConstant: true },
		...[0, 1, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY].map(
			(probedPacketCount) => ({ probedPacketCount }),
		),
		...(
			[
				"bestGuessFrameRate",
				"underlyingFrameRate",
				"averageFrameRate",
				"medianFrameRate",
				"minFrameRate",
				"maxFrameRate",
			] as const
		).flatMap((field) =>
			[0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.MIN_VALUE].map(
				(value) => ({ [field]: value }),
			),
		),
	])(
		"uses explicit unavailable fallback for unusable metrics %o",
		async (overrides) => {
			const { draft } = prepareFrameTimingInspection(frameMetrics(overrides));
			const result = await analyzeLocalMediaAssetDraft(draft, {
				inspect: inspectBrowserLocalMediaAssetDraft,
				runtime: supportedRuntime,
			});

			expect(result.status).toBe("ready");
			if (result.status !== "ready") throw new Error("Expected ready asset");
			expect(result.asset.frameTiming).toEqual({
				analysis: null,
				fps: 30,
				frameDurationUs: 33_333,
				reason: expect.any(String),
				source: "estimated",
			});
			expect(mediabunnyMock.dispose).toHaveBeenCalledOnce();
		},
	);

	it("keeps an asset ready with unavailable analysis when frame metrics fail", async () => {
		const { draft, track } = prepareFrameTimingInspection(frameMetrics());
		track.computeFrameRateMetrics.mockRejectedValueOnce(
			new Error("Unreadable timestamps"),
		);
		const result = await analyzeLocalMediaAssetDraft(draft, {
			inspect: inspectBrowserLocalMediaAssetDraft,
			runtime: supportedRuntime,
		});

		expect(result.status).toBe("ready");
		if (result.status !== "ready") throw new Error("Expected ready asset");
		expect(result.asset.frameTiming).toMatchObject({
			analysis: null,
			fps: 30,
			source: "estimated",
		});
		expect(mediabunnyMock.dispose).toHaveBeenCalledOnce();
	});

	it("removes the abort listener after a successful bounded frame probe", async () => {
		const { draft } = prepareFrameTimingInspection(frameMetrics());
		const abortController = new AbortController();
		await inspectBrowserLocalMediaAssetDraft(draft, {
			signal: abortController.signal,
		});
		expect(mediabunnyMock.dispose).toHaveBeenCalledOnce();
		abortController.abort();
		expect(mediabunnyMock.dispose).toHaveBeenCalledOnce();
	});

	it("does not start a frame probe when track metadata completes after cancellation", async () => {
		const { draft, track } = prepareFrameTimingInspection(frameMetrics());
		const width = createDeferred<number>();
		track.getDisplayWidth.mockReturnValueOnce(width.promise);
		const abortController = new AbortController();
		const inspection = inspectBrowserLocalMediaAssetDraft(draft, {
			signal: abortController.signal,
		});
		await vi.waitFor(() =>
			expect(track.getDisplayWidth).toHaveBeenCalledOnce(),
		);
		abortController.abort();
		width.resolve(1920);

		await expect(inspection).rejects.toMatchObject({ name: "AbortError" });
		expect(track.computeFrameRateMetrics).not.toHaveBeenCalled();
		expect(mediabunnyMock.dispose).toHaveBeenCalled();
	});

	it("cancels and cleans up a pending bounded frame probe without accepting fallback timing", async () => {
		const { draft, track } = prepareFrameTimingInspection(frameMetrics());
		const metrics = createDeferred<FrameRateMetrics>();
		track.computeFrameRateMetrics.mockReturnValueOnce(metrics.promise);
		const abortController = new AbortController();
		const inspection = inspectBrowserLocalMediaAssetDraft(draft, {
			signal: abortController.signal,
		});
		await vi.waitFor(() =>
			expect(track.computeFrameRateMetrics).toHaveBeenCalledOnce(),
		);
		abortController.abort();
		expect(mediabunnyMock.dispose).toHaveBeenCalledOnce();
		metrics.reject(new Error("Input disposed."));

		await expect(inspection).rejects.toMatchObject({ name: "AbortError" });
	});

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
				averageBitrate: 8_000_000,
				codec: "avc",
				codecParameterString: "avc1.640028",
				displayHeight: 1080,
				displayWidth: 1920,
				id: 7,
				internalCodecId: "avc1",
				name: "Camera",
				peakBitrate: 12_000_000,
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
				peakBitrate: 192_000,
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
					bitrate: 192_000,
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
			videoTracks: [
				{
					bitrate: 8_000_000,
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
	averageBitrate = null,
	codec,
	codecParameterString,
	displayHeight,
	displayWidth,
	id,
	internalCodecId,
	name,
	peakBitrate = null,
}: {
	averageBitrate?: number | null;
	codec: string | null;
	codecParameterString: string | null;
	displayHeight: number;
	displayWidth: number;
	id: number;
	internalCodecId: string | null;
	name: string | null;
	peakBitrate?: number | null;
}) {
	return {
		computeFrameRateMetrics: vi.fn(async () => frameMetrics()),
		getAverageBitrate: vi.fn(async () => averageBitrate),
		getBitrate: vi.fn(async () => peakBitrate),
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
	averageBitrate = null,
	channels,
	codec,
	codecParameterString,
	id,
	internalCodecId,
	languageCode,
	name,
	peakBitrate = null,
	sampleRate,
}: {
	averageBitrate?: number | null;
	channels: number;
	codec: string | null;
	codecParameterString: string | null;
	id: number;
	internalCodecId: string | null;
	languageCode: string;
	name: string | null;
	peakBitrate?: number | null;
	sampleRate: number;
}) {
	return {
		getAverageBitrate: vi.fn(async () => averageBitrate),
		getBitrate: vi.fn(async () => peakBitrate),
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

const supportedRuntime = evaluateRuntimeSupport({
	fileApi: true,
	mediaSource: true,
	objectUrl: true,
	videoDecoder: true,
	videoEncoder: true,
});

function frameMetrics(
	overrides: Partial<FrameRateMetrics> = {},
): FrameRateMetrics {
	return {
		averageFrameRate: 30,
		bestGuessFrameRate: 30,
		frameRateIsConstant: true,
		maxFrameRate: 30,
		medianFrameRate: 30,
		minFrameRate: 30,
		probedPacketCount: 256,
		underlyingFrameRate: 30,
		...overrides,
	};
}

function timingAnalysis({
	bestGuessFrameRate: _,
	...analysis
}: FrameRateMetrics) {
	return analysis;
}

function prepareFrameTimingInspection(metrics: FrameRateMetrics) {
	mediabunnyMock.canRead.mockResolvedValueOnce(true);
	mediabunnyMock.getDurationFromMetadata.mockResolvedValueOnce(2.5);
	mediabunnyMock.getAudioTracks.mockResolvedValueOnce([]);
	const track = createVideoTrack({
		codec: "avc",
		codecParameterString: "avc1.640028",
		displayHeight: 1080,
		displayWidth: 1920,
		id: 1,
		internalCodecId: "avc1",
		name: "Camera",
	});
	track.computeFrameRateMetrics.mockResolvedValue(metrics);
	mediabunnyMock.getVideoTracks.mockResolvedValueOnce([track]);
	const draft = createLocalMediaAssetDraft(
		new File(["media"], "timing.mp4", { type: "video/mp4" }),
		{ createDraftId: () => "draft-timing" },
	);
	return { draft, track };
}
