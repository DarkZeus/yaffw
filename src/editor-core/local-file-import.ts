import type { LocalFileSource, MediaAssetDraft } from "./model";

type LocalMediaAssetDraftOptions = {
	createDraftId: () => string;
};

export function createLocalMediaAssetDraft(
	source: LocalFileSource,
	options: LocalMediaAssetDraftOptions = {
		createDraftId: createMediaAssetDraftId,
	},
): MediaAssetDraft {
	const mimeType = source.type.trim();

	return {
		id: options.createDraftId(),
		kind: "local-file",
		label: source.name,
		provenance: {
			fileName: source.name,
			lastModifiedMs: source.lastModified,
			mimeType: mimeType || undefined,
			sizeBytes: source.size,
		},
		source,
	};
}

function createMediaAssetDraftId(): string {
	return createOwnedId("draft");
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
