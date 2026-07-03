import type { RefObject } from "react";

import type { AudioMix, MediaTimeUs } from "@/editor-core/model";

import type {
	CreatePreviewAudioEngineOptions,
	PreviewAudioEngine,
} from "./preview-audio-engine";
import type { BrowserAudioPreviewSourcesState } from "./use-browser-audio-preview-sources.types";

export type PreviewAudioEngineFactory = (
	options: CreatePreviewAudioEngineOptions,
) => Promise<PreviewAudioEngine>;

export type PreviewAudioMonitoringStatus =
	| "degraded"
	| "failed"
	| "idle"
	| "preparing"
	| "ready";

export type UsePreviewAudioMonitoringLifecycleOptions = {
	audioMix: AudioMix;
	audioPreviewSources: BrowserAudioPreviewSourcesState;
	createPreviewAudioEngine?: PreviewAudioEngineFactory;
	getPlaybackRate: () => number;
	getPlayheadUs: () => MediaTimeUs;
	previewAudioEngineRef?: RefObject<PreviewAudioEngine | null>;
	muted: boolean;
	onReadyChange?: (ready: boolean) => void;
	onStatusChange?: (status: PreviewAudioMonitoringStatus) => void;
	soloedAudioTrackId?: string | null;
	volume: number;
};

export type PreviewAudioMonitoringLifecycle = {
	previewAudioEngineRef: RefObject<PreviewAudioEngine | null>;
	ready: boolean;
	status: PreviewAudioMonitoringStatus;
};
