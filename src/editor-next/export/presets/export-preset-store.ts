import type { OutputSettings } from "@/editor-core/model";
import {
	cloneOutputSettings,
	isOutputSettings,
} from "@/editor-core/output-settings";

export const EXPORT_PRESET_STORAGE_KEY = "yaffw.export-presets";
export const EXPORT_PRESET_STORAGE_VERSION = 1;
export const LAST_USED_SETTINGS_PRESET_NAME = "Last used settings";

export type ExportPreset = {
	name: string;
	outputSettings: OutputSettings;
};

export type ExportPresetDocument = {
	lastUsedSettings?: OutputSettings;
	userPresets: ExportPreset[];
	version: typeof EXPORT_PRESET_STORAGE_VERSION;
};

export type ExportPresetStorage = Pick<Storage, "getItem" | "setItem">;

export type SaveExportPresetResult =
	| { kind: "collision"; name: string }
	| {
			kind: "created" | "overwritten";
			document: ExportPresetDocument;
			name: string;
	  };

export function readExportPresetDocument(
	storage: ExportPresetStorage,
): ExportPresetDocument {
	try {
		const stored = storage.getItem(EXPORT_PRESET_STORAGE_KEY);
		if (stored === null) return emptyExportPresetDocument();
		const parsed: unknown = JSON.parse(stored);
		if (!isExportPresetDocument(parsed))
			throw new Error("Invalid Export preset document.");
		return cloneExportPresetDocument(parsed);
	} catch (cause) {
		throw new Error("Saved Export presets could not be read.", { cause });
	}
}

export function saveExportPreset({
	name,
	outputSettings,
	overwrite = false,
	storage,
}: {
	name: string;
	outputSettings: OutputSettings;
	overwrite?: boolean;
	storage: ExportPresetStorage;
}): SaveExportPresetResult {
	const normalizedName = validateExportPresetName(name);
	const document = readExportPresetDocument(storage);
	const existingIndex = document.userPresets.findIndex(
		(preset) => preset.name === normalizedName,
	);

	if (existingIndex >= 0 && !overwrite) {
		return { kind: "collision", name: normalizedName };
	}
	if (existingIndex < 0 && overwrite)
		throw new Error("The Export preset no longer exists.");

	const preset = {
		name: normalizedName,
		outputSettings: cloneOutputSettings(outputSettings),
	} satisfies ExportPreset;

	if (existingIndex >= 0) {
		document.userPresets[existingIndex] = preset;
	} else {
		document.userPresets.push(preset);
	}

	try {
		writeExportPresetDocument(storage, document);
	} catch (cause) {
		throw new Error(
			overwrite
				? "The Export preset could not be updated."
				: "The Export preset could not be saved.",
			{ cause },
		);
	}
	return {
		kind: overwrite ? "overwritten" : "created",
		document,
		name: normalizedName,
	};
}

export function deleteExportPreset(
	storage: ExportPresetStorage,
	name: string,
): ExportPresetDocument {
	const document = readExportPresetDocument(storage);
	document.userPresets = document.userPresets.filter(
		(preset) => preset.name !== name,
	);
	writeExportPresetDocument(storage, document);
	return document;
}

export function saveLastUsedSettings(
	storage: ExportPresetStorage,
	outputSettings: OutputSettings,
): ExportPresetDocument {
	const document = readExportPresetDocument(storage);
	document.lastUsedSettings = cloneOutputSettings(outputSettings);
	writeExportPresetDocument(storage, document);
	return cloneExportPresetDocument(document);
}

function validateExportPresetName(name: string): string {
	const normalizedName = name.trim();
	if (!normalizedName) {
		throw new Error("Enter a preset name.");
	}
	if (normalizedName === LAST_USED_SETTINGS_PRESET_NAME) {
		throw new Error(`${LAST_USED_SETTINGS_PRESET_NAME} is a reserved name.`);
	}
	return normalizedName;
}

function writeExportPresetDocument(
	storage: ExportPresetStorage,
	document: ExportPresetDocument,
) {
	storage.setItem(EXPORT_PRESET_STORAGE_KEY, JSON.stringify(document));
}

function emptyExportPresetDocument(): ExportPresetDocument {
	return {
		userPresets: [],
		version: EXPORT_PRESET_STORAGE_VERSION,
	};
}

function isExportPresetDocument(value: unknown): value is ExportPresetDocument {
	if (!isRecord(value) || value.version !== EXPORT_PRESET_STORAGE_VERSION) {
		return false;
	}
	if (!Array.isArray(value.userPresets)) {
		return false;
	}
	if (
		value.lastUsedSettings !== undefined &&
		!isOutputSettings(value.lastUsedSettings)
	) {
		return false;
	}

	const names = new Set<string>();
	for (const preset of value.userPresets) {
		if (
			!isRecord(preset) ||
			typeof preset.name !== "string" ||
			preset.name !== preset.name.trim() ||
			!preset.name ||
			preset.name === LAST_USED_SETTINGS_PRESET_NAME ||
			names.has(preset.name) ||
			!isOutputSettings(preset.outputSettings)
		) {
			return false;
		}
		names.add(preset.name);
	}

	return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneExportPresetDocument(
	document: ExportPresetDocument,
): ExportPresetDocument {
	return {
		...(document.lastUsedSettings
			? { lastUsedSettings: cloneOutputSettings(document.lastUsedSettings) }
			: {}),
		userPresets: document.userPresets.map(cloneExportPreset),
		version: EXPORT_PRESET_STORAGE_VERSION,
	};
}

function cloneExportPreset(preset: ExportPreset): ExportPreset {
	return {
		name: preset.name,
		outputSettings: cloneOutputSettings(preset.outputSettings),
	};
}
