import {
	type CSSProperties,
	type RefObject,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

import type { ReadyMediaAsset } from "@/editor-core/model";

const FALLBACK_PREVIEW_ASPECT_RATIO = 16 / 9;

export type PreviewApertureSurfaceSize = {
	height: number;
	width: number;
};

export type PreviewApertureStyleOptions = {
	aspectRatio: number;
	surfaceSize: PreviewApertureSurfaceSize | null;
};

export type PreviewApertureLayout = {
	previewApertureStyle: CSSProperties;
	previewSurfaceRef: RefObject<HTMLElement | null>;
};

export function usePreviewApertureLayout(
	asset: Pick<ReadyMediaAsset, "tracks">,
): PreviewApertureLayout {
	const previewSurfaceRef = useRef<HTMLElement | null>(null);
	const [previewSurfaceSize, setPreviewSurfaceSize] =
		useState<PreviewApertureSurfaceSize | null>(null);

	useLayoutEffect(() => {
		const previewSurface = previewSurfaceRef.current;

		if (!previewSurface) {
			return;
		}

		const measurePreviewSurface = () => {
			setPreviewSurfaceSize((currentSize) => {
				const nextSize = measurePreviewApertureSurface(previewSurface);

				return currentSize && isSamePreviewSurfaceSize(currentSize, nextSize)
					? currentSize
					: nextSize;
			});
		};

		measurePreviewSurface();

		if (typeof ResizeObserver === "undefined") {
			window.addEventListener("resize", measurePreviewSurface);
			return () => {
				window.removeEventListener("resize", measurePreviewSurface);
			};
		}

		const resizeObserver = new ResizeObserver(measurePreviewSurface);
		resizeObserver.observe(previewSurface);

		return () => {
			resizeObserver.disconnect();
		};
	}, []);

	return {
		previewApertureStyle: createPreviewApertureStyle({
			aspectRatio: getPreviewApertureAspectRatio(asset),
			surfaceSize: previewSurfaceSize,
		}),
		previewSurfaceRef,
	};
}

export function getPreviewApertureAspectRatio(
	asset: Pick<ReadyMediaAsset, "tracks">,
): number {
	const primaryVideo = asset.tracks.video[0];
	const width = primaryVideo?.width ?? 16;
	const height = primaryVideo?.height ?? 9;

	if (width <= 0 || height <= 0) {
		return FALLBACK_PREVIEW_ASPECT_RATIO;
	}

	return width / height;
}

export function createPreviewApertureStyle({
	aspectRatio,
	surfaceSize,
}: PreviewApertureStyleOptions): CSSProperties {
	const resolvedAspectRatio =
		Number.isFinite(aspectRatio) && aspectRatio > 0
			? aspectRatio
			: FALLBACK_PREVIEW_ASPECT_RATIO;

	if (!surfaceSize || surfaceSize.width <= 0 || surfaceSize.height <= 0) {
		return {
			aspectRatio: String(resolvedAspectRatio),
		};
	}

	const width = Math.min(
		surfaceSize.width,
		surfaceSize.height * resolvedAspectRatio,
	);
	const height = width / resolvedAspectRatio;

	return {
		aspectRatio: String(resolvedAspectRatio),
		height: `${formatCssNumber(height)}px`,
		width: `${formatCssNumber(width)}px`,
	};
}

export function measurePreviewApertureSurface(
	previewSurface: HTMLElement,
): PreviewApertureSurfaceSize {
	const rect = previewSurface.getBoundingClientRect();
	const style = window.getComputedStyle(previewSurface);
	const width = Math.max(
		0,
		rect.width -
			parseCssPixels(style.paddingLeft) -
			parseCssPixels(style.paddingRight),
	);
	const height = Math.max(
		0,
		rect.height -
			parseCssPixels(style.paddingTop) -
			parseCssPixels(style.paddingBottom),
	);

	return { height, width };
}

function isSamePreviewSurfaceSize(
	currentSize: PreviewApertureSurfaceSize,
	nextSize: PreviewApertureSurfaceSize,
): boolean {
	return (
		Math.abs(currentSize.width - nextSize.width) < 0.5 &&
		Math.abs(currentSize.height - nextSize.height) < 0.5
	);
}

function parseCssPixels(value: string): number {
	const parsedValue = Number.parseFloat(value);

	return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function formatCssNumber(value: number): string {
	return Number.isInteger(value)
		? String(value)
		: value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}
