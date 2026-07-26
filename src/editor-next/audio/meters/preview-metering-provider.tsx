import {
	type ReactNode,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import type { AudioMix, ReadyMediaAsset } from "@/editor-core/model";
import { usePreviewAudioMonitoring } from "../engine/preview-audio-monitoring-provider";
import type {
	LivePreviewMeteringClock,
	LivePreviewMeteringState,
} from "./preview-metering-live";
import { useLivePreviewMetering } from "./use-live-preview-metering";

export type PreviewMeteringSource = LivePreviewMeteringClock & {
	retryTrack: (trackId: string) => void;
};

type PreviewMeteringDisplay = LivePreviewMeteringState & {
	controlled: true;
	retryTrack?: (trackId: string) => void;
};

type RegisterPreviewMeteringSource = (
	source: PreviewMeteringSource,
) => () => void;

const PreviewMeteringSourceContext =
	createContext<RegisterPreviewMeteringSource | null>(null);
const PreviewMeteringDisplayContext =
	createContext<PreviewMeteringDisplay | null>(null);

export function PreviewMeteringProvider({
	asset,
	audioMix,
	children,
}: {
	asset: ReadyMediaAsset;
	audioMix: AudioMix;
	children: ReactNode;
}) {
	const { soloedAudioTrackId } = usePreviewAudioMonitoring();
	const [source, setSource] = useState<PreviewMeteringSource | null>(null);
	const knownTrackIds = useMemo(
		() => asset.tracks.audio.map((track) => track.id),
		[asset.tracks.audio],
	);
	const meteringState = useLivePreviewMetering({
		audioMix,
		clock: source,
		enabled: true,
		knownTrackIds,
		soloedAudioTrackId,
	});
	const sourceRef = useRef(source);
	const trackStatesRef = useRef(meteringState.trackStates);
	sourceRef.current = source;
	trackStatesRef.current = meteringState.trackStates;
	const registerSource = useCallback<RegisterPreviewMeteringSource>(
		(nextSource) => {
			setSource(nextSource);

			return () => {
				setSource((currentSource) =>
					currentSource === nextSource ? null : currentSource,
				);
			};
		},
		[],
	);
	const retryUnavailableTrack = useCallback((trackId: string) => {
		if (trackStatesRef.current[trackId]?.status !== "unavailable") {
			return;
		}

		sourceRef.current?.retryTrack(trackId);
	}, []);
	const display = useMemo<PreviewMeteringDisplay>(
		() => ({
			...meteringState,
			controlled: true,
			retryTrack: source ? retryUnavailableTrack : undefined,
		}),
		[meteringState, retryUnavailableTrack, source],
	);

	return (
		<PreviewMeteringSourceContext.Provider value={registerSource}>
			<PreviewMeteringDisplayContext.Provider value={display}>
				{children}
			</PreviewMeteringDisplayContext.Provider>
		</PreviewMeteringSourceContext.Provider>
	);
}

export function usePreviewMeteringSource(source: PreviewMeteringSource) {
	const registerSource = useContext(PreviewMeteringSourceContext);

	useEffect(() => {
		if (!registerSource) {
			return;
		}

		return registerSource(source);
	}, [registerSource, source]);
}

export function usePreviewMeteringDisplay(): PreviewMeteringDisplay | null {
	return useContext(PreviewMeteringDisplayContext);
}
