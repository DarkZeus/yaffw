import type { CSSProperties, RefObject } from "react";

import type { MediaPlayerInstance } from "@vidstack/react";

import type {
	MediaTimeUs,
	ReadyMediaAsset,
	Selection,
} from "@/editor-core/model";

export type PreviewViewerRegionProps = {
	asset: ReadyMediaAsset;
	canFullscreen: boolean;
	isPlaying: boolean;
	mediaMuted: boolean;
	multitrackContainerRef: RefObject<HTMLDivElement | null>;
	onChapterSelectionRequested?: (selection: Selection) => void;
	onEnded: () => void;
	onNativePause: () => void;
	onNativePlay: () => void;
	onRequestFullscreen: () => void;
	onSyncPlayhead: () => void;
	playbackRate: number;
	playheadUs: MediaTimeUs;
	previewApertureStyle: CSSProperties;
	previewPosterSrc?: string;
	previewSourceMimeType: string;
	previewSurfaceRef: RefObject<HTMLElement | null>;
	previewUrl: string;
	videoRef: RefObject<MediaPlayerInstance | null>;
};
