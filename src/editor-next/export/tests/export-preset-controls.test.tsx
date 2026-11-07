/* @vitest-environment jsdom */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createDefaultOutputSettings,
	type ReadyMediaAsset,
} from "@/editor-core/model";
import { OutputSettingsPanel } from "../inspector/output-settings-panel";
import {
	EXPORT_PRESET_STORAGE_KEY,
	readExportPresetDocument,
} from "../presets/export-preset-store";

const asset: ReadyMediaAsset = {
	durationUs: 1_000_000,
	frameTiming: {
		analysis: null,
		fps: 30,
		frameDurationUs: 33_333,
		reason: "No frame timing sample.",
		source: "estimated",
	},
	id: "test-asset",
	label: "clip.mp4",
	provenance: { fileName: "clip.mp4", mimeType: "video/mp4", sizeBytes: 1024 },
	tracks: {
		audio: [],
		video: [
			{ codec: "avc", height: 1080, id: "video-1", kind: "video", width: 1920 },
		],
	},
};

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function click(name: string | RegExp, container = document.body) {
	fireEvent.click(within(container).getByRole("button", { name }));
}

function openOutputSettings() {
	const onApply = vi.fn();
	render(
		<OutputSettingsPanel
			asset={asset}
			audioMix={{ finalPeakGuardDb: -1, outputChannels: 2, tracks: {} }}
			exportRunning={false}
			onApplyOutputSettings={onApply}
			outputSettings={createDefaultOutputSettings()}
		/>,
	);
	click("Output settings");
	return onApply;
}

function saveNewPreset(name: string) {
	fireEvent.change(screen.getByLabelText("Export preset name"), {
		target: { value: name },
	});
	click("Save preset");
}

function readPresets() {
	return readExportPresetDocument(window.localStorage).userPresets;
}

describe("Export preset confirmations in Output settings", () => {
	it("saves a new name and requires confirmation for both overwrite paths", () => {
		const onApply = openOutputSettings();
		click("Presets");
		saveNewPreset("  Web sharing  ");
		const original = readPresets();
		expect(original.map((preset) => preset.name)).toEqual(["Web sharing"]);
		expect(screen.getByText("Web sharing saved.")).toBeTruthy();
		fireEvent.change(screen.getByLabelText("Container"), {
			target: { value: "webm" },
		});

		click("Update");
		expect(readPresets()).toEqual(original);
		const updateConfirmation = screen.getByRole("dialog", {
			name: "Overwrite Export preset",
		});
		click("Cancel", updateConfirmation);
		expect(readPresets()).toEqual(original);

		click("Save preset");
		const saveConfirmation = screen.getByRole("dialog", {
			name: "Overwrite Export preset",
		});
		click("Overwrite", saveConfirmation);
		expect(readPresets()).toEqual([
			expect.objectContaining({
				name: "Web sharing",
				outputSettings: expect.objectContaining({
					container: { container: "webm", kind: "documented-container" },
				}),
			}),
		]);
		expect(screen.getByText("Web sharing updated.")).toBeTruthy();
		expect(onApply).not.toHaveBeenCalled();
	});

	it("preserves the selected preset when deletion fails and supports retry", () => {
		openOutputSettings();
		click("Presets");
		saveNewPreset("Web sharing");
		const original = readPresets();
		click("Delete selected Export preset");
		expect(readPresets()).toEqual(original);
		const confirm = () =>
			screen.getByRole("dialog", { name: "Delete Export preset" });
		click("Cancel", confirm());
		expect(readPresets()).toEqual(original);
		click("Delete selected Export preset");
		vi.spyOn(window.localStorage, "setItem").mockImplementationOnce(() => {
			throw new Error("Quota exceeded");
		});
		click("Delete", confirm());
		expect(readPresets()).toEqual(original);
		expect(screen.getByRole("alert").textContent).toBe(
			"The Export preset could not be deleted.",
		);
		expect(
			screen.getByRole<HTMLOptionElement>("option", { name: "Web sharing" })
				.selected,
		).toBe(true);

		click("Delete selected Export preset");
		click("Delete", confirm());
		expect(readPresets()).toEqual([]);
		expect(screen.queryByRole("option", { name: "Web sharing" })).toBeNull();
		expect(screen.getByText("Web sharing deleted.")).toBeTruthy();
	});

	it("loads a saved preset into the draft and applies it only on Apply", () => {
		const onApply = openOutputSettings();
		fireEvent.change(screen.getByLabelText("Container"), {
			target: { value: "webm" },
		});
		click("Presets");
		saveNewPreset("Web sharing");
		fireEvent.change(screen.getByLabelText("Container"), {
			target: { value: "default-output-profile" },
		});
		click("Load");
		expect(screen.getByLabelText<HTMLSelectElement>("Container").value).toBe(
			"webm",
		);
		expect(onApply).not.toHaveBeenCalled();
		click("Apply");
		expect(onApply).toHaveBeenCalledExactlyOnceWith(
			readPresets()[0].outputSettings,
		);
	});

	it("reports unreadable stored presets and preserves the original data", () => {
		const unsupported = '{"version":2,"userPresets":[]}';
		window.localStorage.setItem(EXPORT_PRESET_STORAGE_KEY, unsupported);
		openOutputSettings();
		click("Presets");
		expect(screen.getByRole("alert").textContent).toContain(
			"could not be read",
		);
		saveNewPreset("Web sharing");
		expect(screen.getByRole("alert").textContent).toContain(
			"could not be read",
		);
		expect(window.localStorage.getItem(EXPORT_PRESET_STORAGE_KEY)).toBe(
			unsupported,
		);
	});
});
