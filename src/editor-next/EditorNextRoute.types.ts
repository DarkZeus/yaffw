import type { LocalMediaAssetInspector } from "@/editor-core/local-file-analysis";
import type { RuntimeSupport } from "@/editor-core/runtime-capabilities";

import type { DefaultExportRunner } from "./default-export-runner.types";
import type { GeneratedMediaDeliveryRequest } from "./generated-media-delivery.types";

export type EditorNextRouteProps = {
	confirmCloseFile?: (message: string) => boolean;
	createAssetId?: () => string;
	createDraftId?: () => string;
	createExportJobId?: () => string;
	createGeneratedMediaId?: () => string;
	defaultExportRunner?: DefaultExportRunner;
	deliverGeneratedMedia?: (request: GeneratedMediaDeliveryRequest) => void;
	initialRuntime?: RuntimeSupport;
	inspectLocalAsset?: LocalMediaAssetInspector;
	mockUploadedMediaState?: boolean;
	now?: () => number;
};
