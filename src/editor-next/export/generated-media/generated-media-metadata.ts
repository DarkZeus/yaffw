import type {
	GeneratedMedia,
	OutputSettings,
	ReadyMediaAsset,
	ResolvedOutputPlan,
	Selection,
} from "@/editor-core/model";

export function createGeneratedMediaMetadata({
	asset,
	blob,
	fileName,
	generatedMediaId = createGeneratedMediaId(),
	now = Date.now,
	outputSettings,
	resolvedOutput,
	selection,
}: {
	asset: ReadyMediaAsset;
	blob: Blob;
	fileName?: string;
	generatedMediaId?: string;
	now?: () => number;
	outputSettings: OutputSettings;
	resolvedOutput: ResolvedOutputPlan;
	selection: Selection;
}): GeneratedMedia {
	return {
		assetId: asset.id,
		createdAtMs: now(),
		fileName:
			fileName !== undefined
				? replaceFileExtension(fileName, resolvedOutput.container.fileExtension)
				: createGeneratedMediaFileName(
						asset.provenance.fileName,
						resolvedOutput.container.fileExtension,
					),
		id: generatedMediaId,
		mimeType: resolvedOutput.container.mimeType,
		outputSettings: cloneOutputSettings(outputSettings),
		profile: asset.exportCapability.profile,
		resolvedOutput: cloneResolvedOutputPlan(resolvedOutput),
		selection: { ...selection },
		sizeBytes: blob.size,
	};
}

function createGeneratedMediaId(): string {
	return createOwnedId("generated");
}

function createOwnedId(prefix: string): string {
	if (
		"crypto" in globalThis &&
		typeof globalThis.crypto.randomUUID === "function"
	) {
		return `${prefix}-${globalThis.crypto.randomUUID()}`;
	}

	return `${prefix}-${Date.now().toString(36)}-${Math.random()
		.toString(36)
		.slice(2)}`;
}

function replaceFileExtension(fileName: string, fileExtension: string): string {
	const extensionStart = fileName.lastIndexOf(".");
	const normalizedExtension = fileExtension.startsWith(".")
		? fileExtension
		: `.${fileExtension}`;

	return `${extensionStart <= 0 ? fileName : fileName.slice(0, extensionStart)}${normalizedExtension}`;
}

function createGeneratedMediaFileName(
	fileName: string,
	fileExtension: string,
): string {
	const extensionStart = fileName.lastIndexOf(".");
	const normalizedExtension = fileExtension.startsWith(".")
		? fileExtension
		: `.${fileExtension}`;

	if (extensionStart <= 0) {
		return `${fileName}-export${normalizedExtension}`;
	}

	return `${fileName.slice(0, extensionStart)}-export${normalizedExtension}`;
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

function cloneResolvedOutputPlan(
	resolvedOutput: ResolvedOutputPlan,
): ResolvedOutputPlan {
	return {
		...resolvedOutput,
		audioQuality: { ...resolvedOutput.audioQuality },
		container: { ...resolvedOutput.container },
		resolution: resolvedOutput.resolution
			? { ...resolvedOutput.resolution }
			: undefined,
		videoQuality: { ...resolvedOutput.videoQuality },
	};
}
