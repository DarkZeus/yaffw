import type { GeneratedMedia } from "@/editor-core/model";

import type { GeneratedMediaDeliveryRequest } from "../types/generated-media-delivery.types";

export type GeneratedMediaArtifactStore = {
	clear: () => void;
	deliver: (request: GeneratedMediaArtifactDeliveryRequest) => boolean;
	reconcile: (generatedMediaId: string | null) => void;
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
	let currentArtifact: {
		blob: Blob;
		generatedMediaId: string;
	} | null = null;

	return {
		clear() {
			currentArtifact = null;
		},
		deliver({ deliver, generatedMedia }) {
			if (currentArtifact?.generatedMediaId !== generatedMedia.id) {
				return false;
			}

			deliver({
				blob: currentArtifact.blob,
				generatedMedia,
			});

			return true;
		},
		reconcile(generatedMediaId) {
			if (currentArtifact?.generatedMediaId !== generatedMediaId)
				currentArtifact = null;
		},
		retain({ blob, generatedMedia }) {
			currentArtifact = {
				blob,
				generatedMediaId: generatedMedia.id,
			};
		},
	};
}
