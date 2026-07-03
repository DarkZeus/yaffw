import { useCallback, useEffect, useRef, useState } from "react";

import {
	applyPreviewAudioEngineGains,
	createPreviewAudioEngine as createDefaultPreviewAudioEngine,
	setPreviewAudioEnginePlaybackRate,
	type PreviewAudioEngine,
} from "./preview-audio-engine";
import { createPreviewAdapterLifecycle } from "./preview-adapter-lifecycle";
import type {
	PreviewAudioMonitoringLifecycle,
	PreviewAudioMonitoringStatus,
	UsePreviewAudioMonitoringLifecycleOptions,
} from "./use-preview-audio-monitoring-lifecycle.types";

export function usePreviewAudioMonitoringLifecycle({
	audioMix,
	audioPreviewSources,
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
	const [status, setStatus] =
		useState<PreviewAudioMonitoringStatus>("idle");
	const audioControlsRef = useRef({
		audioMix,
		muted,
		soloedAudioTrackId,
		volume,
	});
	const setMonitoringStatus = useCallback(
		(nextStatus: PreviewAudioMonitoringStatus) => {
			setStatus(nextStatus);
			onReadyChange?.(nextStatus === "ready");
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
			audioPreviewSources.status !== "ready" ||
			audioPreviewSources.sources.length === 0
		) {
			previewAudioEngineRef.current?.destroy();
			previewAudioEngineRef.current = null;
			setMonitoringStatus("idle");
			return;
		}

		setMonitoringStatus("preparing");
		lifecycle.registerCleanup(() => setMonitoringStatus("idle"));

		void createPreviewAudioEngine({
			sources: audioPreviewSources.sources,
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
				applyPreviewAudioEngineGains({
					...audioControlsRef.current,
					previewAudioEngine,
					sources: audioPreviewSources.sources,
				});
				setMonitoringStatus("ready");
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
		audioPreviewSources,
		createPreviewAudioEngine,
		getPlaybackRate,
		getPlayheadUs,
		previewAudioEngineRef,
		setMonitoringStatus,
	]);

	useEffect(() => {
		const previewAudioEngine = previewAudioEngineRef.current;

		if (
			audioPreviewSources.status !== "ready" ||
			status !== "ready" ||
			!previewAudioEngine
		) {
			return;
		}

		applyPreviewAudioEngineGains({
			audioMix,
			muted,
			previewAudioEngine,
			soloedAudioTrackId,
			sources: audioPreviewSources.sources,
			volume,
		});
	}, [
		audioMix,
		audioPreviewSources,
		muted,
		previewAudioEngineRef,
		soloedAudioTrackId,
		status,
		volume,
	]);

	return {
		previewAudioEngineRef,
		ready: status === "ready",
		status,
	};
}
