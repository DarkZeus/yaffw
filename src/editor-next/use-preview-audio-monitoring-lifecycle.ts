import { useCallback, useEffect, useRef, useState } from "react";
import type MultiTrack from "wavesurfer-multitrack";

import {
	applyMultitrackPreviewVolumes,
	createMultitrackPreviewTracks,
	setMultitrackPreviewPlaybackRate,
} from "./native-preview-audio-transport";
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
	const setMonitoringReady = useCallback(
		(nextReady: boolean) => {
			setReady(nextReady);
			onReadyChange?.(nextReady);
		},
		[onReadyChange],
	);

	useEffect(() => {
		const container = multitrackContainerRef.current;

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

		let disposed = false;
		let multitrack: MultiTrack | null = null;
		let unsubscribeCanPlay: (() => void) | undefined;

		setMonitoringReady(false);
		container.replaceChildren();

		void import("wavesurfer-multitrack")
			.then(({ default: Multitrack }) => {
				if (disposed) {
					return;
				}

				multitrack = Multitrack.create(
					createMultitrackPreviewTracks(audioPreviewSources.sources),
					{
						container,
						cursorColor: "transparent",
						cursorWidth: 0,
						minPxPerSec: 1,
						trackBackground: "transparent",
						trackBorderColor: "transparent",
					},
				);
				multitrackRef.current = multitrack;
				unsubscribeCanPlay = multitrack.on("canplay", () => {
					if (disposed) {
						return;
					}

					multitrack?.setTime(getPlayheadUs() / 1_000_000);
					setMultitrackPreviewPlaybackRate(multitrack, getPlaybackRate());
					setMonitoringReady(true);
				});
			})
			.catch(() => {
				if (!disposed) {
					multitrackRef.current = null;
					setMonitoringReady(false);
				}
			});

		return () => {
			disposed = true;
			unsubscribeCanPlay?.();
			if (multitrackRef.current === multitrack) {
				multitrackRef.current = null;
			}
			multitrack?.destroy();
			setMonitoringReady(false);
			container.replaceChildren();
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
