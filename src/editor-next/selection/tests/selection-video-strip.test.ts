/* @vitest-environment jsdom */

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReadyMediaAsset } from "@/editor-core/model";
import {
	type ActiveMediaAssetCleanupScope,
	createActiveMediaAssetCleanupScopeController,
} from "../../media-work/scopes/active-media-asset-cleanup-scope";
import type {
	VideoStripThumbnailLoader,
	VideoStripThumbnailResult,
} from "../types/selection-video-strip.types";
import {
	type VideoStripThumbnailWindow,
	clearVideoStripThumbnailCache,
	createVideoStripThumbnailWindow,
	loadBrowserVideoStripThumbnails,
} from "../video-strip/selection-video-strip";
import { useVideoStripThumbnails } from "../video-strip/use-video-strip-thumbnails";

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
		BlobSource: vi.fn().mockImplementation(function (blob: Blob) {
			return { blob };
		}),
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
	activeMediaAssetCleanupScope,
	asset,
	source,
	thumbnailWindow,
	videoStripThumbnailLoader,
}: {
	activeMediaAssetCleanupScope?: ActiveMediaAssetCleanupScope;
	asset: ReadyMediaAsset;
	source: Blob;
	thumbnailWindow: VideoStripThumbnailWindow | null;
	videoStripThumbnailLoader: VideoStripThumbnailLoader;
}) {
	const state = useVideoStripThumbnails({
		activeMediaAssetCleanupScope,
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

	it("retires viewport requests, replaces changed final frames, and ignores late progress", async () => {
		mockThumbnailObjectUrls();
		const scope =
			createActiveMediaAssetCleanupScopeController().replaceCurrentScope(
				readyAsset.id,
			);
		const first = deferredThumbnails();
		const second = deferredThumbnails();
		const loader = vi
			.fn<VideoStripThumbnailLoader>()
			.mockReturnValueOnce(first.promise)
			.mockReturnValueOnce(second.promise);
		const source = new Blob(["video"]);
		const requestWindow = (trackWidthPx: number) =>
			createVideoStripThumbnailWindow({
				assetDurationUs: readyAsset.durationUs,
				viewport: { scrollLeftPx: 0, trackWidthPx, viewportWidthPx: 640 },
			});
		const initialWindow = requestWindow(640);
		const zoomedWindow = requestWindow(3_840);
		const probe = (thumbnailWindow: VideoStripThumbnailWindow | null) =>
			createElement(VideoStripThumbnailProbe, {
				asset: readyAsset,
				source,
				thumbnailWindow,
				videoStripThumbnailLoader: loader,
				activeMediaAssetCleanupScope: scope,
			});
		const view = render(probe(initialWindow));
		await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
		const original = loader.mock.calls[0][0];
		const firstFrame = {
			index: 0,
			timestampUs: original.timestampsUs[0],
			imageBlob: new Blob(["old partial"]),
		};
		act(() =>
			original.onFrame?.({
				frame: firstFrame,
				...frameDimensions,
				thumbnailCount: original.timestampsUs.length,
			}),
		);
		expect(screenText("video strip status")).toBe("loading:1");

		view.rerender(probe(zoomedWindow));
		await waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
		expect(original.signal?.aborted).toBe(true);
		expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:thumbnail-1");
		expect(screenText("video strip status")).toBe("loading:0");

		const active = loader.mock.calls[1][0];
		const partial = {
			index: 0,
			timestampUs: active.timestampsUs[0],
			imageBlob: new Blob(["active partial"]),
		};
		const final = { ...partial, imageBlob: new Blob(["active final"]) };
		act(() =>
			active.onFrame?.({
				frame: partial,
				...frameDimensions,
				thumbnailCount: active.timestampsUs.length,
			}),
		);
		expect(screenText("video strip status")).toBe("loading:1");
		await act(async () => {
			original.onFrame?.({
				frame: firstFrame,
				...frameDimensions,
				thumbnailCount: original.timestampsUs.length,
			});
			first.resolve({
				frames: [firstFrame],
				...frameDimensions,
				status: "ready",
			});
			second.resolve({ frames: [final], ...frameDimensions, status: "ready" });
		});
		expect(screenText("video strip status")).toBe("ready:1");
		expect(URL.createObjectURL).toHaveBeenLastCalledWith(final.imageBlob);
		expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:thumbnail-2");
		act(() =>
			active.onFrame?.({
				frame: partial,
				...frameDimensions,
				thumbnailCount: active.timestampsUs.length,
			}),
		);
		expect(screenText("video strip status")).toBe("ready:1");
		expect(URL.createObjectURL).toHaveBeenCalledTimes(3);

		scope.dispose();
		expect(active.signal?.aborted).toBe(true);
		expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:thumbnail-3");
		view.unmount();
		expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);
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
		const onFrame = vi.fn();
		const secondResult = await loadBrowserVideoStripThumbnails({
			assetDurationUs: 8_000_000,
			devicePixelRatio: 2,
			onFrame,
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
		expect(onFrame).toHaveBeenCalledTimes(4);
	});

	it("disposes main-thread decoding as soon as its viewport request aborts", async () => {
		vi.stubGlobal("Worker", undefined);
		const controller = new AbortController();
		let finishImage: BlobCallback | undefined;
		const frame = createWrappedCanvas(1);
		mediabunnyMock.canvases = [frame];
		vi.mocked(frame.canvas.toBlob).mockImplementation((callback) => {
			finishImage = callback;
		});
		const onFrame = vi.fn();
		const result = loadBrowserVideoStripThumbnails({
			assetDurationUs: 8_000_000,
			devicePixelRatio: 1,
			onFrame,
			signal: controller.signal,
			source: new Blob(["video"]),
			thumbnailHeightPx: 54,
			timestampsUs: [1_000_000],
		});
		await waitFor(() => expect(finishImage).toBeTypeOf("function"));
		controller.abort();
		expect(mediabunnyMock.inputInstances[0]?.dispose).toHaveBeenCalledTimes(1);
		finishImage?.(new Blob(["late image"]));
		await expect(result).rejects.toMatchObject({ name: "AbortError" });
		expect(onFrame).not.toHaveBeenCalled();
		expect(mediabunnyMock.inputInstances[0]?.dispose).toHaveBeenCalledTimes(1);
	});
});

type MockVideoTrack = {
	canDecode: ReturnType<typeof vi.fn>;
	computeDuration: ReturnType<typeof vi.fn>;
	getCodec: ReturnType<typeof vi.fn>;
	getDisplayHeight: ReturnType<typeof vi.fn>;
	getDisplayWidth: ReturnType<typeof vi.fn>;
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

const frameDimensions = { thumbnailHeightPx: 54, thumbnailWidthPx: 96 };

function deferredThumbnails() {
	let resolve: (result: VideoStripThumbnailResult) => void = () => {};
	const promise = new Promise<VideoStripThumbnailResult>((onResolve) => {
		resolve = onResolve;
	});
	return { promise, resolve };
}
