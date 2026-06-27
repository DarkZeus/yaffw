import type { RefObject } from "react";
import type MultiTrack from "wavesurfer-multitrack";

import type { MediaTimeUs, Selection } from "@/editor-core/model";

export type PreviewMediaTransportHandle = {
	currentTime: number;
	muted: boolean;
	pause: () => Promise<void> | void;
	play: () => Promise<void>;
	playbackRate: number;
	volume: number;
};

export type UseNativePreviewTransportOptions = {
	audioTransportReady: boolean;
	durationUs: MediaTimeUs;
	frameDurationUs: MediaTimeUs;
	multitrackRef: RefObject<MultiTrack | null>;
	selection: Selection;
	source: Blob;
	videoRef: RefObject<PreviewMediaTransportHandle | null>;
};
