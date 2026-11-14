/* @vitest-environment jsdom */

import type { FrameRateMetrics } from "mediabunny";
import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeLocalMediaAssetDraft } from "@/editor-core/local-file-analysis";
import { createLocalMediaAssetDraft } from "@/editor-core/local-file-import";
import { inspectBrowserLocalMediaAssetDraft } from "../adapters/browser-local-asset-analyzer";

const mediabunnyMock = vi.hoisted(() => ({
	mp4: {},
	quickTime: {},
	getFormat: vi.fn(),
	canRead: vi.fn(),
	computeDuration: vi.fn(),
	dispose: vi.fn(),
	getAudioTracks: vi.fn(),
	getDurationFromMetadata: vi.fn(),
	getVideoTracks: vi.fn(),
}));

vi.mock("mediabunny", () => ({
	ALL_FORMATS: [],
	MP4: mediabunnyMock.mp4,
	QTFF: mediabunnyMock.quickTime,
	BlobSource: class BlobSource {},
	Input: class Input {
		canRead = mediabunnyMock.canRead;
		computeDuration = mediabunnyMock.computeDuration;
		dispose = mediabunnyMock.dispose;
		getAudioTracks = mediabunnyMock.getAudioTracks;
		getDurationFromMetadata = mediabunnyMock.getDurationFromMetadata;
		getFormat = mediabunnyMock.getFormat;
		getVideoTracks = mediabunnyMock.getVideoTracks;
	},
}));

afterEach(() => {
	vi.clearAllMocks();
});

describe("inspectBrowserLocalMediaAssetDraft", () => {
	it("uses the whole MP4 packet table when the average bitrate is missing", async () => {
		const { draft, track } = prepareFrameTimingInspection(frameMetrics());
		mediabunnyMock.getFormat.mockResolvedValueOnce(mediabunnyMock.mp4);
		track.computePacketStats.mockResolvedValueOnce({
			averageBitrate: 533_866_771,
		});
		track.getBitrate.mockResolvedValueOnce(700_000_000);

		const result = await analyzeLocalMediaAssetDraft(draft, {
			inspect: inspectBrowserLocalMediaAssetDraft,
		});

		expect(result).toMatchObject({
			status: "ready",
			asset: {
				tracks: { video: [{ bitrate: 533_866_771, bitrateKind: "average" }] },
			},
		});
		expect(track.computePacketStats).toHaveBeenCalledWith(Infinity, {
			metadataOnly: true,
		});
		expect(track.getBitrate).not.toHaveBeenCalled();
	});

	it("keeps a declared average without scanning packets", async () => {
		const { draft, track } = prepareFrameTimingInspection(frameMetrics());
		mediabunnyMock.getFormat.mockResolvedValueOnce(mediabunnyMock.mp4);
		track.getAverageBitrate.mockResolvedValueOnce(4_000_000);

		const inspection = await inspectBrowserLocalMediaAssetDraft(draft, {});

		expect(inspection.videoTracks[0]).toMatchObject({
			bitrate: 4_000_000,
			bitrateKind: "average",
		});
		expect(track.computePacketStats).not.toHaveBeenCalled();
	});

	it("reports a declared peak for formats without a packet table scan", async () => {
		const { draft, track } = prepareFrameTimingInspection(frameMetrics());
		mediabunnyMock.getFormat.mockResolvedValueOnce({});
		track.getBitrate.mockResolvedValueOnce(8_000_000);

		const inspection = await inspectBrowserLocalMediaAssetDraft(draft, {});

		expect(inspection.videoTracks[0]).toMatchObject({
			bitrate: 8_000_000,
			bitrateKind: "peak",
		});
		expect(track.computePacketStats).not.toHaveBeenCalled();
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
		computePacketStats: vi.fn<() => Promise<{ averageBitrate: number }>>(),
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

function createDeferred<T>() {
	let reject: (reason?: unknown) => void = () => {};
	let resolve: (value: T) => void = () => {};
	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		reject = promiseReject;
		resolve = promiseResolve;
	});

	return { promise, reject, resolve };
}

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
