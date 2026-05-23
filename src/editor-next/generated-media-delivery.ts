import type { GeneratedMedia } from "@/editor-core/model";

export type GeneratedMediaDeliveryRequest = {
	blob: Blob;
	generatedMedia: GeneratedMedia;
};

export function deliverBrowserGeneratedMedia({
	blob,
	generatedMedia,
}: GeneratedMediaDeliveryRequest) {
	const objectUrl = URL.createObjectURL(blob);
	const anchor = document.createElement("a");

	try {
		anchor.href = objectUrl;
		anchor.download = generatedMedia.fileName;
		anchor.rel = "noopener";
		anchor.style.display = "none";
		document.body.append(anchor);
		anchor.click();
	} finally {
		anchor.remove();
		URL.revokeObjectURL(objectUrl);
	}
}
