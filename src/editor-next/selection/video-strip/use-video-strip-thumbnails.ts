import { useLayoutEffect, useState } from "react";
import type { ReadyMediaAsset } from "@/editor-core/model";
import { errorMessage } from "@/lib/error-message";
import type { ActiveMediaAssetCleanupScope } from "../../media-work/scopes/active-media-asset-cleanup-scope";
import type {
	VideoStripThumbnailFrame,
	VideoStripThumbnailLoader,
	VideoStripThumbnailProgress,
	VideoStripThumbnailState,
} from "../types/selection-video-strip.types";
import type { VideoStripThumbnailWindow } from "./selection-video-strip";
import { VIDEO_STRIP_THUMBNAIL_HEIGHT_PX } from "./selection-video-strip-loader";

type ThumbnailRequestOptions = {
	activeMediaAssetCleanupScope?: ActiveMediaAssetCleanupScope;
	asset: ReadyMediaAsset;
	source: Blob;
	thumbnailWindow: VideoStripThumbnailWindow | null;
	videoStripThumbnailLoader: VideoStripThumbnailLoader;
};

function createRequest(options: ThumbnailRequestOptions) {
	const window = options.thumbnailWindow;
	const initialState: VideoStripThumbnailState =
		options.asset.tracks.video.length === 0
			? {
					status: "unavailable",
					reason: "The active media asset has no video track.",
				}
			: {
					status: "loading",
					frames: [],
					frameStepUs: window?.frameStepUs,
					thumbnailCount: window?.timestampsUs.length ?? 0,
					thumbnailHeightPx: VIDEO_STRIP_THUMBNAIL_HEIGHT_PX,
					timestampsUs: window?.timestampsUs ?? [],
				};
	return { ...options, initialState };
}

export function useVideoStripThumbnails(
	options: ThumbnailRequestOptions,
): VideoStripThumbnailState {
	const [request, setRequest] = useState(() => createRequest(options));
	const [published, setPublished] = useState<{
		request: typeof request;
		state: VideoStripThumbnailState;
	} | null>(null);

	if (
		request.asset !== options.asset ||
		request.source !== options.source ||
		request.videoStripThumbnailLoader !== options.videoStripThumbnailLoader ||
		request.activeMediaAssetCleanupScope !==
			options.activeMediaAssetCleanupScope ||
		shouldReplaceVideoStripThumbnailRequestWindow(
			request.thumbnailWindow,
			options.thumbnailWindow,
		)
	) {
		// Use render state so an interrupted render cannot replace the committed request.
		setRequest(createRequest(options));
	}

	useLayoutEffect(() => {
		const window = request.thumbnailWindow;
		if (
			!window?.timestampsUs.length ||
			request.initialState.status !== "loading"
		)
			return;

		const controller = new AbortController();
		let status: "loading" | "settled" | "retired" = "loading";
		const images = new Map<number, ReturnType<typeof createThumbnailImage>>();

		function publish(state: VideoStripThumbnailState) {
			setPublished({ request, state });
		}

		function releaseImage(index: number) {
			const image = images.get(index);
			if (!image) return;
			images.delete(index);
			image.dispose();
		}

		function releaseImages() {
			for (const index of images.keys()) releaseImage(index);
		}

		function viewFrame(frame: VideoStripThumbnailFrame) {
			const existing = images.get(frame.index);
			if (
				existing?.blob === frame.imageBlob &&
				existing.frame.timestampUs === frame.timestampUs
			) {
				return existing.frame;
			}
			const image = createThumbnailImage(frame);
			releaseImage(frame.index);
			images.set(frame.index, image);
			return image.frame;
		}

		function retire() {
			if (status === "retired") return;
			status = "retired";
			controller.abort();
			releaseImages();
		}

		function unavailable(reason: string) {
			status = "settled";
			releaseImages();
			publish({ status: "unavailable", reason });
		}

		function onFrame(progress: VideoStripThumbnailProgress) {
			if (status !== "loading") return;
			try {
				viewFrame(progress.frame);
				publish({
					status: "loading",
					frames: Array.from(images.values(), (image) => image.frame).sort(
						(left, right) => left.index - right.index,
					),
					frameStepUs: window?.frameStepUs,
					thumbnailCount: progress.thumbnailCount,
					thumbnailHeightPx: progress.thumbnailHeightPx,
					thumbnailWidthPx: progress.thumbnailWidthPx,
					timestampsUs: window?.timestampsUs,
				});
			} catch (error) {
				unavailable(errorMessage(error));
				controller.abort();
			}
		}

		const registration =
			request.activeMediaAssetCleanupScope?.registerCleanup(retire);
		// A new layout measurement can replace this request before decoding starts.
		queueMicrotask(() => {
			void load(window);
		});

		async function load(window: VideoStripThumbnailWindow) {
			if (status !== "loading") return;
			try {
				const result = await request.videoStripThumbnailLoader({
					assetDurationUs: request.asset.durationUs,
					devicePixelRatio: globalThis.devicePixelRatio || 1,
					onFrame,
					signal: controller.signal,
					source: request.source,
					thumbnailHeightPx: VIDEO_STRIP_THUMBNAIL_HEIGHT_PX,
					timestampsUs: window.timestampsUs,
				});
				if (status !== "loading") return;
				if (result.status === "unavailable") {
					unavailable(result.reason);
					return;
				}

				const finalIndexes = new Set(result.frames.map((frame) => frame.index));
				for (const index of images.keys()) {
					if (!finalIndexes.has(index)) releaseImage(index);
				}
				const frames = result.frames.map(viewFrame);
				status = "settled";
				publish({
					...result,
					frames,
					frameStepUs: window.frameStepUs,
					timestampsUs: window.timestampsUs,
				});
			} catch (error) {
				if (status === "loading") unavailable(errorMessage(error));
			}
		}

		return registration ? registration.dispose : retire;
	}, [request]);

	return published?.request === request
		? published.state
		: request.initialState;
}

function createThumbnailImage(frame: VideoStripThumbnailFrame) {
	const url = URL.createObjectURL(frame.imageBlob);
	return {
		blob: frame.imageBlob,
		frame: { index: frame.index, timestampUs: frame.timestampUs, url },
		dispose: () => URL.revokeObjectURL(url),
	};
}

function shouldReplaceVideoStripThumbnailRequestWindow(
	currentWindow: VideoStripThumbnailWindow | null,
	nextWindow: VideoStripThumbnailWindow | null,
) {
	if (currentWindow === nextWindow) {
		return false;
	}

	if (!currentWindow || !nextWindow) {
		return currentWindow !== nextWindow;
	}

	if (currentWindow.key === nextWindow.key) {
		return false;
	}

	if (currentWindow.assetDurationUs !== nextWindow.assetDurationUs) {
		return true;
	}

	const currentFrameStepUs = Math.max(1, currentWindow.frameStepUs);
	const nextFrameStepUs = Math.max(1, nextWindow.frameStepUs);
	const frameStepDeltaRatio =
		Math.abs(currentFrameStepUs - nextFrameStepUs) /
		Math.max(currentFrameStepUs, nextFrameStepUs);

	if (frameStepDeltaRatio > 0.12) {
		return true;
	}

	const coveragePaddingUs = Math.max(currentFrameStepUs, nextFrameStepUs);

	return (
		nextWindow.visibleStartUs <
			currentWindow.windowStartUs - coveragePaddingUs ||
		nextWindow.visibleEndUs > currentWindow.windowEndUs + coveragePaddingUs
	);
}
