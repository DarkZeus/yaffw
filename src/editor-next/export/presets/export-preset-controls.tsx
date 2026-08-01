import { Bookmark, ChevronUp, FolderOpen, Save, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OutputSettings } from "@/editor-core/model";
import {
	type ExportPreset,
	LAST_USED_SETTINGS_PRESET_NAME,
	deleteExportPreset,
	readExportPresetDocument,
	saveExportPreset,
} from "./export-preset-store";

export function ExportPresetControls({
	draft,
	draftIsValid,
	exportRunning,
	onLoadPreset,
}: {
	draft: OutputSettings;
	draftIsValid: boolean;
	exportRunning: boolean;
	onLoadPreset: (preset: ExportPreset) => void;
}) {
	const [lastUsedSettings, setLastUsedSettings] =
		useState<OutputSettings | null>(() => {
			try {
				return (
					readExportPresetDocument(window.localStorage).lastUsedSettings ?? null
				);
			} catch {
				return null;
			}
		});
	const [userPresets, setUserPresets] = useState<ExportPreset[]>(() => {
		try {
			return readExportPresetDocument(window.localStorage).userPresets;
		} catch {
			return [];
		}
	});
	const [selectedPresetName, setSelectedPresetName] = useState("");
	const [presetName, setPresetName] = useState("");
	const [presetError, setPresetError] = useState<string | null>(null);
	const [presetMessage, setPresetMessage] = useState<string | null>(null);
	const [overwritePresetName, setOverwritePresetName] = useState<string | null>(
		null,
	);
	const [deletePresetName, setDeletePresetName] = useState<string | null>(null);
	const [panelOpen, setPanelOpen] = useState(false);
	const exportPresets: ExportPreset[] = [
		...(lastUsedSettings
			? [
					{
						name: LAST_USED_SETTINGS_PRESET_NAME,
						outputSettings: lastUsedSettings,
					},
				]
			: []),
		...userPresets,
	];
	const selectedPresetIsSystem =
		selectedPresetName === LAST_USED_SETTINGS_PRESET_NAME;

	function refreshExportPresets() {
		const document = readExportPresetDocument(window.localStorage);
		setLastUsedSettings(document.lastUsedSettings ?? null);
		setUserPresets(document.userPresets);
	}

	function loadSelectedPreset() {
		const preset = exportPresets.find(
			(candidate) => candidate.name === selectedPresetName,
		);
		if (!preset) {
			return;
		}

		onLoadPreset(preset);
		setPresetName(
			preset.name === LAST_USED_SETTINGS_PRESET_NAME ? "" : preset.name,
		);
		setPresetError(null);
		setPresetMessage(
			`${preset.name} loaded into the draft. Apply to update the editing session.`,
		);
		setOverwritePresetName(null);
		setDeletePresetName(null);
	}

	function saveDraftAsPreset(overwrite = false) {
		if (!draftIsValid || exportRunning) {
			return;
		}

		try {
			const result = saveExportPreset({
				name: presetName,
				outputSettings: draft,
				overwrite,
				storage: window.localStorage,
			});
			if (result.kind === "collision") {
				setOverwritePresetName(result.preset.name);
				setPresetError(null);
				setPresetMessage(null);
				return;
			}

			setPresetName(result.preset.name);
			setSelectedPresetName(result.preset.name);
			setPresetError(null);
			setPresetMessage(`${result.preset.name} saved.`);
			setOverwritePresetName(null);
			setDeletePresetName(null);
			refreshExportPresets();
		} catch (error) {
			setPresetError(
				error instanceof Error
					? error.message
					: "The Export preset could not be saved.",
			);
			setPresetMessage(null);
			setOverwritePresetName(null);
		}
	}

	function updateSelectedPreset() {
		if (
			!selectedPresetName ||
			selectedPresetIsSystem ||
			!draftIsValid ||
			exportRunning
		) {
			return;
		}

		setPresetName(selectedPresetName);
		try {
			const result = saveExportPreset({
				name: selectedPresetName,
				outputSettings: draft,
				overwrite: true,
				storage: window.localStorage,
			});
			if (result.kind !== "saved") {
				return;
			}
			setPresetError(null);
			setPresetMessage(`${result.preset.name} updated.`);
			setOverwritePresetName(null);
			setDeletePresetName(null);
			refreshExportPresets();
		} catch {
			setPresetError("The Export preset could not be updated.");
			setPresetMessage(null);
		}
	}

	function confirmDeletePreset() {
		if (!deletePresetName || exportRunning) {
			return;
		}

		try {
			const deletedName = deletePresetName;
			const document = deleteExportPreset(window.localStorage, deletedName);
			setLastUsedSettings(document.lastUsedSettings ?? null);
			setUserPresets(document.userPresets);
			setSelectedPresetName("");
			setPresetName("");
			setDeletePresetName(null);
			setOverwritePresetName(null);
			setPresetError(null);
			setPresetMessage(`${deletedName} deleted.`);
		} catch {
			setPresetError("The Export preset could not be deleted.");
			setPresetMessage(null);
		}
	}

	return (
		<div className="relative">
			<Button
				aria-expanded={panelOpen}
				aria-haspopup="dialog"
				className="w-full justify-start"
				disabled={exportRunning}
				onClick={() => setPanelOpen((current) => !current)}
				size="sm"
				type="button"
				variant="outline"
			>
				<Bookmark data-icon="inline-start" />
				<span className="min-w-0 flex-1 truncate text-left">
					{selectedPresetName ? `Presets · ${selectedPresetName}` : "Presets"}
				</span>
				<ChevronUp data-icon="inline-end" />
			</Button>
			{panelOpen ? (
				<section
					aria-label="Export presets"
					className="absolute bottom-11 left-0 z-20 grid w-[min(28rem,calc(100vw-2rem))] gap-2.5 rounded border border-workbench-border-strong bg-workbench-inspector p-3 shadow-2xl"
				>
					<div>
						<div className="text-xs font-semibold text-foreground">
							Export presets
						</div>
						<p className="mt-1 text-[11px] leading-4 text-muted-foreground">
							Save browser-local settings or load them into this draft. Apply is
							still required.
						</p>
					</div>
					<div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
						<label className="grid gap-1.5 text-xs font-medium text-foreground">
							<span>Saved preset</span>
							<select
								aria-label="Saved Export preset"
								className="h-8 min-w-0 rounded border border-workbench-border bg-workbench-hover/35 px-2 text-sm text-foreground outline-none focus:border-workbench-focus focus:ring-2 focus:ring-workbench-focus/25"
								disabled={exportRunning || exportPresets.length === 0}
								onChange={(event) => {
									const name = event.currentTarget.value;
									setSelectedPresetName(name);
									setPresetName(
										name === LAST_USED_SETTINGS_PRESET_NAME ? "" : name,
									);
									setPresetError(null);
									setPresetMessage(null);
									setOverwritePresetName(null);
									setDeletePresetName(null);
								}}
								value={selectedPresetName}
							>
								<option value="">
									{exportPresets.length === 0
										? "No saved presets"
										: "Choose a preset"}
								</option>
								{exportPresets.map((preset) => (
									<option key={preset.name} value={preset.name}>
										{preset.name}
									</option>
								))}
							</select>
						</label>
						<div className="flex items-end gap-1.5">
							<Button
								disabled={!selectedPresetName || exportRunning}
								onClick={loadSelectedPreset}
								size="sm"
								type="button"
								variant="outline"
							>
								<FolderOpen data-icon="inline-start" />
								Load
							</Button>
							<Button
								disabled={
									!selectedPresetName ||
									selectedPresetIsSystem ||
									!draftIsValid ||
									exportRunning
								}
								onClick={updateSelectedPreset}
								size="sm"
								type="button"
								variant="outline"
							>
								Update
							</Button>
							<Button
								aria-label="Delete selected Export preset"
								disabled={
									!selectedPresetName || selectedPresetIsSystem || exportRunning
								}
								onClick={() => setDeletePresetName(selectedPresetName)}
								size="icon"
								type="button"
								variant="outline"
							>
								<Trash2 />
							</Button>
						</div>
					</div>
					<div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
						<label
							className="grid gap-1.5 text-xs font-medium text-foreground"
							htmlFor="export-preset-name"
						>
							<span>Preset name</span>
							<Input
								aria-label="Export preset name"
								disabled={exportRunning}
								id="export-preset-name"
								onChange={(event) => {
									setPresetName(event.currentTarget.value);
									setPresetError(null);
									setOverwritePresetName(null);
								}}
								placeholder="e.g. Web sharing"
								value={presetName}
							/>
						</label>
						<Button
							className="self-end"
							disabled={!draftIsValid || exportRunning}
							onClick={() => saveDraftAsPreset(false)}
							size="sm"
							type="button"
							variant="outline"
						>
							<Save data-icon="inline-start" />
							Save preset
						</Button>
					</div>
					{presetError ? (
						<p className="text-xs text-destructive" role="alert">
							{presetError}
						</p>
					) : null}
					{presetMessage ? (
						<p aria-live="polite" className="text-xs text-muted-foreground">
							{presetMessage}
						</p>
					) : null}
					{overwritePresetName ? (
						<section
							aria-label="Overwrite Export preset"
							className="absolute inset-x-2.5 top-16 z-10 rounded border border-workbench-border-strong bg-workbench-inspector p-3 shadow-xl"
						>
							<p className="text-xs leading-5 text-foreground">
								An Export preset named {overwritePresetName} already exists.
							</p>
							<div className="mt-2 flex justify-end gap-2">
								<Button
									onClick={() => setOverwritePresetName(null)}
									size="sm"
									type="button"
									variant="outline"
								>
									Cancel
								</Button>
								<Button
									onClick={() => saveDraftAsPreset(true)}
									size="sm"
									type="button"
								>
									Overwrite
								</Button>
							</div>
						</section>
					) : null}
					{deletePresetName ? (
						<section
							aria-label="Delete Export preset"
							className="absolute right-2.5 top-16 z-10 w-64 rounded border border-workbench-border-strong bg-workbench-inspector p-3 shadow-xl"
						>
							<p className="text-xs leading-5 text-foreground">
								Delete {deletePresetName}? This cannot be undone.
							</p>
							<div className="mt-2 flex justify-end gap-2">
								<Button
									onClick={() => setDeletePresetName(null)}
									size="sm"
									type="button"
									variant="outline"
								>
									Cancel
								</Button>
								<Button
									onClick={confirmDeletePreset}
									size="sm"
									type="button"
									variant="destructive"
								>
									Delete
								</Button>
							</div>
						</section>
					) : null}
				</section>
			) : null}
		</div>
	);
}
