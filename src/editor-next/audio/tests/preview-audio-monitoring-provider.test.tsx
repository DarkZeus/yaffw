/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
	PreviewAudioMonitoringProvider,
	usePreviewAudioMonitoring,
} from "../engine/preview-audio-monitoring-provider";

afterEach(cleanup);

describe("PreviewAudioMonitoringProvider", () => {
	it("synchronizes one preview solo identity across consumers and resets for a new asset", () => {
		const view = render(
			<PreviewAudioMonitoringProvider assetId="asset-one">
				<MonitoringControl label="Audio" trackId="audio-voice" />
				<MonitoringControl label="Waveform" trackId="audio-desktop" />
			</PreviewAudioMonitoringProvider>,
		);

		expect(screen.getByLabelText("Audio solo state").textContent).toBe("off");
		expect(screen.getByLabelText("Waveform solo state").textContent).toBe(
			"off",
		);

		fireEvent.click(screen.getByRole("button", { name: "Toggle Audio solo" }));

		expect(screen.getByLabelText("Audio solo state").textContent).toBe("on");
		expect(screen.getByLabelText("Waveform solo state").textContent).toBe(
			"off",
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Toggle Waveform solo" }),
		);

		expect(screen.getByLabelText("Audio solo state").textContent).toBe("off");
		expect(screen.getByLabelText("Waveform solo state").textContent).toBe("on");

		fireEvent.click(
			screen.getByRole("button", { name: "Toggle Waveform solo" }),
		);

		expect(screen.getByLabelText("Audio solo state").textContent).toBe("off");
		expect(screen.getByLabelText("Waveform solo state").textContent).toBe(
			"off",
		);

		fireEvent.click(screen.getByRole("button", { name: "Toggle Audio solo" }));

		view.rerender(
			<PreviewAudioMonitoringProvider assetId="asset-two">
				<MonitoringControl label="Audio" trackId="audio-voice" />
				<MonitoringControl label="Waveform" trackId="audio-desktop" />
			</PreviewAudioMonitoringProvider>,
		);

		expect(screen.getByLabelText("Audio solo state").textContent).toBe("off");
		expect(screen.getByLabelText("Waveform solo state").textContent).toBe(
			"off",
		);
	});
});

function MonitoringControl({
	label,
	trackId,
}: {
	label: string;
	trackId: string;
}) {
	const { soloedAudioTrackId, toggleSoloedAudioTrack } =
		usePreviewAudioMonitoring();

	return (
		<div>
			<output aria-label={`${label} solo state`}>
				{soloedAudioTrackId === trackId ? "on" : "off"}
			</output>
			<button
				aria-label={`Toggle ${label} solo`}
				onClick={() => toggleSoloedAudioTrack(trackId)}
				type="button"
			/>
		</div>
	);
}
