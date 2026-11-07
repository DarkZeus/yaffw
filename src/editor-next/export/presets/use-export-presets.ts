import { useState } from "react";
import type { OutputSettings } from "@/editor-core/model";
import { cloneOutputSettings } from "@/editor-core/output-settings";
import {
	type ExportPreset,
	type ExportPresetDocument,
	LAST_USED_SETTINGS_PRESET_NAME,
	deleteExportPreset,
	readExportPresetDocument,
	saveExportPreset,
} from "./export-preset-store";

export type PresetConfirmation =
	| {
			kind: "overwrite";
			name: string;
			outputSettings: OutputSettings;
			source: "save" | "update";
	  }
	| { kind: "delete"; name: string };

type PresetInteraction =
	| PresetConfirmation
	| { kind: "error" | "success"; message: string }
	| null;

export type ExportPresetOptions = {
	draft: OutputSettings;
	draftIsValid: boolean;
	exportRunning: boolean;
	onLoadPreset: (preset: ExportPreset) => void;
};

export function useExportPresets({
	draft,
	draftIsValid,
	exportRunning,
	onLoadPreset,
}: ExportPresetOptions) {
	const [presetDocument, setPresetDocument] =
		useState<ExportPresetDocument | null>(null);
	const [selectedPresetName, setSelectedPresetName] = useState("");
	const [presetName, setPresetName] = useState("");
	const [interaction, setInteraction] = useState<PresetInteraction>(null);
	const [panelOpen, setPanelOpen] = useState(false);
	const confirmation =
		interaction?.kind === "overwrite" || interaction?.kind === "delete"
			? interaction
			: null;
	const lastUsedSettings = presetDocument?.lastUsedSettings;
	const exportPresets: ExportPreset[] = [
		...(lastUsedSettings
			? [
					{
						name: LAST_USED_SETTINGS_PRESET_NAME,
						outputSettings: lastUsedSettings,
					},
				]
			: []),
		...(presetDocument?.userPresets ?? []),
	];
	const selectedPreset = exportPresets.find(
		(preset) => preset.name === selectedPresetName,
	);
	const selectedUserPreset =
		selectedPreset && selectedPreset.name !== LAST_USED_SETTINGS_PRESET_NAME
			? selectedPreset
			: undefined;
	const canLoad = !!selectedPreset && !exportRunning;
	const canSave = draftIsValid && !exportRunning;
	const canDelete = !!selectedUserPreset && !exportRunning;
	const canUpdate = canSave && canDelete;

	function togglePresetPanel() {
		setPanelOpen(!panelOpen);
		setInteraction(null);
		if (panelOpen) return;

		try {
			setPresetDocument(readExportPresetDocument(window.localStorage));
		} catch {
			setInteraction({
				kind: "error",
				message: "Saved Export presets could not be read.",
			});
		}
	}

	function loadSelectedPreset() {
		if (!canLoad) return;

		onLoadPreset(selectedPreset);
		setPresetName(selectedUserPreset?.name ?? "");
		setInteraction({
			kind: "success",
			message: `${selectedPreset.name} loaded into the draft. Apply to update the editing session.`,
		});
	}

	function requestOverwrite(name: string, source: "save" | "update") {
		setInteraction({
			kind: "overwrite",
			name,
			outputSettings: cloneOutputSettings(draft),
			source,
		});
	}

	function savePreset(
		name: string,
		outputSettings: OutputSettings,
		overwrite = false,
	) {
		try {
			const result = saveExportPreset({
				name,
				outputSettings,
				overwrite,
				storage: window.localStorage,
			});
			if (result.kind === "collision") {
				requestOverwrite(result.name, "save");
				return;
			}

			setPresetDocument(result.document);
			setPresetName(result.name);
			setSelectedPresetName(result.name);
			setInteraction({
				kind: "success",
				message: `${result.name} ${result.kind === "overwritten" ? "updated" : "saved"}.`,
			});
		} catch (error) {
			setInteraction({
				kind: "error",
				message:
					error instanceof Error
						? error.message
						: "The Export preset could not be saved.",
			});
		}
	}

	function requestSave() {
		if (canSave) savePreset(presetName, draft);
	}

	function requestUpdate() {
		if (canUpdate) requestOverwrite(selectedUserPreset.name, "update");
	}

	function requestDelete() {
		if (canDelete) {
			setInteraction({ kind: "delete", name: selectedUserPreset.name });
		}
	}

	function dismissConfirmation() {
		if (confirmation) setInteraction(null);
	}

	function confirmPresetChange() {
		if (!confirmation || exportRunning) return;
		if (confirmation.kind === "overwrite") {
			if (canSave)
				savePreset(confirmation.name, confirmation.outputSettings, true);
			return;
		}

		try {
			const document = deleteExportPreset(
				window.localStorage,
				confirmation.name,
			);
			setPresetDocument(document);
			setSelectedPresetName("");
			setPresetName((name) => (name === confirmation.name ? "" : name));
			setInteraction({
				kind: "success",
				message: `${confirmation.name} deleted.`,
			});
		} catch {
			setInteraction({
				kind: "error",
				message: "The Export preset could not be deleted.",
			});
		}
	}

	function selectPreset(name: string) {
		setSelectedPresetName(name);
		changePresetName(name === LAST_USED_SETTINGS_PRESET_NAME ? "" : name);
	}

	function changePresetName(name: string) {
		setPresetName(name);
		setInteraction(null);
	}

	return {
		canChoosePreset: !exportRunning && exportPresets.length > 0,
		canConfirm:
			confirmation?.kind === "overwrite"
				? canSave
				: confirmation?.kind === "delete" && canDelete,
		canDelete,
		canLoad,
		canSave,
		canUpdate,
		changePresetName,
		confirmation,
		confirmPresetChange,
		dismissConfirmation,
		exportPresets,
		interaction,
		loadSelectedPreset,
		panelOpen,
		presetName,
		requestDelete,
		requestSave,
		requestUpdate,
		selectedPreset,
		selectPreset,
		togglePresetPanel,
	};
}
