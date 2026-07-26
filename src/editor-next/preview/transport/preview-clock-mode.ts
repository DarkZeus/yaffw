import type { ReadyMediaAsset } from "@/editor-core/model";

import type { PreviewAudioResourcesState } from "../../audio/engine/use-preview-audio-resources";

export type PreviewClockMode =
	| "audio-master"
	| "audio-master-pending"
	| "native-video";

export function resolvePreviewClockMode({
	asset,
	audioMonitoringFailed = false,
	audioMonitoringReady,
	previewAudioResources,
	audioPreviewTransportSupported,
}: {
	asset: ReadyMediaAsset;
	audioMonitoringFailed?: boolean;
	audioMonitoringReady: boolean;
	previewAudioResources: PreviewAudioResourcesState;
	audioPreviewTransportSupported: boolean;
}): PreviewClockMode {
	if (asset.tracks.audio.length === 0 || !audioPreviewTransportSupported) {
		return "native-video";
	}

	if (previewAudioResources.status === "failed") {
		return "native-video";
	}

	if (audioMonitoringFailed) {
		return "native-video";
	}

	if (
		previewAudioResources.status === "ready" &&
		previewAudioResources.resources.length > 0 &&
		audioMonitoringReady
	) {
		return "audio-master";
	}

	return "audio-master-pending";
}
