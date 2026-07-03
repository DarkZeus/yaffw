import { useCallback, useEffect, useRef, useState } from "react";
import type MultiTrack from "wavesurfer-multitrack";

import {
	applyMultitrackPreviewVolumes,
	createMultitrackPreviewTracks,
	setMultitrackPreviewPlaybackRate,
} from "./native-preview-audio-transport";
import { createPreviewAdapterLifecycle } from "./preview-adapter-lifecycle";
import type {
	PreviewAudioMonitoringLifecycle,
	UsePreviewAudioMonitoringLifecycleOptions,
} from "./use-preview-audio-monitoring-lifecycle.types";

export function usePreviewAudioMonitoringLifecycle({
	audioMix,
	audioPreviewSources,
	getPlaybackRate,
	getPlayheadUs,
	multitrackContainerRef: providedMultitrackContainerRef,
	multitrackRef: providedMultitrackRef,
	muted,
	onReadyChange,
	soloedAudioTrackId = null,
	volume,
}: UsePreviewAudioMonitoringLifecycleOptions): PreviewAudioMonitoringLifecycle {
	const ownedMultitrackContainerRef = useRef<HTMLDivElement | null>(null);
	const ownedMultitrackRef = useRef<MultiTrack | null>(null);
	const multitrackContainerRef =
		providedMultitrackContainerRef ?? ownedMultitrackContainerRef;
	const multitrackRef = providedMultitrackRef ?? ownedMultitrackRef;
	const [ready, setReady] = useState(false);
	const audioControlsRef = useRef({
		audioMix,
		muted,
		soloedAudioTrackId,
		volume,
	});
	const setMonitoringReady = useCallback(
		(nextReady: boolean) => {
			setReady(nextReady);
			onReadyChange?.(nextReady);
		},
		[onReadyChange],
	);
	audioControlsRef.current = {
		audioMix,
		muted,
		soloedAudioTrackId,
		volume,
	};

	useEffect(() => {
		const container = multitrackContainerRef.current;
		const lifecycle = createPreviewAdapterLifecycle();

		if (
			audioPreviewSources.status !== "ready" ||
			audioPreviewSources.sources.length === 0 ||
			!container
		) {
			multitrackRef.current?.destroy();
			multitrackRef.current = null;
			setMonitoringReady(false);
			container?.replaceChildren();
			return;
		}

		setMonitoringReady(false);
		lifecycle.registerContainerClear(container);
		lifecycle.registerCleanup(() => setMonitoringReady(false));

		void import("wavesurfer-multitrack")
			.then(({ default: Multitrack }) => {
				if (lifecycle.isDisposed()) {
					return;
				}

				const multitrack = lifecycle.registerDestroyable(
					Multitrack.create(
						createMultitrackPreviewTracks(audioPreviewSources.sources),
						{
							container,
							cursorColor: "transparent",
							cursorWidth: 0,
							minPxPerSec: 1,
							trackBackground: "transparent",
							trackBorderColor: "transparent",
						},
					),
				);
				multitrackRef.current = multitrack;
				lifecycle.registerCleanup(() => {
					if (multitrackRef.current === multitrack) {
						multitrackRef.current = null;
					}
				});
				lifecycle.registerUnsubscribe(
					multitrack.on("canplay", () => {
						if (lifecycle.isDisposed()) {
							return;
						}

						multitrack.setTime(getPlayheadUs() / 1_000_000);
						setMultitrackPreviewPlaybackRate(multitrack, getPlaybackRate());
						applyMultitrackPreviewVolumes({
							...audioControlsRef.current,
							multitrack,
							sources: audioPreviewSources.sources,
						});
						setMonitoringReady(true);
					}),
				);
			})
			.catch(() => {
				if (!lifecycle.isDisposed()) {
					multitrackRef.current = null;
					setMonitoringReady(false);
				}
			});

		return () => {
			lifecycle.dispose();
		};
	}, [
		audioPreviewSources,
		getPlaybackRate,
		getPlayheadUs,
		multitrackContainerRef,
		multitrackRef,
		setMonitoringReady,
	]);

	useEffect(() => {
		const multitrack = multitrackRef.current;

		if (audioPreviewSources.status !== "ready" || !ready || !multitrack) {
			return;
		}

		applyMultitrackPreviewVolumes({
			audioMix,
			multitrack,
			muted,
			soloedAudioTrackId,
			sources: audioPreviewSources.sources,
			volume,
		});
	}, [
		audioMix,
		audioPreviewSources,
		multitrackRef,
		muted,
		ready,
		soloedAudioTrackId,
		volume,
	]);

	return {
		multitrackContainerRef,
		multitrackRef,
		ready,
	};
}
