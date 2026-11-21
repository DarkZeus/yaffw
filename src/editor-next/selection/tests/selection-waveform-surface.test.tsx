/* @vitest-environment jsdom */

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WaveformSurface } from "../waveform/selection-waveform-surface";

const mockState = vi.hoisted(() => ({
	regionsPlugins: [] as Array<{
		addRegion: (options: Record<string, unknown>) => MockRegion;
		emit: (event: string, ...args: unknown[]) => void;
		listenerCount: (event: string) => number;
		regions: MockRegion[];
	}>,
	wavesurfers: [] as Array<{
		destroy: () => void;
		destroyed: boolean;
		emit: (event: string, ...args: unknown[]) => void;
		listenerCount: (event: string) => number;
		options: Record<string, unknown>;
		setOptions: (options: Record<string, unknown>) => void;
	}>,
}));

type MockRegion = {
	element: HTMLElement;
	end: number;
	setOptions: (options: { end?: number; start?: number }) => void;
	start: number;
};

vi.mock("wavesurfer.js", () => {
	class MockWaveSurfer {
		private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

		constructor(readonly options: Record<string, unknown>) {
			mockState.wavesurfers.push(this);
		}

		on(event: string, callback: (...args: unknown[]) => void) {
			const listeners = this.listeners.get(event) ?? new Set();
			listeners.add(callback);
			this.listeners.set(event, listeners);

			return () => listeners.delete(callback);
		}

		emit(event: string, ...args: unknown[]) {
			for (const listener of this.listeners.get(event) ?? []) {
				listener(...args);
			}
		}

		listenerCount(event: string) {
			return this.listeners.get(event)?.size ?? 0;
		}

		destroyed = false;
		setOptions = vi.fn((options: Record<string, unknown>) => {
			Object.assign(this.options, options);
		});

		destroy() {
			this.destroyed = true;
		}
	}

	return {
		default: {
			create: (options: Record<string, unknown>) => new MockWaveSurfer(options),
		},
	};
});

vi.mock("wavesurfer.js/plugins/regions", () => {
	class MockRegionsPlugin {
		private listeners = new Map<string, Set<(...args: unknown[]) => void>>();
		regions: MockRegion[] = [];

		constructor() {
			mockState.regionsPlugins.push(this);
		}

		on(event: string, callback: (...args: unknown[]) => void) {
			const listeners = this.listeners.get(event) ?? new Set();
			listeners.add(callback);
			this.listeners.set(event, listeners);

			return () => listeners.delete(callback);
		}

		emit(event: string, ...args: unknown[]) {
			for (const listener of this.listeners.get(event) ?? []) {
				listener(...args);
			}
		}

		listenerCount(event: string) {
			return this.listeners.get(event)?.size ?? 0;
		}

		addRegion(options: Record<string, unknown>) {
			const element = document.createElement("div");
			for (const side of ["left", "right"]) {
				const handle = document.createElement("div");
				handle.setAttribute("part", `region-handle region-handle-${side}`);
				element.append(handle);
			}
			const region = {
				element,
				end: Number(options.end),
				setOptions(nextOptions: { end?: number; start?: number }) {
					if (nextOptions.start !== undefined) {
						region.start = nextOptions.start;
					}

					if (nextOptions.end !== undefined) {
						region.end = nextOptions.end;
					}
				},
				start: Number(options.start),
			};
			this.regions.push(region);

			return region;
		}
	}

	return {
		default: {
			create: () => new MockRegionsPlugin(),
		},
	};
});

