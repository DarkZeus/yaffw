import type { MediaTimeUs, ReadyMediaAsset } from "@/editor-core/model";

export type VideoStripThumbnailLoader = (
	request: VideoStripThumbnailRequest,
) => Promise<VideoStripThumbnailResult>;

export type VideoStripThumbnailRequest = {
	assetDurationUs: MediaTimeUs;
	devicePixelRatio: number;
	onFrame?: (progress: VideoStripThumbnailProgress) => void;
	signal?: AbortSignal;
	source: Blob;
	thumbnailHeightPx: number;
	timestampsUs: MediaTimeUs[];
};

export type VideoStripThumbnailFrame = {
	imageBlob: Blob;
	index: number;
	timestampUs: MediaTimeUs;
};

export type VideoStripThumbnailProgress = {
	frame: VideoStripThumbnailFrame;
	thumbnailCount: number;
	thumbnailHeightPx: number;
	thumbnailWidthPx: number;
};

export type VideoStripThumbnailResult =
	| {
			frames: VideoStripThumbnailFrame[];
			status: "ready";
			thumbnailHeightPx: number;
			thumbnailWidthPx: number;
	  }
	| {
			reason: string;
			status: "unavailable";
	  };

export type VideoStripThumbnailState =
	| {
			frameStepUs?: MediaTimeUs;
			frames: VideoStripThumbnailViewFrame[];
			status: "loading";
			thumbnailCount?: number;
			thumbnailHeightPx?: number;
			thumbnailWidthPx?: number;
			timestampsUs?: MediaTimeUs[];
	  }
	| {
			reason: string;
			status: "unavailable";
	  }
	| {
			frameStepUs: MediaTimeUs;
			frames: VideoStripThumbnailViewFrame[];
			status: "ready";
			thumbnailHeightPx: number;
			thumbnailWidthPx: number;
			timestampsUs: MediaTimeUs[];
	  };

export type VideoStripThumbnailViewFrame = {
	index: number;
	timestampUs: MediaTimeUs;
	url: string;
};

export type UseVideoStripThumbnailsOptions = {
	asset: ReadyMediaAsset;
	source: Blob;
	thumbnailWindow: VideoStripThumbnailWindow | null;
	videoStripThumbnailLoader: VideoStripThumbnailLoader;
};

export type VideoStripThumbnailViewport = {
	scrollLeftPx: number;
	trackWidthPx: number;
	viewportWidthPx: number;
};

export type VideoStripThumbnailWindow = {
	frameStepUs: MediaTimeUs;
	key: string;
	timestampsUs: MediaTimeUs[];
	visibleEndUs: MediaTimeUs;
	visibleStartUs: MediaTimeUs;
	windowEndUs: MediaTimeUs;
	windowStartUs: MediaTimeUs;
};
