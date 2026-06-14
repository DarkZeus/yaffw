import type { CSSProperties, ReactEventHandler, RefObject } from "react";

import type { MediaTimeUs, ReadyMediaAsset } from "@/editor-core/model";

export type PreviewViewerRegionProps = {
	asset: ReadyMediaAsset;
	canFullscreen: boolean;
	isPlaying: boolean;
	multitrackContainerRef: RefObject<HTMLDivElement | null>;
	onEnded: ReactEventHandler<HTMLVideoElement>;
	onNativePause: ReactEventHandler<HTMLVideoElement>;
	onNativePlay: ReactEventHandler<HTMLVideoElement>;
	onRequestFullscreen: () => void;
	onSyncPlayhead: ReactEventHandler<HTMLVideoElement>;
	playbackRate: number;
	playheadUs: MediaTimeUs;
	previewApertureStyle: CSSProperties;
	previewPosterSrc?: string;
	previewSurfaceRef: RefObject<HTMLElement | null>;
	previewUrl: string;
	videoRef: RefObject<HTMLVideoElement | null>;
};
