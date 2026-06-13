import { type RefObject, useEffect, useRef, useState } from "react";
import type MultiTrack from "wavesurfer-multitrack";

import type { MediaTimeUs } from "@/editor-core/model";

import {
	createMultitrackPreviewTracks,
	setMultitrackPreviewPlaybackRate,
} from "./native-preview-audio-transport";
import type { BrowserAudioPreviewSourcesState } from "./use-browser-audio-preview-sources";

type UsePreviewAudioMonitoringLifecycleOptions = {
	audioPreviewSources: BrowserAudioPreviewSourcesState;
	getPlaybackRate: () => number;
	getPlayheadUs: () => MediaTimeUs;
};

type PreviewAudioMonitoringLifecycle = {
	multitrackContainerRef: RefObject<HTMLDivElement | null>;
	multitrackRef: RefObject<MultiTrack | null>;
	ready: boolean;
};

export function usePreviewAudioMonitoringLifecycle({
	audioPreviewSources,
	getPlaybackRate,
	getPlayheadUs,
}: UsePreviewAudioMonitoringLifecycleOptions): PreviewAudioMonitoringLifecycle {
	const multitrackContainerRef = useRef<HTMLDivElement | null>(null);
	const multitrackRef = useRef<MultiTrack | null>(null);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		const container = multitrackContainerRef.current;

		if (
			audioPreviewSources.status !== "ready" ||
			audioPreviewSources.sources.length === 0 ||
			!container
		) {
			multitrackRef.current?.destroy();
			multitrackRef.current = null;
			setReady(false);
			container?.replaceChildren();
			return;
		}

		let disposed = false;
		let multitrack: MultiTrack | null = null;
		let unsubscribeCanPlay: (() => void) | undefined;

		setReady(false);
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
					setReady(true);
				});
			})
			.catch(() => {
				if (!disposed) {
					multitrackRef.current = null;
					setReady(false);
				}
			});

		return () => {
			disposed = true;
			unsubscribeCanPlay?.();
			if (multitrackRef.current === multitrack) {
				multitrackRef.current = null;
			}
			multitrack?.destroy();
			setReady(false);
			container.replaceChildren();
		};
	}, [audioPreviewSources, getPlaybackRate, getPlayheadUs]);

	return {
		multitrackContainerRef,
		multitrackRef,
		ready,
	};
}
