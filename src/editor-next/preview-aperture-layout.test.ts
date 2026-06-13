/* @vitest-environment jsdom */

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ReadyMediaAsset } from "@/editor-core/model";

import {
	createPreviewApertureStyle,
	getPreviewApertureAspectRatio,
	measurePreviewApertureSurface,
	usePreviewApertureLayout,
} from "./preview-aperture-layout";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("preview aperture layout", () => {
	it("uses the primary video aspect ratio and falls back when dimensions are missing or invalid", () => {
		expect(
			getPreviewApertureAspectRatio(
				createReadyAsset({ height: 1080, width: 1920 }),
			),
		).toBe(16 / 9);
		expect(getPreviewApertureAspectRatio(createReadyAsset({}))).toBe(16 / 9);
		expect(
			getPreviewApertureAspectRatio(
				createReadyAsset({ height: 0, width: 1920 }),
			),
		).toBe(16 / 9);
	});

	it("fits the aperture inside the measured viewer surface without cropping", () => {
		expect(
			createPreviewApertureStyle({
				aspectRatio: 16 / 9,
				surfaceSize: { height: 300, width: 900 },
			}),
		).toEqual({
			aspectRatio: String(16 / 9),
			height: "300px",
			width: "533.333333px",
		});
		expect(
			createPreviewApertureStyle({
				aspectRatio: 9 / 16,
				surfaceSize: { height: 900, width: 300 },
			}),
		).toEqual({
			aspectRatio: String(9 / 16),
			height: "533.333333px",
			width: "300px",
		});
		expect(
			createPreviewApertureStyle({
				aspectRatio: 16 / 9,
				surfaceSize: { height: 0, width: 900 },
			}),
		).toEqual({
			aspectRatio: String(16 / 9),
		});
	});

	it("measures the viewer surface after subtracting CSS padding", () => {
		const surface = document.createElement("section");
		vi.spyOn(surface, "getBoundingClientRect").mockReturnValue(
			createTestDomRect({ height: 300, width: 900 }),
		);
		vi.spyOn(window, "getComputedStyle").mockReturnValue({
			paddingBottom: "15px",
			paddingLeft: "10px",
			paddingRight: "30px",
			paddingTop: "5px",
		} as CSSStyleDeclaration);

		expect(measurePreviewApertureSurface(surface)).toEqual({
			height: 280,
			width: 860,
		});
	});

	it("falls back to window resize when ResizeObserver is unavailable", async () => {
		let surfaceRect = createTestDomRect({ height: 300, width: 900 });
		vi.stubGlobal("ResizeObserver", undefined);
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
			() => surfaceRect,
		);
		vi.spyOn(window, "getComputedStyle").mockReturnValue({
			paddingBottom: "0px",
			paddingLeft: "0px",
			paddingRight: "0px",
			paddingTop: "0px",
		} as CSSStyleDeclaration);

		render(createElement(PreviewApertureHarness));

		const aperture = screen.getByLabelText("Preview aperture");
		await waitFor(() => {
			expect(aperture.style.width).toBe("533.333333px");
			expect(aperture.style.height).toBe("300px");
		});

		surfaceRect = createTestDomRect({ height: 400, width: 320 });
		act(() => {
			window.dispatchEvent(new Event("resize"));
		});

		await waitFor(() => {
			expect(aperture.style.width).toBe("320px");
			expect(aperture.style.height).toBe("180px");
		});
	});

	it("updates aperture size from ResizeObserver measurements", async () => {
		let observedElement: Element | null = null;
		let resizeCallback: ResizeObserverCallback | null = null;
		let resizeObserver: ResizeObserver | null = null;
		let surfaceRect = createTestDomRect({ height: 300, width: 900 });
		class TestResizeObserver {
			constructor(callback: ResizeObserverCallback) {
				resizeCallback = callback;
				resizeObserver = this as ResizeObserver;
			}

			disconnect() {}

			observe(element: Element) {
				observedElement = element;
			}

			unobserve() {}
		}
		vi.stubGlobal("ResizeObserver", TestResizeObserver);
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
			() => surfaceRect,
		);
		vi.spyOn(window, "getComputedStyle").mockReturnValue({
			paddingBottom: "0px",
			paddingLeft: "0px",
			paddingRight: "0px",
			paddingTop: "0px",
		} as CSSStyleDeclaration);

		render(createElement(PreviewApertureHarness));

		const surface = screen.getByLabelText("Preview viewer surface");
		const aperture = screen.getByLabelText("Preview aperture");
		expect(observedElement).toBe(surface);
		await waitFor(() => {
			expect(aperture.style.width).toBe("533.333333px");
			expect(aperture.style.height).toBe("300px");
		});

		surfaceRect = createTestDomRect({ height: 240, width: 640 });
		act(() => {
			resizeCallback?.([], resizeObserver as ResizeObserver);
		});

		await waitFor(() => {
			expect(aperture.style.width).toBe("426.666667px");
			expect(aperture.style.height).toBe("240px");
		});
	});
});

function PreviewApertureHarness() {
	const { previewApertureStyle, previewSurfaceRef } = usePreviewApertureLayout(
		createReadyAsset({ height: 1080, width: 1920 }),
	);

	return createElement(
		"section",
		{
			"aria-label": "Preview viewer surface",
			ref: previewSurfaceRef,
		},
		createElement("section", {
			"aria-label": "Preview aperture",
			style: previewApertureStyle,
		}),
	);
}

function createReadyAsset({
	height,
	width,
}: {
	height?: number;
	width?: number;
}) {
	return {
		durationUs: 12_000_000,
		exportCapability: {
			profile: {
				audioCodec: "aac",
				container: "mp4",
				videoCodec: "h264",
			},
			supported: true,
		},
		frameTiming: {
			fps: 30,
			frameDurationUs: 33_333,
			source: "known",
		},
		id: "asset-1",
		label: "clip.mp4",
		provenance: {
			fileName: "clip.mp4",
			mimeType: "video/mp4",
			sizeBytes: 1_024,
		},
		tracks: {
			audio: [],
			video: [
				{
					height,
					id: "video-1",
					kind: "video",
					width,
				},
			],
		},
	} satisfies ReadyMediaAsset;
}

function createTestDomRect({
	height,
	width,
}: {
	height: number;
	width: number;
}): DOMRect {
	return {
		bottom: height,
		height,
		left: 0,
		right: width,
		toJSON: () => ({}),
		top: 0,
		width,
		x: 0,
		y: 0,
	} as DOMRect;
}
