import type { CSSProperties, RefObject } from "react";

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
