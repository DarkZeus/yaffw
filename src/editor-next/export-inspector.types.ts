import type {
	GeneratedMedia,
	ReadyMediaAsset,
	Selection,
} from "@/editor-core/model";
import type { RuntimeSupport } from "@/editor-core/runtime-capabilities";
import type { ExportSessionState } from "@/editor-core/session";

export type ExportInspectorPanelProps = {
	asset: ReadyMediaAsset;
	exportState: ExportSessionState;
	onCancelExport: () => void;
	onDownloadGeneratedMedia: (generatedMedia: GeneratedMedia) => void;
	onStartExport: () => void;
	runtime: RuntimeSupport;
	selection: Selection;
};