beforeEach(() => {
	mockState.regionsPlugins.length = 0;
	mockState.wavesurfers.length = 0;
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
		callback(0);
		return 1;
	});
	vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
	cleanup();
	document.documentElement.className = "";
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("WaveformSurface", () => {
	const surfaceProps = {
		durationUs: 12_000_000,
		label: "Voice",
		minimumSelectionDurationUs: 33_333,
		onPlayheadSeekRequested: vi.fn(),
		onSelectionGestureStart: vi.fn(),
		samples: [0.2, 0.7, 0.4],
		selection: { startUs: 2_000_000, endUs: 6_000_000 },
		selectionEditingDisabled: false,
		selectionEditInProgress: false,
	};

	it("recolors the existing renderer on appearance changes and stops observing after unmount", async () => {
		const { unmount } = render(<WaveformSurface {...surfaceProps} />);
		await waitFor(() => expect(mockState.wavesurfers).toHaveLength(1));
		const renderer = mockState.wavesurfers[0];
		act(() => renderer.emit("redrawcomplete"));
		const region = mockState.regionsPlugins[0].regions[0];
		const host = renderer.options.container as HTMLElement;
		const color = "oklch(0.45 0.05 190)";
		host.style.setProperty("--workbench-waveform", color);
		act(() => document.documentElement.classList.add("light"));
		await waitFor(() =>
			expect(renderer.setOptions).toHaveBeenCalledWith({
				waveColor: color,
				progressColor: color,
			}),
		);
		expect(mockState.wavesurfers).toHaveLength(1);
		expect(mockState.regionsPlugins[0].regions).toEqual([region]);
		expect(region.start).toBe(2);
		expect(region.end).toBe(6);
		unmount();
		const calls = vi.mocked(renderer.setOptions).mock.calls.length;
		await act(async () => {
			document.documentElement.classList.replace("light", "dark");
			await Promise.resolve();
		});
		expect(renderer.setOptions).toHaveBeenCalledTimes(calls);
		expect(renderer.destroyed).toBe(true);
	});

	it("repaints the canvas fallback on appearance changes and releases its observer", async () => {
		const { container, unmount } = render(
			<WaveformSurface {...surfaceProps} />,
		);
		await waitFor(() => expect(mockState.wavesurfers).toHaveLength(1));
		act(() =>
			mockState.wavesurfers[0].emit("error", new Error("Renderer failed")),
		);
		const canvas = container.querySelector("canvas");
		if (!canvas) throw new Error("Expected the canvas fallback");
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Expected a real canvas context");
		const repaint = vi.spyOn(context, "clearRect");
		act(() => document.documentElement.classList.add("light"));
		await waitFor(() => expect(repaint).toHaveBeenCalledTimes(1));
		unmount();
		await act(async () => {
			document.documentElement.classList.replace("light", "dark");
			await Promise.resolve();
		});
		expect(repaint).toHaveBeenCalledTimes(1);
	});

	it("waits for the committed selection when a drag begins before the renderer is ready", async () => {
		const onSelectionRegionAvailabilityChange = vi.fn();
		const props = { ...surfaceProps, onSelectionRegionAvailabilityChange };
		const { rerender } = render(<WaveformSurface {...props} />);
		await waitFor(() => expect(mockState.wavesurfers).toHaveLength(1));

		rerender(
			<WaveformSurface
				{...props}
				selection={{ startUs: 3_000_000, endUs: 6_000_000 }}
				selectionEditInProgress
			/>,
		);
		act(() => mockState.wavesurfers[0]?.emit("redrawcomplete"));
		expect(mockState.regionsPlugins[0]?.regions).toHaveLength(0);
		expect(onSelectionRegionAvailabilityChange).not.toHaveBeenCalled();

		rerender(
			<WaveformSurface
				{...props}
				selection={{ startUs: 4_000_000, endUs: 6_000_000 }}
			/>,
		);
		expect(mockState.regionsPlugins[0]?.regions).toMatchObject([
			{ start: 4, end: 6 },
		]);
		expect(onSelectionRegionAvailabilityChange).toHaveBeenCalledExactlyOnceWith(
			true,
		);
	});

	it("keeps the canvas fallback after a renderer initialization error", async () => {
		render(<WaveformSurface {...surfaceProps} />);
		await waitFor(() => expect(mockState.wavesurfers).toHaveLength(1));
		const renderer = mockState.wavesurfers[0];
		act(() => renderer?.emit("error", new Error("Initialization failed")));
		act(() => renderer?.emit("redrawcomplete"));

		const surface = screen.getByLabelText("Voice waveform detail");
		expect(surface.getAttribute("data-renderer")).toBe("fallback");
		expect(surface.querySelector("canvas")).not.toBeNull();
		expect(renderer?.destroyed).toBe(true);
		expect(mockState.regionsPlugins[0]?.regions).toHaveLength(0);
	});

	it("uses native region grips as entry points for the timeline gesture", async () => {
		const onPlayheadSeekRequested = vi.fn();
		const onSelectionGestureStart = vi.fn();
		const { rerender } = render(
			<WaveformSurface
				{...surfaceProps}
				onPlayheadSeekRequested={onPlayheadSeekRequested}
				onSelectionGestureStart={onSelectionGestureStart}
			/>,
		);

		await waitFor(() => expect(mockState.wavesurfers).toHaveLength(1));
		expect(mockState.wavesurfers[0]?.options.height).toBe(48);
		act(() => mockState.wavesurfers[0]?.emit("redrawcomplete"));
		const [region] = mockState.regionsPlugins[0]?.regions ?? [];
		if (!region) throw new Error("Expected a Waveform region.");
		const left = region.element.firstElementChild;
		const right = region.element.lastElementChild;
		if (!left || !right) throw new Error("Expected Waveform grips.");
		const nativeDrag = vi.fn();
		left.addEventListener("pointerdown", nativeDrag);

		fireEvent.pointerDown(left);
		fireEvent.pointerDown(right);
		fireEvent.pointerDown(region.element);
		expect(nativeDrag).not.toHaveBeenCalled();
		expect(
			onSelectionGestureStart.mock.calls.map(([, element, kind, origin]) => [
				element,
				kind,
				origin,
			]),
		).toEqual([
			[region.element, "start", "waveform"],
			[region.element, "end", "waveform"],
			[region.element, "range", "waveform"],
		]);

		rerender(
			<WaveformSurface
				{...surfaceProps}
				onPlayheadSeekRequested={onPlayheadSeekRequested}
				onSelectionGestureStart={onSelectionGestureStart}
				selection={{ startUs: 3_000_000, endUs: 7_000_000 }}
				selectionEditInProgress
			/>,
		);
		expect(region).toMatchObject({ start: 3, end: 7 });
		act(() => mockState.wavesurfers[0]?.emit("click", 0.25));
		expect(onPlayheadSeekRequested).toHaveBeenCalledWith(3_000_000);
	});

	it("cancels a region gesture and detaches its listeners when waveform data changes", async () => {
		const cancelGesture = vi.fn();
		const onSelectionGestureStart = vi.fn(() => cancelGesture);
		const props = { ...surfaceProps, onSelectionGestureStart };
		const { container, rerender } = render(<WaveformSurface {...props} />);

		await waitFor(() => expect(mockState.wavesurfers).toHaveLength(1));
		act(() => mockState.wavesurfers[0]?.emit("redrawcomplete"));
		const hiddenContainer = container.querySelector("[aria-hidden='true']");
		hiddenContainer?.append(document.createElement("wave"));
		const [region] = mockState.regionsPlugins[0]?.regions ?? [];
		if (!region) throw new Error("Expected a Waveform region.");
		fireEvent.pointerDown(region.element);
		expect(onSelectionGestureStart).toHaveBeenCalledTimes(1);

		rerender(<WaveformSurface {...props} samples={[0.4, 0.9, 0.1]} />);

		await waitFor(() => expect(mockState.wavesurfers).toHaveLength(2));
		expect(cancelGesture).toHaveBeenCalledTimes(1);
		fireEvent.pointerDown(region.element);
		expect(onSelectionGestureStart).toHaveBeenCalledTimes(1);
		expect(mockState.wavesurfers[0]?.destroyed).toBe(true);
		expect(mockState.wavesurfers[0]?.listenerCount("click")).toBe(0);
		expect(hiddenContainer?.childElementCount).toBe(0);
	});

	it("does not create a Wavesurfer renderer when async imports resolve after unmount", async () => {
		const { unmount } = render(<WaveformSurface {...surfaceProps} />);

		unmount();
		await Promise.resolve();
		await Promise.resolve();

		expect(mockState.wavesurfers).toHaveLength(0);
	});
});
