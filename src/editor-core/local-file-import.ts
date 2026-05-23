import type { LocalFileSource, MediaAssetDraft } from "./model";

type LocalMediaAssetDraftOptions = {
	createDraftId: () => string;
};

const plausibleVideoExtensions = new Set([
	"avi",
	"m4v",
	"mkv",
	"mov",
	"mp4",
	"mpeg",
	"mpg",
	"webm",
]);

const genericMimeTypes = new Set([
	"",
	"application/octet-stream",
	"binary/octet-stream",
]);

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

export function isPlausibleVideoDraft(draft: MediaAssetDraft): boolean {
	const mimeType = draft.provenance.mimeType?.toLowerCase() ?? "";

	if (mimeType.startsWith("video/")) {
		return true;
	}

	if (genericMimeTypes.has(mimeType)) {
		return plausibleVideoExtensions.has(fileExtension(draft.label));
	}

	return false;
}

function fileExtension(fileName: string): string {
	const extensionStart = fileName.lastIndexOf(".");

	if (extensionStart === -1 || extensionStart === fileName.length - 1) {
		return "";
	}

	return fileName.slice(extensionStart + 1).toLowerCase();
}
