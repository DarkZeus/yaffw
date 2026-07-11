import type { OutputSettings } from "@/editor-core/model";

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
	| { kind: "collision"; preset: ExportPreset }
	| { kind: "saved"; preset: ExportPreset };

export function readExportPresetDocument(
	storage: ExportPresetStorage,
): ExportPresetDocument {
	const stored = storage.getItem(EXPORT_PRESET_STORAGE_KEY);
	if (!stored) {
		return emptyExportPresetDocument();
	}

	try {
		const parsed: unknown = JSON.parse(stored);
		return isExportPresetDocument(parsed)
			? cloneExportPresetDocument(parsed)
			: emptyExportPresetDocument();
	} catch {
		return emptyExportPresetDocument();
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
		return {
			kind: "collision",
			preset: cloneExportPreset(document.userPresets[existingIndex]),
		};
	}

	const preset = {
		name: normalizedName,
		outputSettings: cloneOutputSettings(outputSettings),
	} satisfies ExportPreset;

	if (existingIndex >= 0) {
		document.userPresets[existingIndex] = preset;
	} else {
		document.userPresets.push(preset);
	}

	writeExportPresetDocument(storage, document);
	return { kind: "saved", preset: cloneExportPreset(preset) };
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
	return cloneExportPresetDocument(document);
}

export function validateExportPresetName(name: string): string {
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

function isOutputSettings(value: unknown): value is OutputSettings {
	return (
		isRecord(value) &&
		isContainerSetting(value.container) &&
		isCodecSetting(value.videoCodec) &&
		isCodecSetting(value.audioCodec) &&
		isResolutionSetting(value.resolution) &&
		isQualitySetting(value.videoQuality) &&
		isQualitySetting(value.audioQuality)
	);
}

function isContainerSetting(value: unknown): boolean {
	return (
		isRecord(value) &&
		(value.kind === "default-output-profile" ||
			(value.kind === "documented-container" &&
				typeof value.container === "string" &&
				value.container.length > 0))
	);
}

function isCodecSetting(value: unknown): boolean {
	return (
		isRecord(value) &&
		(value.kind === "default-output-profile" ||
			value.kind === "preserve-source" ||
			(value.kind === "documented-codec" &&
				typeof value.codec === "string" &&
				value.codec.length > 0))
	);
}

function isResolutionSetting(value: unknown): boolean {
	return (
		isRecord(value) &&
		(value.kind === "preserve-source" ||
			(value.kind === "target-dimensions" &&
				isPositiveInteger(value.width) &&
				isPositiveInteger(value.height)))
	);
}

function isQualitySetting(value: unknown): boolean {
	return (
		isRecord(value) &&
		(value.kind === "preserve-source" ||
			(value.kind === "subjective-quality" &&
				["very-low", "low", "medium", "high", "very-high"].includes(
					String(value.quality),
				)) ||
			(value.kind === "custom-bitrate" && isPositiveInteger(value.bitrateBps)))
	);
}

function isPositiveInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value > 0;
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

function cloneOutputSettings(outputSettings: OutputSettings): OutputSettings {
	return {
		audioCodec: { ...outputSettings.audioCodec },
		audioQuality: { ...outputSettings.audioQuality },
		container: { ...outputSettings.container },
		resolution: { ...outputSettings.resolution },
		videoCodec: { ...outputSettings.videoCodec },
		videoQuality: { ...outputSettings.videoQuality },
	};
}
