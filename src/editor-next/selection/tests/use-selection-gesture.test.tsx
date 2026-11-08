/* @vitest-environment jsdom */

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createActiveMediaAssetCleanupScopeController } from "../../media-work/scopes/active-media-asset-cleanup-scope";
import { useSelectionGesture } from "../timeline/use-selection-gesture";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("Selection gesture ownership", () => {
	it("mirrors a range draft and consumes only the matching pointer release", () => {
		const frames = stubFrames();
		const { result, callbacks, target } = renderGesture();
		act(() => {
			result.current.beginGesture(
				pointer("pointerdown", 400),
				target,
				"range",
				"timeline",
			);
		});
		act(() => {
			window.dispatchEvent(pointer("pointermove", 500));
			frames.shift()?.(1);
		});
		expect(result.current.draft?.selection).toEqual({
			startUs: 3_000_000,
			endUs: 8_000_000,
		});
		expect(callbacks.onSelectionRangeMoveRequested).not.toHaveBeenCalled();

		act(() => {
			window.dispatchEvent(pointer("pointerup", 800, 2));
			window.dispatchEvent(new MouseEvent("mouseup", { clientX: 800 }));
		});
		expect(result.current.isGestureActive()).toBe(true);
		expect(callbacks.onSelectionRangeMoveRequested).not.toHaveBeenCalled();

		act(() => {
			window.dispatchEvent(pointer("pointerup", 600));
			window.dispatchEvent(new MouseEvent("mouseup", { clientX: 600 }));
			window.dispatchEvent(pointer("pointerup", 600));
		});
		expect(result.current.draft).toBeNull();
		expect(
			callbacks.onSelectionRangeMoveRequested,
		).toHaveBeenCalledExactlyOnceWith(2_000_000);
		expect(callbacks.onPlayheadSeekRequested).not.toHaveBeenCalled();
	});

	it("restores the viewer on pointer cancellation and ignores dequeued draft frames", () => {
		const frames = stubFrames();
		const { result, callbacks, target } = renderGesture();
		act(() => {
			result.current.beginGesture(
				pointer("pointerdown", 304),
				target,
				"start",
				"waveform",
			);
		});
		act(() => {
			window.dispatchEvent(pointer("pointermove", 404));
			frames.shift()?.(1);
		});
		expect(
			callbacks.onPlayheadPreviewRequested,
		).toHaveBeenCalledExactlyOnceWith(3_000_000);
		act(() => {
			window.dispatchEvent(pointer("pointermove", 504));
			window.dispatchEvent(pointer("pointercancel", 504));
			frames.shift()?.(2);
			window.dispatchEvent(pointer("pointerup", 504));
		});
		expect(result.current.draft).toBeNull();
		expect(callbacks.onPlayheadPreviewRequested).toHaveBeenCalledTimes(1);
		expect(callbacks.onPlayheadSeekRequested).toHaveBeenCalledExactlyOnceWith(
			1_000_000,
		);
		expect(callbacks.onSelectionStartCommitRequested).not.toHaveBeenCalled();
	});

	it("retires a pending Playhead gesture when the asset closes", () => {
		const frames = stubFrames();
		const scopes = createActiveMediaAssetCleanupScopeController();
		const scope = scopes.replaceCurrentScope("asset");
		const { result, callbacks, target } = renderGesture(scope);
		act(() => {
			result.current.beginGesture(
				pointer("pointerdown", 200),
				target,
				"playhead",
				"timeline",
			);
		});
		act(() => {
			window.dispatchEvent(pointer("pointermove", 300));
			scopes.disposeCurrentScope();
			frames.shift()?.(1);
			window.dispatchEvent(pointer("pointerup", 300));
		});
		expect(result.current.draft).toBeNull();
		expect(callbacks.onPlayheadPreviewRequested).not.toHaveBeenCalled();
		expect(callbacks.onPlayheadSeekRequested).not.toHaveBeenCalled();
	});

	it("retires a draft when another command changes the committed Selection", () => {
		const { result, rerender, options, callbacks, target } = renderGesture();
		act(() => {
			result.current.beginGesture(
				pointer("pointerdown", 400),
				target,
				"range",
				"timeline",
			);
		});
		rerender({
			...options,
			selection: { startUs: 1_000_000, endUs: 6_000_000 },
		});
		act(() => {
			window.dispatchEvent(pointer("pointerup", 600));
		});
		expect(result.current.draft).toBeNull();
		expect(callbacks.onSelectionRangeMoveRequested).not.toHaveBeenCalled();
	});
});

function pointer(type: string, clientX: number, pointerId = 1) {
	return new PointerEvent(type, {
		clientX,
		pointerId,
		pointerType: "mouse",
		isPrimary: true,
		bubbles: true,
	});
}

function stubFrames() {
	const frames: FrameRequestCallback[] = [];
	vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) =>
		frames.push(frame),
	);
	// Keep canceled frames callable to simulate callbacks already dequeued.
	vi.stubGlobal("cancelAnimationFrame", vi.fn());
	return frames;
}

function renderGesture(
	activeMediaAssetCleanupScope?: Parameters<
		typeof useSelectionGesture
	>[0]["activeMediaAssetCleanupScope"],
) {
	const target = document.createElement("button");
	const callbacks = {
		onGestureStarted: vi.fn(),
		onPlayheadPreviewRequested: vi.fn(),
		onPlayheadSeekRequested: vi.fn(),
		onSelectionStartCommitRequested: vi.fn(),
		onSelectionEndCommitRequested: vi.fn(),
		onSelectionRangeMoveRequested: vi.fn(),
	};
	const options: Parameters<typeof useSelectionGesture>[0] = {
		activeMediaAssetCleanupScope,
		source: new Blob(),
		context: {
			durationUs: 10_000_000,
			frameTiming: {
				analysis: null,
				fps: 30,
				frameDurationUs: 33_333,
				reason: "Test fixture",
				source: "estimated",
			},
		},
		selection: { startUs: 2_000_000, endUs: 7_000_000 },
		selectionEditingDisabled: false,
		readGeometry: () => ({ leftPx: 100, widthPx: 1000 }),
		readPlayheadUs: () => 1_000_000,
		...callbacks,
	};
	const { result, rerender } = renderHook(useSelectionGesture, {
		initialProps: options,
	});
	return { result, rerender, options, callbacks, target };
}
