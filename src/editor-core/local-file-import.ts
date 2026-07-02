import type { LocalFileSource, MediaAssetDraft } from "./model";

type LocalMediaAssetDraftOptions = {
	createDraftId: () => string;
};

export function createLocalMediaAssetDraft(
	source: LocalFileSource,
	options: LocalMediaAssetDraftOptions,
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
