import type { RefObject } from "react";

import type { MediaTimeUs, Selection } from "@/editor-core/model";

import type { PreviewAudioEngine } from "../../audio/engine/preview-audio-engine";
import type { PreviewClockMode } from "../transport/preview-clock-mode";

export type PreviewMediaTransportHandle = {
	currentTime: number;
	muted: boolean;
	pause: () => Promise<void> | void;
	play: () => Promise<void>;
	playbackRate: number;
	volume: number;
};

export type UseNativePreviewTransportOptions = {
	durationUs: MediaTimeUs;
	frameDurationUs: MediaTimeUs;
	previewAudioEngineRef: RefObject<PreviewAudioEngine | null>;
	previewClockMode: PreviewClockMode;
	selection: Selection;
	source: Blob;
	videoRef: RefObject<PreviewMediaTransportHandle | null>;
};
