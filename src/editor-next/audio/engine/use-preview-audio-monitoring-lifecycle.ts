import { type RefObject, useEffect, useEffectEvent } from "react";
import type { AudioMix, MediaTimeUs } from "@/editor-core/model";
import type { ActiveMediaAssetCleanupScope } from "../../media-work/scopes/active-media-asset-cleanup-scope";
import { createSynchronousMediaWorkScope } from "../../media-work/scopes/synchronous-media-work-scope";
import type {
	CreatePreviewAudioEngineOptions,
	PreviewAudioEngine,
} from "../types/preview-audio-engine.types";
import {
	applyPreviewAudioEngineMix,
	createPreviewAudioEngine as createDefaultPreviewAudioEngine,
} from "./preview-audio-engine";
import type { PreviewAudioResourcesState } from "./use-preview-audio-resources";

export type PreviewAudioEngineFactory = (
	options: CreatePreviewAudioEngineOptions,
) => Promise<PreviewAudioEngine>;

export type PreviewAudioMonitoringStatus =
	| "degraded"
	| "failed"
	| "idle"
	| "preparing"
	| "ready";

export type PreviewAudioMonitoringSnapshot = {
	status: PreviewAudioMonitoringStatus;
	engine: "unavailable" | "established" | "closed";
};

export type UsePreviewAudioMonitoringLifecycleOptions = {
	activeMediaAssetCleanupScope?: ActiveMediaAssetCleanupScope;
	audioMix: AudioMix;
	previewAudioResources: PreviewAudioResourcesState;
	createPreviewAudioEngine?: PreviewAudioEngineFactory;
	getPlaybackRate: () => number;
	getPlayheadUs: () => MediaTimeUs;
	previewAudioEngineRef: RefObject<PreviewAudioEngine | null>;
	muted: boolean;
	onStatusChange?: (snapshot: PreviewAudioMonitoringSnapshot) => void;
	soloedAudioTrackId?: string | null;
	volume: number;
};

export function usePreviewAudioMonitoringLifecycle({
	activeMediaAssetCleanupScope,
	audioMix,
	previewAudioResources,
	createPreviewAudioEngine = createDefaultPreviewAudioEngine,
	getPlaybackRate,
	getPlayheadUs,
	muted,
	onStatusChange,
	previewAudioEngineRef,
	soloedAudioTrackId = null,
	volume,
}: UsePreviewAudioMonitoringLifecycleOptions) {
	const readAudioControls = useEffectEvent(() => ({
		audioMix,
		muted,
		soloedAudioTrackId,
		volume,
	}));
	const reportStatus = useEffectEvent(
		(status: PreviewAudioMonitoringStatus, engine?: PreviewAudioEngine) => {
			onStatusChange?.({
				status,
				engine:
					engine?.getPlaybackState() === "closed"
						? "closed"
						: engine
							? "established"
							: "unavailable",
			});
		},
	);

	useEffect(() => {
		if (
			previewAudioResources.status !== "ready" ||
			previewAudioResources.resources.length === 0
		) {
			previewAudioEngineRef.current?.destroy();
			previewAudioEngineRef.current = null;
			reportStatus(
				previewAudioResources.status === "failed" ? "failed" : "idle",
			);
			return;
		}

		const lifecycle = createSynchronousMediaWorkScope();
		const abortController = new AbortController();
		lifecycle.registerCleanup(() => abortController.abort());
		lifecycle.registerCleanup(() => reportStatus("idle"));
		const registration = activeMediaAssetCleanupScope?.registerCleanup(() =>
			lifecycle.dispose(),
		);
		if (lifecycle.isDisposed()) return;

		function disposeMonitoring() {
			if (registration) registration.dispose();
			else lifecycle.dispose();
		}

		reportStatus("preparing");

		void createPreviewAudioEngine({
			provider: previewAudioResources.provider,
			initialTimeSeconds: getPlayheadUs() / 1_000_000,
			initialPlaybackRate: getPlaybackRate(),
			signal: abortController.signal,
			outputChannels: readAudioControls().audioMix.outputChannels,
			resources: previewAudioResources.resources,
		})
			.then((previewAudioEngine) => {
				if (lifecycle.isDisposed()) {
					previewAudioEngine.destroy();
					return;
				}

				lifecycle.registerCleanup(() => previewAudioEngine.destroy());
				previewAudioEngineRef.current = previewAudioEngine;
				lifecycle.registerCleanup(() => {
					if (previewAudioEngineRef.current === previewAudioEngine) {
						previewAudioEngineRef.current = null;
					}
				});
				lifecycle.registerCleanup(
					previewAudioEngine.subscribe(() => {
						if (!lifecycle.isDisposed()) {
							reportStatus(previewAudioEngine.getStatus(), previewAudioEngine);
						}
					}),
				);
				applyPreviewAudioEngineMix({
					...readAudioControls(),
					previewAudioEngine,
					resources: previewAudioResources.resources,
				});
				reportStatus(previewAudioEngine.getStatus(), previewAudioEngine);
			})
			.catch(() => {
				if (!lifecycle.isDisposed()) {
					disposeMonitoring();
					reportStatus("failed");
				}
			});

		return disposeMonitoring;
	}, [
		activeMediaAssetCleanupScope,
		previewAudioResources,
		createPreviewAudioEngine,
		getPlaybackRate,
		getPlayheadUs,
		previewAudioEngineRef,
	]);

	useEffect(() => {
		const previewAudioEngine = previewAudioEngineRef.current;

		if (previewAudioResources.status !== "ready" || !previewAudioEngine) {
			return;
		}

		applyPreviewAudioEngineMix({
			audioMix,
			muted,
			previewAudioEngine,
			soloedAudioTrackId,
			resources: previewAudioResources.resources,
			volume,
		});
	}, [
		audioMix,
		previewAudioResources,
		muted,
		previewAudioEngineRef,
		soloedAudioTrackId,
		volume,
	]);
}
