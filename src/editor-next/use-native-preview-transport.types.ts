import type { RefObject } from "react";
import type MultiTrack from "wavesurfer-multitrack";

import type { MediaTimeUs, Selection } from "@/editor-core/model";

export type UseNativePreviewTransportOptions = {
	audioTransportReady: boolean;
	durationUs: MediaTimeUs;
	frameDurationUs: MediaTimeUs;
	multitrackRef: RefObject<MultiTrack | null>;
	selection: Selection;
	source: Blob;
	videoRef: RefObject<HTMLVideoElement | null>;
};
