/* @vitest-environment jsdom */

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	WaveformSurface,
	createWavesurferPeaksFromSamples,
} from "./selection-waveform-surface";

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
	}>,
}));

type MockRegion = {
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
			const region = {
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
	vi.unstubAllGlobals();
});

describe("createWavesurferPeaksFromSamples", () => {
	it("converts normalized lane buckets into finite Wavesurfer peaks", () => {
		expect(Array.from(createWavesurferPeaksFromSamples([]))).toEqual([0]);
		expect(
			Array.from(
				createWavesurferPeaksFromSamples([
					0,
					0.25,
					1,
					1.5,
					Number.NaN,
					Number.POSITIVE_INFINITY,
					-0.2,
				]),
			),
		).toEqual([0, 0.25, 1, 1, 0, 0, 0]);
	});

	it("creates one editable Regions selection and emits live preview plus commit changes", async () => {
		const onPlayheadSeekRequested = vi.fn();
		const onSelectionCommitRequested = vi.fn();
		const onSelectionPreviewRequested = vi.fn();

		render(
			<WaveformSurface
				durationUs={12_000_000}
				label="Voice"
				minimumSelectionDurationUs={33_333}
				onPlayheadSeekRequested={onPlayheadSeekRequested}
				onSelectionCommitRequested={onSelectionCommitRequested}
				onSelectionPreviewRequested={onSelectionPreviewRequested}
				samples={[0.2, 0.7, 0.4]}
				selection={{
					endUs: 6_000_000,
					startUs: 2_000_000,
				}}
				selectionEditingDisabled={false}
				selectionEditInProgress={false}
			/>,
		);

		await waitFor(() => expect(mockState.wavesurfers).toHaveLength(1));
		expect(mockState.wavesurfers[0]?.options.height).toBe(48);
		act(() => {
			mockState.wavesurfers[0]?.emit("redrawcomplete");
		});
		await waitFor(() => {
			expect(mockState.regionsPlugins[0]?.regions).toHaveLength(1);
		});

		const regionsPlugin = mockState.regionsPlugins[0];
		const region = regionsPlugin?.regions[0];

		expect(region).toMatchObject({
			end: 6,
			start: 2,
		});

		if (!region || !regionsPlugin) {
			throw new Error("Expected mocked selection region.");
		}

		region.start = 3;
		act(() => {
			regionsPlugin.emit("region-update", region, "start");
		});

		expect(onSelectionPreviewRequested).toHaveBeenLastCalledWith({
			initialSelection: {
				endUs: 6_000_000,
				startUs: 2_000_000,
			},
			selection: {
				endUs: 6_000_000,
				startUs: 3_000_000,
			},
			side: "start",
		});

		act(() => {
			regionsPlugin.emit("region-updated", region, "start");
		});

		expect(onSelectionCommitRequested).toHaveBeenLastCalledWith({
			initialSelection: {
				endUs: 6_000_000,
				startUs: 2_000_000,
			},
			selection: {
				endUs: 6_000_000,
				startUs: 3_000_000,
			},
			side: "start",
		});

		act(() => {
			mockState.wavesurfers[0]?.emit("click", 0.25);
		});

		expect(onPlayheadSeekRequested).toHaveBeenCalledWith(3_000_000);
	});

	it("suppresses a freshly mounted region until the active selection edit commits", async () => {
		const props = {
			durationUs: 12_000_000,
			label: "Voice",
			minimumSelectionDurationUs: 33_333,
			onPlayheadSeekRequested: vi.fn(),
			onSelectionCommitRequested: vi.fn(),
			onSelectionPreviewRequested: vi.fn(),
			samples: [0.2, 0.7, 0.4],
			selection: {
				endUs: 6_000_000,
				startUs: 2_000_000,
			},
			selectionEditingDisabled: false,
		};
		const { rerender } = render(
			<WaveformSurface {...props} selectionEditInProgress={true} />,
		);

		await waitFor(() => expect(mockState.wavesurfers).toHaveLength(1));
		act(() => {
			mockState.wavesurfers[0]?.emit("redrawcomplete");
		});

		expect(mockState.regionsPlugins[0]?.regions).toHaveLength(0);

		rerender(<WaveformSurface {...props} selectionEditInProgress={false} />);

		await waitFor(() => {
			expect(mockState.regionsPlugins[0]?.regions).toHaveLength(1);
		});
	});

	it("does not recreate Wavesurfer when parent rerenders with fresh callback identities", async () => {
		const samples = [0.2, 0.7, 0.4];
		const selection = {
			endUs: 6_000_000,
			startUs: 2_000_000,
		};
		const props = {
			durationUs: 12_000_000,
			label: "Voice",
			minimumSelectionDurationUs: 33_333,
			samples,
			selection,
			selectionEditingDisabled: false,
			selectionEditInProgress: false,
		};
		const { rerender } = render(
			<WaveformSurface
				{...props}
				onPlayheadSeekRequested={vi.fn()}
				onSelectionCommitRequested={vi.fn()}
				onSelectionPreviewRequested={vi.fn()}
			/>,
		);

		await waitFor(() => expect(mockState.wavesurfers).toHaveLength(1));
		act(() => {
			mockState.wavesurfers[0]?.emit("redrawcomplete");
		});
		await waitFor(() => {
			expect(mockState.regionsPlugins[0]?.regions).toHaveLength(1);
		});

		rerender(
			<WaveformSurface
				{...props}
				onPlayheadSeekRequested={vi.fn()}
				onSelectionCommitRequested={vi.fn()}
				onSelectionPreviewRequested={vi.fn()}
			/>,
		);

		expect(mockState.wavesurfers).toHaveLength(1);
		expect(mockState.wavesurfers[0]?.destroyed).toBe(false);
	});

	it("cleans up renderer events, pending previews, and hidden container content when waveform data changes", async () => {
		const cancelAnimationFrame = vi.fn();
		vi.stubGlobal("requestAnimationFrame", () => 41);
		vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
		const onSelectionPreviewRequested = vi.fn();
		const props = {
			durationUs: 12_000_000,
			label: "Voice",
			minimumSelectionDurationUs: 33_333,
			onPlayheadSeekRequested: vi.fn(),
			onSelectionCommitRequested: vi.fn(),
			onSelectionPreviewRequested,
			selection: {
				endUs: 6_000_000,
				startUs: 2_000_000,
			},
			selectionEditingDisabled: false,
			selectionEditInProgress: false,
		};
		const { container, rerender } = render(
			<WaveformSurface {...props} samples={[0.2, 0.7, 0.4]} />,
		);

		await waitFor(() => expect(mockState.wavesurfers).toHaveLength(1));
		act(() => {
			mockState.wavesurfers[0]?.emit("redrawcomplete");
		});
		await waitFor(() => {
			expect(mockState.regionsPlugins[0]?.regions).toHaveLength(1);
		});
		const hiddenContainer = container.querySelector("[aria-hidden='true']");
		hiddenContainer?.append(document.createElement("wave"));
		const regionsPlugin = mockState.regionsPlugins[0];
		const region = regionsPlugin?.regions[0];

		if (!regionsPlugin || !region) {
			throw new Error("Expected mocked waveform region.");
		}

		region.end = 7;
		act(() => {
			regionsPlugin.emit("region-update", region, "end");
		});
		expect(onSelectionPreviewRequested).not.toHaveBeenCalled();

		rerender(<WaveformSurface {...props} samples={[0.4, 0.9, 0.1]} />);

		await waitFor(() => expect(mockState.wavesurfers).toHaveLength(2));
		expect(cancelAnimationFrame).toHaveBeenCalledWith(41);
		expect(mockState.wavesurfers[0]?.destroyed).toBe(true);
		expect(mockState.wavesurfers[0]?.listenerCount("click")).toBe(0);
		expect(mockState.regionsPlugins[0]?.listenerCount("region-update")).toBe(0);
		expect(hiddenContainer?.childElementCount).toBe(0);
	});

	it("does not create a Wavesurfer renderer when async imports resolve after unmount", async () => {
		const { unmount } = render(
			<WaveformSurface
				durationUs={12_000_000}
				label="Voice"
				minimumSelectionDurationUs={33_333}
				onPlayheadSeekRequested={vi.fn()}
				onSelectionCommitRequested={vi.fn()}
				onSelectionPreviewRequested={vi.fn()}
				samples={[0.2, 0.7, 0.4]}
				selection={{
					endUs: 6_000_000,
					startUs: 2_000_000,
				}}
				selectionEditingDisabled={false}
				selectionEditInProgress={false}
			/>,
		);

		unmount();
		await Promise.resolve();
		await Promise.resolve();

		expect(mockState.wavesurfers).toHaveLength(0);
	});
});
