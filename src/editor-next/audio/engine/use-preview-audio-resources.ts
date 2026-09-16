import type { ReadyMediaAsset } from "@/editor-core/model";
import { useEffect, useRef, useState } from "react";
import type { ActiveMediaAssetCleanupScope } from "../../media-work/scopes/active-media-asset-cleanup-scope";
import type {
	PreviewAudioResource,
	PreviewAudioResourceFailure,
} from "../types/preview-audio-resources.types";
import type { MediaWindowProvider } from "./media-window-provider";
import { preparePreviewAudioResources } from "./preview-audio-resources";

export type PreviewAudioResourcesState =
	| { status: "disabled" }
	| {
			status: "loading";
			preparingTrackIds: ReadonlySet<string>;
			resources: PreviewAudioResource[];
	  }
	| {
			status: "ready";
			provider: MediaWindowProvider;
			resources: PreviewAudioResource[];
			failures: PreviewAudioResourceFailure[];
	  }
	| {
			status: "failed";
			failures: PreviewAudioResourceFailure[];
			reason: string;
	  };
export type PreviewAudioResourcesLifecycle = PreviewAudioResourcesState;
export type UsePreviewAudioResourcesOptions = {
	activeMediaAssetCleanupScope?: ActiveMediaAssetCleanupScope;
	asset: ReadyMediaAsset;
	enabled: boolean;
	source: Blob;
};

export function usePreviewAudioResources({
	activeMediaAssetCleanupScope,
	asset,
	enabled,
	source,
}: UsePreviewAudioResourcesOptions): PreviewAudioResourcesLifecycle {
	const assetRef = useRef(asset);
	assetRef.current = asset;
	const assetId = asset.id;
	const [state, setState] = useState<PreviewAudioResourcesState>({
		status: "disabled",
	});
	useEffect(() => {
		const asset = assetRef.current;
		if (asset.id !== assetId) return;
		if (!enabled || asset.tracks.audio.length === 0) {
			setState({ status: "disabled" });
			return;
		}
		const controller = new AbortController();
		let provider: MediaWindowProvider | null = null;
		let released = false;
		const release = () => {
			if (released) return;
			released = true;
			controller.abort();
			if (provider) releaseProvider(provider);
			provider = null;
		};
		const registration = activeMediaAssetCleanupScope?.registerCleanup(release);
		setState({
			status: "loading",
			preparingTrackIds: new Set(asset.tracks.audio.map((track) => track.id)),
			resources: [],
		});
		void preparePreviewAudioResources({
			asset,
			signal: controller.signal,
			source,
		})
			.then((result) => {
				if (
					released ||
					(activeMediaAssetCleanupScope &&
						!activeMediaAssetCleanupScope.isCurrent())
				) {
					releaseProvider(result.provider);
					return;
				}
				provider = result.provider;
				setState({ status: "ready", ...result });
			})
			.catch((error: unknown) => {
				if (released) return;
				const reason = error instanceof Error ? error.message : String(error);
				setState({
					status: "failed",
					reason,
					failures: asset.tracks.audio.map((track, trackIndex) => ({
						reason,
						track,
						trackIndex,
						trackId: track.id,
					})),
				});
			});
		return () => {
			registration?.dispose();
			release();
		};
	}, [activeMediaAssetCleanupScope, assetId, enabled, source]);
	return state;
}

function releaseProvider(provider: MediaWindowProvider) {
	void provider.dispose().catch((error: unknown) => {
		console.error("Preview audio provider cleanup failed.", error);
	});
}
