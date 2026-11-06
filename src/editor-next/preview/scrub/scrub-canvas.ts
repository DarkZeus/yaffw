export type ScrubCanvas = HTMLCanvasElement | OffscreenCanvas;

export function createScrubCanvas(width: number, height: number): ScrubCanvas {
	if (typeof OffscreenCanvas !== "undefined") {
		return new OffscreenCanvas(width, height);
	}
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	return canvas;
}
