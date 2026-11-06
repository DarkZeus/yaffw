import {
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

import type { AudioMix, MediaTimeUs } from "@/editor-core/model";
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

export type UsePreviewAudioMonitoringLifecycleOptions = {
	audioMix: AudioMix;
	previewAudioResources: PreviewAudioResourcesState;
	createPreviewAudioEngine?: PreviewAudioEngineFactory;
	getPlaybackRate: () => number;
	getPlayheadUs: () => MediaTimeUs;
	previewAudioEngineRef: RefObject<PreviewAudioEngine | null>;
	muted: boolean;
	onStatusChange?: (status: PreviewAudioMonitoringStatus) => void;
	soloedAudioTrackId?: string | null;
	volume: number;
};

export function usePreviewAudioMonitoringLifecycle({
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
	const [status, setStatus] = useState<PreviewAudioMonitoringStatus>("idle");
	const audioControlsRef = useRef({
		audioMix,
		muted,
		soloedAudioTrackId,
		volume,
	});
	const setMonitoringStatus = useCallback(
		(nextStatus: PreviewAudioMonitoringStatus) => {
			setStatus(nextStatus);
			onStatusChange?.(nextStatus);
		},
		[onStatusChange],
	);
	audioControlsRef.current = {
		audioMix,
		muted,
		soloedAudioTrackId,
		volume,
	};

	useEffect(() => {
		const lifecycle = createSynchronousMediaWorkScope();
		const abortController = new AbortController();
		lifecycle.registerCleanup(() => abortController.abort());

		if (
			previewAudioResources.status !== "ready" ||
			previewAudioResources.resources.length === 0
		) {
			previewAudioEngineRef.current?.destroy();
			previewAudioEngineRef.current = null;
			setMonitoringStatus("idle");
			return;
		}

		setMonitoringStatus("preparing");
		lifecycle.registerCleanup(() => setMonitoringStatus("idle"));

		void createPreviewAudioEngine({
			provider: previewAudioResources.provider,
			initialTimeSeconds: getPlayheadUs() / 1_000_000,
			initialPlaybackRate: getPlaybackRate(),
			signal: abortController.signal,
			outputChannels: audioControlsRef.current.audioMix.outputChannels,
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
							setMonitoringStatus(previewAudioEngine.getStatus());
						}
					}),
				);
				applyPreviewAudioEngineMix({
					...audioControlsRef.current,
					previewAudioEngine,
					resources: previewAudioResources.resources,
				});
				setMonitoringStatus(previewAudioEngine.getStatus());
			})
			.catch(() => {
				if (!lifecycle.isDisposed()) {
					previewAudioEngineRef.current = null;
					setMonitoringStatus("failed");
				}
			});

		return () => {
			lifecycle.dispose();
		};
	}, [
		previewAudioResources,
		createPreviewAudioEngine,
		getPlaybackRate,
		getPlayheadUs,
		previewAudioEngineRef,
		setMonitoringStatus,
	]);

	useEffect(() => {
		const previewAudioEngine = previewAudioEngineRef.current;

		if (
			previewAudioResources.status !== "ready" ||
			!previewAudioMonitoringStatusIsReady(status) ||
			!previewAudioEngine
		) {
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
		status,
		volume,
	]);
}

function previewAudioMonitoringStatusIsReady(
	status: PreviewAudioMonitoringStatus,
) {
	return status === "ready" || status === "degraded";
}
