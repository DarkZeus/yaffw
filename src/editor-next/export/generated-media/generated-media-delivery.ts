import type { GeneratedMedia } from "@/editor-core/model";

export type GeneratedMediaArtifact = {
	blob: Blob;
	generatedMedia: GeneratedMedia;
};

export function deliverBrowserGeneratedMedia({
	blob,
	generatedMedia,
}: GeneratedMediaArtifact): boolean {
	const anchor = document.createElement("a");
	const objectUrl = URL.createObjectURL(blob);
	let handedOff: boolean;

	try {
		anchor.href = objectUrl;
		anchor.download = generatedMedia.fileName;
		anchor.rel = "noopener";
		anchor.style.display = "none";
		document.body.append(anchor);
		handedOff = anchor.dispatchEvent(
			new MouseEvent("click", {
				bubbles: true,
				cancelable: true,
				composed: true,
			}),
		);
	} finally {
		anchor.remove();
		URL.revokeObjectURL(objectUrl);
	}
	return handedOff;
}
