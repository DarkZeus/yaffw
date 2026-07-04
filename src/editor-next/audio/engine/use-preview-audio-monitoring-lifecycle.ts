import { useCallback, useEffect, useRef, useState } from "react";

import { createPreviewAdapterLifecycle } from "../../preview/lifecycle/preview-adapter-lifecycle";
import type {
	PreviewAudioMonitoringLifecycle,
	PreviewAudioMonitoringStatus,
	UsePreviewAudioMonitoringLifecycleOptions,
} from "../types/use-preview-audio-monitoring-lifecycle.types";
import {
	type PreviewAudioEngine,
	applyPreviewAudioEngineMix,
	createPreviewAudioEngine as createDefaultPreviewAudioEngine,
	setPreviewAudioEnginePlaybackRate,
} from "./preview-audio-engine";

export function usePreviewAudioMonitoringLifecycle({
	audioMix,
	previewAudioResources,
	createPreviewAudioEngine = createDefaultPreviewAudioEngine,
	getPlaybackRate,
	getPlayheadUs,
	muted,
	onReadyChange,
	onStatusChange,
	previewAudioEngineRef: providedPreviewAudioEngineRef,
	soloedAudioTrackId = null,
	volume,
}: UsePreviewAudioMonitoringLifecycleOptions): PreviewAudioMonitoringLifecycle {
	const ownedPreviewAudioEngineRef = useRef<PreviewAudioEngine | null>(null);
	const previewAudioEngineRef =
		providedPreviewAudioEngineRef ?? ownedPreviewAudioEngineRef;
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
			onReadyChange?.(previewAudioMonitoringStatusIsReady(nextStatus));
			onStatusChange?.(nextStatus);
		},
		[onReadyChange, onStatusChange],
	);
	audioControlsRef.current = {
		audioMix,
		muted,
		soloedAudioTrackId,
		volume,
	};

	useEffect(() => {
		const lifecycle = createPreviewAdapterLifecycle();

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
			failures: previewAudioResources.failures,
			resources: previewAudioResources.resources,
		})
			.then((previewAudioEngine) => {
				if (lifecycle.isDisposed()) {
					previewAudioEngine.destroy();
					return;
				}

				lifecycle.registerDestroyable(previewAudioEngine);
				previewAudioEngineRef.current = previewAudioEngine;
				lifecycle.registerCleanup(() => {
					if (previewAudioEngineRef.current === previewAudioEngine) {
						previewAudioEngineRef.current = null;
					}
				});
				previewAudioEngine.setTime(getPlayheadUs() / 1_000_000);
				setPreviewAudioEnginePlaybackRate(
					previewAudioEngine,
					getPlaybackRate(),
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

	return {
		previewAudioEngineRef,
		ready: previewAudioMonitoringStatusIsReady(status),
		status,
	};
}

function previewAudioMonitoringStatusIsReady(
	status: PreviewAudioMonitoringStatus,
) {
	return status === "ready" || status === "degraded";
}
