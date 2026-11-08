import {
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import type { MediaTimeUs, ReadyMediaAsset } from "@/editor-core/model";
import type { ActiveMediaAssetCleanupScope } from "../../media-work/scopes/active-media-asset-cleanup-scope";
import {
	type ScrubFrameProvider,
	type ScrubFrameRequestOptions,
	createMediabunnyScrubFrameProvider,
} from "./mediabunny-scrub-frame-provider";
import {
	type ScrubFrameCache,
	createScrubFrameCache,
} from "./scrub-frame-cache";

type ScrubTarget = {
	awaitingNativeSeek: boolean;
	requestId: number;
	timestampUs: MediaTimeUs;
};

type ScrubSession = {
	cache: ScrubFrameCache;
	provider: ScrubFrameProvider;
	target: ScrubTarget | null;
};

export type ScrubPreviewTransport = {
	capturePlaybackHandoff: () => (() => void) | undefined;
	hasTarget: () => boolean;
	onNativeSeekRequested: (timestampUs: MediaTimeUs) => void;
};

type ScrubPreview = ScrubPreviewTransport & {
	canvasRef: RefObject<HTMLCanvasElement | null>;
	handleNativeSeeked: (video: HTMLVideoElement) => void;
	requestFrame: (
		timestampUs: MediaTimeUs,
		options: ScrubFrameRequestOptions,
	) => void;
	visible: boolean;
};

export function useScrubPreview({
	activeMediaAssetCleanupScope,
	asset,
	source,
}: {
	activeMediaAssetCleanupScope?: ActiveMediaAssetCleanupScope;
	asset: ReadyMediaAsset;
	source: Blob;
}): ScrubPreview {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const sessionRef = useRef<ScrubSession | null>(null);
	const [visible, setVisible] = useState(false);
	const primaryVideoTrack = asset.tracks.video[0];

	useEffect(() => {
		const cache = createScrubFrameCache();
		setVisible(false);

		const provider = createMediabunnyScrubFrameProvider({
			displayHeight: primaryVideoTrack?.height,
			displayWidth: primaryVideoTrack?.width,
			onFrame(frame) {
				const session = sessionRef.current;
				const target = session?.target;
				if (
					session?.provider !== provider ||
					!target ||
					target.requestId !== frame.requestId ||
					target.timestampUs !== frame.timestampUs
				) {
					return;
				}

				cache.set(target.timestampUs, frame.canvas);
				if (drawScrubFrame(canvasRef.current, frame.canvas)) {
					setVisible(true);
				}
			},
			onUnavailable() {
				if (sessionRef.current?.provider === provider) setVisible(false);
			},
			source,
		});
		const session: ScrubSession = { cache, provider, target: null };
		sessionRef.current = session;
		provider.warm();

		const dispose = () => {
			if (sessionRef.current === session) sessionRef.current = null;
			provider.dispose();
			cache.clear();
		};
		const registration = activeMediaAssetCleanupScope?.registerCleanup(dispose);

		return () => {
			if (registration) {
				registration.dispose();
			} else {
				dispose();
			}
		};
	}, [
		activeMediaAssetCleanupScope,
		primaryVideoTrack?.height,
		primaryVideoTrack?.width,
		source,
	]);

	const retireTarget = useCallback((target: ScrubTarget) => {
		const session = sessionRef.current;
		if (session?.target !== target) return;
		session.target = null;
		setVisible(false);
	}, []);

	const requestFrame = useCallback(
		(timestampUs: MediaTimeUs, options: ScrubFrameRequestOptions) => {
			const session = sessionRef.current;
			if (!session) return;

			const requestId = session.provider.requestFrame(timestampUs, options);
			session.target = { awaitingNativeSeek: false, requestId, timestampUs };

			const cached = session.cache.get(timestampUs);
			if (cached && drawScrubFrame(canvasRef.current, cached)) {
				setVisible(true);
			}
		},
		[],
	);

	const hasTarget = useCallback(() => Boolean(sessionRef.current?.target), []);
	const onNativeSeekRequested = useCallback((timestampUs: MediaTimeUs) => {
		const target = sessionRef.current?.target;
		if (target?.timestampUs === timestampUs) target.awaitingNativeSeek = true;
	}, []);
	const handleNativeSeeked = useCallback(
		(video: HTMLVideoElement) => {
			const target = sessionRef.current?.target;
			if (
				target?.awaitingNativeSeek &&
				!video.seeking &&
				video.readyState >= video.HAVE_CURRENT_DATA &&
				Math.round(video.currentTime * 1_000_000) === target.timestampUs
			) {
				retireTarget(target);
			}
		},
		[retireTarget],
	);
	const capturePlaybackHandoff = useCallback(() => {
		const target = sessionRef.current?.target;
		return target ? () => retireTarget(target) : undefined;
	}, [retireTarget]);

	return {
		canvasRef,
		capturePlaybackHandoff,
		handleNativeSeeked,
		hasTarget,
		onNativeSeekRequested,
		requestFrame,
		visible,
	};
}

function drawScrubFrame(
	target: HTMLCanvasElement | null,
	source: CanvasImageSource,
) {
	if (!target) {
		return false;
	}

	const width = sourceDimension(source, "width");
	const height = sourceDimension(source, "height");
	if (width <= 0 || height <= 0) {
		return false;
	}

	if (target.width !== width) {
		target.width = width;
	}
	if (target.height !== height) {
		target.height = height;
	}

	const context = target.getContext("2d");
	if (!context) {
		return false;
	}

	context.clearRect(0, 0, width, height);
	context.drawImage(source, 0, 0, width, height);
	return true;
}

function sourceDimension(
	source: CanvasImageSource,
	dimension: "height" | "width",
) {
	const sourceWithDimensions = source as {
		height?: unknown;
		width?: unknown;
	};
	const value = sourceWithDimensions[dimension];

	return typeof value === "number" ? Math.max(0, Math.floor(value)) : 0;
}
