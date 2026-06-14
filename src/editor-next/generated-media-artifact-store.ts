import type { GeneratedMedia } from "@/editor-core/model";

import type { GeneratedMediaDeliveryRequest } from "./generated-media-delivery.types";

export type GeneratedMediaArtifactStore = {
	clear: () => void;
	deliver: (request: GeneratedMediaArtifactDeliveryRequest) => boolean;
	invalidate: (generatedMediaId: string) => void;
	read: (generatedMedia: GeneratedMedia) => Blob | null;
	retain: (request: GeneratedMediaArtifactRetentionRequest) => void;
};

export type GeneratedMediaArtifactRetentionRequest = {
	blob: Blob;
	generatedMedia: GeneratedMedia;
};

export type GeneratedMediaArtifactDeliveryRequest = {
	deliver: (request: GeneratedMediaDeliveryRequest) => void;
	generatedMedia: GeneratedMedia;
};

export function createGeneratedMediaArtifactStore(): GeneratedMediaArtifactStore {
	const blobs = new Map<string, Blob>();

	return {
		clear() {
			blobs.clear();
		},
		deliver({ deliver, generatedMedia }) {
			const blob = blobs.get(generatedMedia.id);

			if (!blob) {
				return false;
			}

			deliver({
				blob,
				generatedMedia,
			});

			return true;
		},
		invalidate(generatedMediaId) {
			blobs.delete(generatedMediaId);
		},
		read(generatedMedia) {
			return blobs.get(generatedMedia.id) ?? null;
		},
		retain({ blob, generatedMedia }) {
			blobs.set(generatedMedia.id, blob);
		},
	};
}
