import type { RefObject } from "react";
import type MultiTrack from "wavesurfer-multitrack";

import type { AudioMix, MediaTimeUs } from "@/editor-core/model";

import type { BrowserAudioPreviewSourcesState } from "./use-browser-audio-preview-sources.types";

export type UsePreviewAudioMonitoringLifecycleOptions = {
	audioMix: AudioMix;
	audioPreviewSources: BrowserAudioPreviewSourcesState;
	getPlaybackRate: () => number;
	getPlayheadUs: () => MediaTimeUs;
	multitrackContainerRef?: RefObject<HTMLDivElement | null>;
	multitrackRef?: RefObject<MultiTrack | null>;
	muted: boolean;
	onReadyChange?: (ready: boolean) => void;
	soloedAudioTrackId?: string | null;
	volume: number;
};

export type PreviewAudioMonitoringLifecycle = {
	multitrackContainerRef: RefObject<HTMLDivElement | null>;
	multitrackRef: RefObject<MultiTrack | null>;
	ready: boolean;
};
