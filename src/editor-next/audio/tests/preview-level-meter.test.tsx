/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PreviewLevelMeter } from "../meters/preview-level-meter";
import { selectPreviewLevelMeterTicksForHeight } from "../meters/preview-level-meter-scale";
import { previewPeakMeterVisualRange } from "../meters/preview-level-meter.constants";

afterEach(() => {
	cleanup();
});

describe("PreviewLevelMeter", () => {
	it("renders prepared ready channel values through a signal-agnostic channels array", () => {
		render(
			<PreviewLevelMeter
				channels={[
					{ clipHeld: false, label: "Left", peakDb: -18 },
					{ clipHeld: true, label: "Right", peakDb: 0 },
				]}
				label="Voice preview meter"
				state="ready"
			/>,
		);

		const meter = screen.getByLabelText("Voice preview meter");
		expect(meter.getAttribute("data-state")).toBe("ready");
		expect(meter.getAttribute("data-orientation")).toBe("vertical");

		const left = within(meter).getByRole("meter", { name: "Left level" });
		const right = within(meter).getByRole("meter", { name: "Right level" });

		expect(left.getAttribute("aria-valuemin")).toBe("-90");
		expect(left.getAttribute("aria-valuemax")).toBe("0");
		expect(left.getAttribute("aria-valuenow")).toBe("-18");
		expect(left.getAttribute("aria-valuetext")).toBe("-18 dBFS");
		expect(within(meter).getByText("Left")).toBeTruthy();
		expect(right.getAttribute("aria-valuenow")).toBe("0");
		expect(right.getAttribute("aria-valuetext")).toBe("0 dBFS, clip held");
		expect(within(meter).getByLabelText("Right clip held")).toBeTruthy();
	});

	it("progressively reduces vertical dBFS markers when the meter is short", () => {
		const fullTicks = [
			0, -4, -8, -12, -16, -20, -24, -28, -32, -36, -40, -50, -60, -70, -80,
			-90,
		];
		const compactTicks = selectPreviewLevelMeterTicksForHeight({
			heightPx: 180,
			orientation: "vertical",
			range: previewPeakMeterVisualRange,
			ticks: fullTicks,
		});
		const mediumTicks = selectPreviewLevelMeterTicksForHeight({
			heightPx: 340,
			orientation: "vertical",
			range: previewPeakMeterVisualRange,
			ticks: fullTicks,
		});
		const tallTicks = selectPreviewLevelMeterTicksForHeight({
			heightPx: 640,
			orientation: "vertical",
			range: previewPeakMeterVisualRange,
			ticks: fullTicks,
		});

		expect(compactTicks).toEqual([0, -24, -50, -90]);
		expect(mediumTicks.length).toBeGreaterThan(compactTicks.length);
		expect(mediumTicks.length).toBeLessThan(fullTicks.length);
		expect(tallTicks).toEqual(fullTicks);
		expect(compactTicks).not.toContain(-4);
		expect(tallTicks).toContain(-4);
	});

	it("renders generic preparing and unavailable states without owning actions", () => {
		render(
			<PreviewLevelMeter
				channels={[]}
				label="Preparing preview meter"
				message="Preparing decoded samples"
				state="preparing"
			/>,
		);

		const preparing = screen.getByLabelText("Preparing preview meter");
		expect(preparing.getAttribute("data-state")).toBe("preparing");
		expect(
			within(preparing).getByText("Preparing decoded samples"),
		).toBeTruthy();
		expect(within(preparing).queryByRole("meter")).toBeNull();
		expect(within(preparing).queryByRole("button")).toBeNull();

		cleanup();

		render(
			<PreviewLevelMeter
				channels={[]}
				label="Unavailable preview meter"
				state="unavailable"
			/>,
		);

		const unavailable = screen.getByLabelText("Unavailable preview meter");
		expect(unavailable.getAttribute("data-state")).toBe("unavailable");
		expect(within(unavailable).getByText("Meter unavailable")).toBeTruthy();
		expect(within(unavailable).queryByRole("meter")).toBeNull();
		expect(within(unavailable).queryByRole("button")).toBeNull();
	});

	it("preserves multichannel labels and displayed levels", () => {
		render(
			<PreviewLevelMeter
				channels={[
					{ clipHeld: false, label: "FL", peakDb: -18 },
					{ clipHeld: false, label: "FR", peakDb: -21 },
					{ clipHeld: false, label: "C", peakDb: -24 },
					{ clipHeld: false, label: "LFE", peakDb: -30 },
				]}
				label="Surround preview meter"
				state="ready"
			/>,
		);

		const meter = screen.getByLabelText("Surround preview meter");
		expect(within(meter).getByText("FL")).toBeTruthy();
		expect(within(meter).getByText("FR")).toBeTruthy();
		expect(within(meter).getByText("C")).toBeTruthy();
		expect(within(meter).getByText("LFE")).toBeTruthy();
		expect(
			within(meter)
				.getByRole("meter", { name: "LFE level" })
				.getAttribute("aria-valuetext"),
		).toBe("-30 dBFS");
	});
});
