/* @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReadyMediaAsset } from "@/editor-core/model";

import type { VideoStripThumbnailLoader } from "../types/selection-video-strip.types";
import {
	type VideoStripThumbnailWindow,
	clearVideoStripThumbnailCache,
	createVideoStripThumbnailDimensions,
	createVideoStripThumbnailTimestamps,
	createVideoStripThumbnailWindow,
	loadBrowserVideoStripThumbnails,
	loadVideoStripThumbnailsOnCurrentThread,
	useVideoStripThumbnails,
} from "../video-strip/selection-video-strip";

const mediabunnyMock = vi.hoisted(() => ({
	canvases: [] as Array<{
		canvas: HTMLCanvasElement;
		duration: number;
		timestamp: number;
	} | null>,
	inputInstances: [] as Array<{
		dispose: ReturnType<typeof vi.fn>;
		getPrimaryVideoTrack: ReturnType<typeof vi.fn>;
	}>,
	primaryVideoTrack: null as MockVideoTrack | null,
	sinkOptions: [] as unknown[],
	timestamps: [] as number[],
}));

vi.mock("mediabunny", () => {
	class Input {
		dispose = vi.fn();
		getPrimaryVideoTrack = vi.fn(async () => mediabunnyMock.primaryVideoTrack);

		constructor() {
			mediabunnyMock.inputInstances.push(this);
		}
	}

	class CanvasSink {
		constructor(_track: unknown, options: unknown) {
			mediabunnyMock.sinkOptions.push(options);
		}

		async *canvasesAtTimestamps(timestamps: Iterable<number>) {
			mediabunnyMock.timestamps = Array.from(timestamps);

			for (const canvas of mediabunnyMock.canvases) {
				yield canvas;
			}
		}
	}

	return {
		ALL_FORMATS: [],
		BlobSource: vi.fn().mockImplementation((blob: Blob) => ({ blob })),
		CanvasSink,
		Input,
	};
});

beforeEach(() => {
	clearVideoStripThumbnailCache();
	mediabunnyMock.canvases = [];
	mediabunnyMock.inputInstances = [];
	mediabunnyMock.primaryVideoTrack = createVideoTrack();
	mediabunnyMock.sinkOptions = [];
	mediabunnyMock.timestamps = [];
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function VideoStripThumbnailProbe({
	asset,
	source,
	thumbnailWindow,
	videoStripThumbnailLoader,
}: {
	asset: ReadyMediaAsset;
	source: Blob;
	thumbnailWindow: VideoStripThumbnailWindow | null;
	videoStripThumbnailLoader: VideoStripThumbnailLoader;
}) {
	const state = useVideoStripThumbnails({
		asset,
		source,
		thumbnailWindow,
		videoStripThumbnailLoader,
	});
	const frameCount =
		state.status === "ready" || state.status === "loading"
			? state.frames.length
			: 0;

	return createElement(
		"output",
		{ "aria-label": "video strip status" },
		`${state.status}:${frameCount}`,
	);
}

function screenText(label: string) {
	return screen.getByLabelText(label).textContent ?? "";
}

const readyAsset = {
	durationUs: 12_000_000,
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
	provenance: {
		fileName: "clip.mp4",
		mimeType: "video/mp4",
		sizeBytes: 1_024,
	},
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

function mockThumbnailObjectUrls() {
	let objectUrlIndex = 0;

	Object.defineProperty(URL, "createObjectURL", {
		configurable: true,
		value: vi.fn(() => {
			objectUrlIndex += 1;
			return `blob:thumbnail-${objectUrlIndex}`;
		}),
	});
	Object.defineProperty(URL, "revokeObjectURL", {
		configurable: true,
		value: vi.fn(),
	});
}

describe("video strip thumbnail generation", () => {
	it("creates evenly spaced thumbnail timestamps", () => {
		expect(
			createVideoStripThumbnailTimestamps({
				endTimestamp: 8,
				firstTimestamp: 1,
				thumbnailCount: 4,
			}),
		).toEqual([1, 2.75, 4.5, 6.25]);
	});

	it("scales thumbnail dimensions for device pixels", () => {
		expect(
			createVideoStripThumbnailDimensions({
				devicePixelRatio: 2,
				displayHeight: 1080,
				displayWidth: 1920,
				thumbnailHeightPx: 54,
			}),
		).toEqual({
			cssHeightPx: 54,
			cssWidthPx: 96,
			deviceHeightPx: 108,
			deviceWidthPx: 192,
		});
	});

	it("creates viewport-based thumbnail windows that get denser with track zoom", () => {
		const overviewWindow = createVideoStripThumbnailWindow({
			assetDurationUs: 7_200_000_000,
			frameDurationUs: 33_333,
			viewport: {
				scrollLeftPx: 0,
				trackWidthPx: 1_200,
				viewportWidthPx: 1_200,
			},
		});
		const zoomedWindow = createVideoStripThumbnailWindow({
			assetDurationUs: 7_200_000_000,
			frameDurationUs: 33_333,
			viewport: {
				scrollLeftPx: 4_200,
				trackWidthPx: 9_600,
				viewportWidthPx: 1_200,
			},
		});

		expect(overviewWindow?.timestampsUs.length).toBeLessThan(32);
		expect(zoomedWindow?.frameStepUs).toBeLessThan(
			overviewWindow?.frameStepUs ?? 0,
		);
		expect(zoomedWindow?.visibleStartUs).toBe(3_150_000_000);
		expect(zoomedWindow?.timestampsUs[0]).toBeLessThan(
			zoomedWindow?.visibleStartUs ?? 0,
		);
	});

	it("keeps loaded thumbnails when viewport jitter stays inside the overscanned window", async () => {
		mockThumbnailObjectUrls();
		const source = new Blob(["video"], { type: "video/mp4" });
		const initialWindow = createVideoStripThumbnailWindow({
			assetDurationUs: readyAsset.durationUs,
			frameDurationUs: readyAsset.frameTiming.frameDurationUs,
			viewport: {
				scrollLeftPx: 0,
				trackWidthPx: 1_280,
				viewportWidthPx: 640,
			},
		});
		const jitteredWindow = createVideoStripThumbnailWindow({
			assetDurationUs: readyAsset.durationUs,
			frameDurationUs: readyAsset.frameTiming.frameDurationUs,
			viewport: {
				scrollLeftPx: 0,
				trackWidthPx: 1_250,
				viewportWidthPx: 625,
			},
		});
		const videoStripThumbnailLoader = vi.fn<VideoStripThumbnailLoader>(
			async ({ timestampsUs }) => ({
				frames: timestampsUs.slice(0, 3).map((timestampUs, index) => ({
					imageBlob: new Blob([`thumbnail-${timestampUs}-${index}`], {
						type: "image/jpeg",
					}),
					index,
					timestampUs,
				})),
				status: "ready",
				thumbnailHeightPx: 54,
				thumbnailWidthPx: 96,
			}),
		);

		if (!initialWindow || !jitteredWindow) {
			throw new Error("Expected thumbnail windows.");
		}
		expect(jitteredWindow.key).not.toBe(initialWindow.key);

		const view = render(
			createElement(VideoStripThumbnailProbe, {
				asset: readyAsset,
				source,
				thumbnailWindow: initialWindow,
				videoStripThumbnailLoader,
			}),
		);

		await waitFor(() => {
			expect(videoStripThumbnailLoader).toHaveBeenCalledTimes(1);
			expect(screenText("video strip status")).toBe("ready:3");
		});

		view.rerender(
			createElement(VideoStripThumbnailProbe, {
				asset: readyAsset,
				source,
				thumbnailWindow: jitteredWindow,
				videoStripThumbnailLoader,
			}),
		);

		await new Promise((resolve) => setTimeout(resolve, 30));

		expect(videoStripThumbnailLoader).toHaveBeenCalledTimes(1);
		expect(screenText("video strip status")).toBe("ready:3");
	});

	it("extracts video thumbnails through Mediabunny CanvasSink", async () => {
		mediabunnyMock.canvases = [
			createWrappedCanvas(1),
			createWrappedCanvas(2.75),
			createWrappedCanvas(4.5),
			createWrappedCanvas(6.25),
		];

		const result = await loadBrowserVideoStripThumbnails({
			assetDurationUs: 8_000_000,
			devicePixelRatio: 2,
			source: new Blob(["video"], { type: "video/mp4" }),
			thumbnailHeightPx: 54,
			timestampsUs: [1_000_000, 2_750_000, 4_500_000, 6_250_000],
		});

		expect(result.status).toBe("ready");
		if (result.status !== "ready") {
			throw new Error("Expected ready thumbnail result.");
		}
		expect(result.thumbnailHeightPx).toBe(54);
		expect(result.thumbnailWidthPx).toBe(96);
		expect(result.frames.map((frame) => frame.timestampUs)).toEqual([
			1_000_000, 2_750_000, 4_500_000, 6_250_000,
		]);
		expect(mediabunnyMock.timestamps).toEqual([1, 2.75, 4.5, 6.25]);
		expect(mediabunnyMock.sinkOptions[0]).toEqual({
			fit: "cover",
			height: 108,
			poolSize: 1,
			width: 192,
		});
		expect(mediabunnyMock.inputInstances[0]?.dispose).toHaveBeenCalledTimes(1);
	});

	it("publishes thumbnail frames progressively as they are encoded", async () => {
		mediabunnyMock.canvases = [
			createWrappedCanvas(1),
			createWrappedCanvas(2.75),
			createWrappedCanvas(4.5),
			createWrappedCanvas(6.25),
		];
		const progress = vi.fn();

		const result = await loadVideoStripThumbnailsOnCurrentThread({
			assetDurationUs: 8_000_000,
			devicePixelRatio: 2,
			onFrame: progress,
			source: new Blob(["video"], { type: "video/mp4" }),
			thumbnailHeightPx: 54,
			timestampsUs: [1_000_000, 2_750_000, 4_500_000, 6_250_000],
		});

		expect(result.status).toBe("ready");
		expect(progress).toHaveBeenCalledTimes(4);
		expect(progress.mock.calls.map(([call]) => call.frame.timestampUs)).toEqual(
			[1_000_000, 2_750_000, 4_500_000, 6_250_000],
		);
		expect(progress.mock.calls[0]?.[0]).toMatchObject({
			thumbnailCount: 4,
			thumbnailHeightPx: 54,
			thumbnailWidthPx: 96,
		});
	});

	it("caches decoded thumbnail frames for the same source and dimensions", async () => {
		vi.stubGlobal("Worker", undefined);
		const source = new Blob(["video"], { type: "video/mp4" });
		mediabunnyMock.canvases = [
			createWrappedCanvas(1),
			createWrappedCanvas(2.75),
			createWrappedCanvas(4.5),
			createWrappedCanvas(6.25),
		];

		const firstResult = await loadBrowserVideoStripThumbnails({
			assetDurationUs: 8_000_000,
			devicePixelRatio: 2,
			source,
			thumbnailHeightPx: 54,
			timestampsUs: [1_000_000, 2_750_000, 4_500_000, 6_250_000],
		});
		const secondResult = await loadBrowserVideoStripThumbnails({
			assetDurationUs: 8_000_000,
			devicePixelRatio: 2,
			source,
			thumbnailHeightPx: 54,
			timestampsUs: [1_000_000, 2_750_000, 4_500_000, 6_250_000],
		});

		expect(firstResult.status).toBe("ready");
		expect(secondResult.status).toBe("ready");
		if (secondResult.status !== "ready") {
			throw new Error("Expected ready cached thumbnail result.");
		}
		expect(secondResult.frames.map((frame) => frame.timestampUs)).toEqual([
			1_000_000, 2_750_000, 4_500_000, 6_250_000,
		]);
		expect(mediabunnyMock.inputInstances).toHaveLength(1);
	});

	it("accepts Mediabunny video tracks that expose deprecated metadata properties", async () => {
		mediabunnyMock.primaryVideoTrack = createLegacyVideoTrack();
		mediabunnyMock.canvases = [
			createWrappedCanvas(1),
			createWrappedCanvas(2.75),
			createWrappedCanvas(4.5),
			createWrappedCanvas(6.25),
		];

		const result = await loadBrowserVideoStripThumbnails({
			assetDurationUs: 8_000_000,
			devicePixelRatio: 2,
			source: new Blob(["video"], { type: "video/mp4" }),
			thumbnailHeightPx: 54,
			timestampsUs: [1_000_000, 2_750_000, 4_500_000, 6_250_000],
		});

		expect(result.status).toBe("ready");
		if (result.status !== "ready") {
			throw new Error("Expected ready thumbnail result.");
		}
		expect(result.frames).toHaveLength(4);
		expect(mediabunnyMock.sinkOptions[0]).toEqual({
			fit: "cover",
			height: 108,
			poolSize: 1,
			width: 192,
		});
	});

	it("returns unavailable when there is no decodable video track", async () => {
		mediabunnyMock.primaryVideoTrack = null;

		const result = await loadBrowserVideoStripThumbnails({
			assetDurationUs: 8_000_000,
			devicePixelRatio: 1,
			source: new Blob(["audio"], { type: "audio/aac" }),
			thumbnailHeightPx: 54,
			timestampsUs: [1_000_000, 2_750_000, 4_500_000, 6_250_000],
		});

		expect(result).toEqual({
			reason: "The active media asset has no video track.",
			status: "unavailable",
		});
		expect(mediabunnyMock.inputInstances[0]?.dispose).toHaveBeenCalledTimes(1);
	});
});

type MockVideoTrack = {
	canDecode: ReturnType<typeof vi.fn>;
	computeDuration: ReturnType<typeof vi.fn>;
	codec?: string | null;
	displayHeight?: number;
	displayWidth?: number;
	getCodec?: ReturnType<typeof vi.fn>;
	getDisplayHeight?: ReturnType<typeof vi.fn>;
	getDisplayWidth?: ReturnType<typeof vi.fn>;
	getFirstTimestamp: ReturnType<typeof vi.fn>;
};

function createVideoTrack(): MockVideoTrack {
	return {
		canDecode: vi.fn(async () => true),
		computeDuration: vi.fn(async () => 8),
		getCodec: vi.fn(async () => "avc"),
		getDisplayHeight: vi.fn(async () => 1080),
		getDisplayWidth: vi.fn(async () => 1920),
		getFirstTimestamp: vi.fn(async () => 1),
	};
}

function createLegacyVideoTrack(): MockVideoTrack {
	return {
		canDecode: vi.fn(async () => true),
		codec: "avc",
		computeDuration: vi.fn(async () => 8),
		displayHeight: 1080,
		displayWidth: 1920,
		getFirstTimestamp: vi.fn(async () => 1),
	};
}

function createWrappedCanvas(timestamp: number) {
	const imageBlob = new Blob([`frame-${timestamp}`], { type: "image/jpeg" });

	return {
		canvas: {
			toBlob: vi.fn((callback: BlobCallback) => callback(imageBlob)),
		} as unknown as HTMLCanvasElement,
		duration: 0.5,
		timestamp,
	};
}
