import {
	type ReactNode,
	createContext,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";

type PreviewAudioMonitoring = {
	soloedAudioTrackId: string | null;
	toggleSoloedAudioTrack: (trackId: string) => void;
};

const PreviewAudioMonitoringContext =
	createContext<PreviewAudioMonitoring | null>(null);

export function PreviewAudioMonitoringProvider({
	assetId,
	children,
}: {
	assetId: string;
	children: ReactNode;
}) {
	return (
		<AssetPreviewAudioMonitoringProvider key={assetId}>
			{children}
		</AssetPreviewAudioMonitoringProvider>
	);
}

function AssetPreviewAudioMonitoringProvider({
	children,
}: {
	children: ReactNode;
}) {
	const [soloedAudioTrackId, setSoloedAudioTrackId] = useState<string | null>(
		null,
	);
	const toggleSoloedAudioTrack = useCallback((trackId: string) => {
		setSoloedAudioTrackId((currentTrackId) =>
			currentTrackId === trackId ? null : trackId,
		);
	}, []);
	const value = useMemo<PreviewAudioMonitoring>(
		() => ({
			soloedAudioTrackId,
			toggleSoloedAudioTrack,
		}),
		[soloedAudioTrackId, toggleSoloedAudioTrack],
	);

	return (
		<PreviewAudioMonitoringContext.Provider value={value}>
			{children}
		</PreviewAudioMonitoringContext.Provider>
	);
}

export function usePreviewAudioMonitoring(): PreviewAudioMonitoring {
	const monitoring = useContext(PreviewAudioMonitoringContext);

	if (!monitoring) {
		throw new Error(
			"usePreviewAudioMonitoring must be used within PreviewAudioMonitoringProvider.",
		);
	}

	return monitoring;
}
