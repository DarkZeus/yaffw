/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
	PreviewLevelMeter,
	previewPeakMeterClipDb,
	previewPeakMeterVisualRange,
	previewPeakMeterZones,
} from "./preview-level-meter";

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

		expect(left.getAttribute("aria-valuemin")).toBe("-72");
		expect(left.getAttribute("aria-valuemax")).toBe("0");
		expect(left.getAttribute("aria-valuenow")).toBe("-18");
		expect(left.getAttribute("aria-valuetext")).toBe("-18 dBFS");
		expect(within(meter).getByText("Left")).toBeTruthy();
		expect(right.getAttribute("aria-valuenow")).toBe("0");
		expect(right.getAttribute("aria-valuetext")).toBe("0 dBFS, clip held");
		expect(within(meter).getByLabelText("Right clip held")).toBeTruthy();
	});

	it("supports horizontal orientation and can hide fixed dBFS tick labels", () => {
		render(
			<PreviewLevelMeter
				channels={[{ clipHeld: false, label: "Mono", peakDb: -40 }]}
				label="Horizontal preview meter"
				orientation="horizontal"
				state="ready"
			/>,
		);

		const meter = screen.getByLabelText("Horizontal preview meter");
		expect(meter.getAttribute("data-orientation")).toBe("horizontal");
		expect(within(meter).getByText("Mono")).toBeTruthy();
		expect(
			within(meter)
				.getByRole("meter", { name: "Mono level" })
				.getAttribute("aria-valuenow"),
		).toBe("-40");
		expect(within(meter).getByText("0 dBFS")).toBeTruthy();
		expect(within(meter).getByText("-72 dBFS")).toBeTruthy();

		cleanup();

		render(
			<PreviewLevelMeter
				channels={[{ clipHeld: false, label: "Mono", peakDb: -40 }]}
				label="Compact horizontal preview meter"
				orientation="horizontal"
				showTickLabels={false}
				state="ready"
			/>,
		);

		const compactMeter = screen.getByLabelText(
			"Compact horizontal preview meter",
		);
		expect(within(compactMeter).queryByText("0 dBFS")).toBeNull();
		expect(within(compactMeter).queryByText("-72 dBFS")).toBeNull();
	});

	it("uses the default preview peak meter range and OBS-style zones", () => {
		expect(previewPeakMeterVisualRange).toEqual({
			ceilingDb: 0,
			floorDb: -72,
		});
		expect(previewPeakMeterClipDb).toBe(0);
		expect(
			previewPeakMeterZones.map(({ fromDb, id, toDb }) => ({
				fromDb,
				id,
				toDb,
			})),
		).toEqual([
			{ fromDb: -72, id: "green", toDb: -20 },
			{ fromDb: -20, id: "yellow", toDb: -9 },
			{ fromDb: -9, id: "red", toDb: 0 },
		]);

		render(
			<PreviewLevelMeter
				channels={[{ clipHeld: false, label: "Left", peakDb: -12 }]}
				label="Zone preview meter"
				state="ready"
			/>,
		);

		const meter = screen.getByLabelText("Zone preview meter");
		expect(within(meter).getByText("0 dBFS")).toBeTruthy();
		expect(within(meter).getByText("-9 dBFS")).toBeTruthy();
		expect(within(meter).getByText("-20 dBFS")).toBeTruthy();
		expect(within(meter).getByText("-72 dBFS")).toBeTruthy();
		expect(within(meter).getByText("Green zone -72 to -20 dBFS")).toBeTruthy();
		expect(within(meter).getByText("Yellow zone -20 to -9 dBFS")).toBeTruthy();
		expect(within(meter).getByText("Red zone -9 to 0 dBFS")).toBeTruthy();
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

	it("renders supplied multichannel labels inside a horizontally scrollable channel region", () => {
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
		const channels = within(meter).getByLabelText(
			"Surround preview meter channels",
		);

		expect(channels.className).toContain("overflow-x-auto");
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
