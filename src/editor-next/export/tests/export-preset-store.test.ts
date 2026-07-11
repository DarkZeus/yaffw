/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";

import { createDefaultOutputSettings } from "@/editor-core/model";
import {
	EXPORT_PRESET_STORAGE_KEY,
	EXPORT_PRESET_STORAGE_VERSION,
	deleteExportPreset,
	readExportPresetDocument,
	saveExportPreset,
	validateExportPresetName,
} from "../presets/export-preset-store";

afterEach(() => {
	window.localStorage.clear();
});

describe("Export preset store", () => {
	it("persists versioned user-created presets with symbolic Preserve source settings", () => {
		const outputSettings = createDefaultOutputSettings();
		outputSettings.videoCodec = { kind: "preserve-source" };

		expect(
			saveExportPreset({
				name: "  Web sharing  ",
				outputSettings,
				storage: window.localStorage,
			}),
		).toMatchObject({ kind: "saved", preset: { name: "Web sharing" } });

		expect(
			JSON.parse(localStorage.getItem(EXPORT_PRESET_STORAGE_KEY) ?? ""),
		).toEqual({
			userPresets: [
				{
					name: "Web sharing",
					outputSettings,
				},
			],
			version: EXPORT_PRESET_STORAGE_VERSION,
		});
		expect(
			readExportPresetDocument(window.localStorage).userPresets[0]
				.outputSettings.videoCodec,
		).toEqual({ kind: "preserve-source" });
	});

	it("treats exact-name collisions as case-sensitive and overwrites in place only when confirmed", () => {
		const original = createDefaultOutputSettings();
		const changed = createDefaultOutputSettings();
		changed.videoQuality = { kind: "subjective-quality", quality: "high" };

		saveExportPreset({
			name: "Web",
			outputSettings: original,
			storage: window.localStorage,
		});
		saveExportPreset({
			name: "web",
			outputSettings: original,
			storage: window.localStorage,
		});
		expect(
			saveExportPreset({
				name: "Web",
				outputSettings: changed,
				storage: window.localStorage,
			}),
		).toMatchObject({ kind: "collision", preset: { name: "Web" } });

		saveExportPreset({
			name: "Web",
			outputSettings: changed,
			overwrite: true,
			storage: window.localStorage,
		});
		const stored = readExportPresetDocument(window.localStorage).userPresets;
		expect(stored.map(({ name }) => name)).toEqual(["Web", "web"]);
		expect(stored[0].outputSettings.videoQuality).toEqual(changed.videoQuality);
	});

	it("deletes only the named preset and rejects empty or reserved names", () => {
		const outputSettings = createDefaultOutputSettings();
		for (const name of ["Web", "Archive"]) {
			saveExportPreset({
				name,
				outputSettings,
				storage: window.localStorage,
			});
		}

		expect(
			deleteExportPreset(window.localStorage, "Web").userPresets.map(
				({ name }) => name,
			),
		).toEqual(["Archive"]);
		expect(() => validateExportPresetName("   ")).toThrow(
			"Enter a preset name.",
		);
		expect(() => validateExportPresetName("Last used settings")).toThrow(
			"Last used settings is a reserved name.",
		);
	});

	it("ignores malformed or unsupported stored documents", () => {
		localStorage.setItem(EXPORT_PRESET_STORAGE_KEY, "not-json");
		expect(readExportPresetDocument(window.localStorage).userPresets).toEqual(
			[],
		);

		localStorage.setItem(
			EXPORT_PRESET_STORAGE_KEY,
			JSON.stringify({ userPresets: [], version: 999 }),
		);
		expect(readExportPresetDocument(window.localStorage).userPresets).toEqual(
			[],
		);
	});
});
