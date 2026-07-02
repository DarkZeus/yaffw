import type { ReadyMediaAsset } from "@/editor-core/model";

import type { BrowserAudioPreviewSourcesState } from "./use-browser-audio-preview-sources.types";

export type PreviewClockMode =
	| "audio-master"
	| "audio-master-pending"
	| "native-video";

export function resolvePreviewClockMode({
	asset,
	audioMonitoringReady,
	audioPreviewSources,
	audioPreviewTransportSupported,
}: {
	asset: ReadyMediaAsset;
	audioMonitoringReady: boolean;
	audioPreviewSources: BrowserAudioPreviewSourcesState;
	audioPreviewTransportSupported: boolean;
}): PreviewClockMode {
	if (asset.tracks.audio.length === 0 || !audioPreviewTransportSupported) {
		return "native-video";
	}

	if (audioPreviewSources.status === "failed") {
		return "native-video";
	}

	if (
		audioPreviewSources.status === "ready" &&
		audioPreviewSources.sources.length > 0 &&
		audioMonitoringReady
	) {
		return "audio-master";
	}

	return "audio-master-pending";
}
