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

type PendingScrubTarget = {
	requestId: number;
	timestampUs: MediaTimeUs;
};

export type ScrubPreview = {
	canvasRef: RefObject<HTMLCanvasElement | null>;
	handleNativeSeeked: (currentTimeSeconds: number) => void;
	hide: () => void;
	requestFrame: (
		timestampUs: MediaTimeUs,
		options?: ScrubFrameRequestOptions,
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
	const cacheRef = useRef<ScrubFrameCache | null>(null);
	const latestTargetRef = useRef<PendingScrubTarget | null>(null);
	const nativeSettledThroughRequestIdRef = useRef(0);
	const providerRef = useRef<ScrubFrameProvider | null>(null);
	const [visible, setVisible] = useState(false);
	const frameDurationUs = asset.frameTiming.frameDurationUs;
	const primaryVideoTrack = asset.tracks.video[0];

	useEffect(() => {
		const cache = createScrubFrameCache({ frameDurationUs });
		cacheRef.current = cache;
		latestTargetRef.current = null;
		nativeSettledThroughRequestIdRef.current = 0;
		setVisible(false);

		const provider = createMediabunnyScrubFrameProvider({
			displayHeight: primaryVideoTrack?.height,
			displayWidth: primaryVideoTrack?.width,
			frameDurationUs,
			onFrame(frame) {
				const latestTarget = latestTargetRef.current;
				if (!latestTarget || frame.requestId !== latestTarget.requestId) {
					return;
				}

				cache.set(frame.timestampUs, frame.canvas);
				if (frame.requestId <= nativeSettledThroughRequestIdRef.current) {
					return;
				}

				if (drawScrubFrame(canvasRef.current, frame.canvas)) {
					setVisible(true);
				}
			},
			onUnavailable() {
				setVisible(false);
			},
			source,
		});
		providerRef.current = provider;
		provider.warm();

		const dispose = () => {
			provider.dispose();
			cache.clear();
			if (providerRef.current === provider) {
				providerRef.current = null;
			}
			if (cacheRef.current === cache) {
				cacheRef.current = null;
			}
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
		frameDurationUs,
		primaryVideoTrack?.height,
		primaryVideoTrack?.width,
		source,
	]);

	const hide = useCallback(() => {
		const latestTarget = latestTargetRef.current;
		if (latestTarget) {
			nativeSettledThroughRequestIdRef.current = Math.max(
				nativeSettledThroughRequestIdRef.current,
				latestTarget.requestId,
			);
		}
		setVisible(false);
	}, []);

	const requestFrame = useCallback(
		(timestampUs: MediaTimeUs, options?: ScrubFrameRequestOptions) => {
			const provider = providerRef.current;
			if (!provider) {
				return;
			}
			const previousTarget = latestTargetRef.current;
			if (
				(options?.priority ?? "final") === "interactive" &&
				previousTarget &&
				Math.abs(previousTarget.timestampUs - timestampUs) < frameDurationUs / 2
			) {
				return;
			}

			const requestId = provider.requestFrame(timestampUs, options);
			latestTargetRef.current = { requestId, timestampUs };

			const cached = cacheRef.current?.get(timestampUs);
			if (cached && drawScrubFrame(canvasRef.current, cached)) {
				setVisible(true);
			}
		},
		[frameDurationUs],
	);

	const handleNativeSeeked = useCallback(
		(currentTimeSeconds: number) => {
			const latestTarget = latestTargetRef.current;
			if (!latestTarget || !Number.isFinite(currentTimeSeconds)) {
				return;
			}

			const toleranceUs = Math.max(1, frameDurationUs * 2);
			const nativeTimeUs = Math.round(currentTimeSeconds * 1_000_000);
			if (Math.abs(nativeTimeUs - latestTarget.timestampUs) > toleranceUs) {
				return;
			}

			nativeSettledThroughRequestIdRef.current = Math.max(
				nativeSettledThroughRequestIdRef.current,
				latestTarget.requestId,
			);
			setVisible(false);
		},
		[frameDurationUs],
	);

	return {
		canvasRef,
		handleNativeSeeked,
		hide,
		requestFrame,
		visible,
	};
}

export function drawScrubFrame(
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
