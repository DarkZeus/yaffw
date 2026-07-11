import type {
	AudioMix,
	GeneratedMedia,
	OutputSettings,
	ReadyMediaAsset,
	Selection,
} from "@/editor-core/model";
import type { RuntimeSupport } from "@/editor-core/runtime-capabilities";
import type { ExportSessionState } from "@/editor-core/session";

export type ExportInspectorPanelProps = {
	asset: ReadyMediaAsset;
	audioMix: AudioMix;
	exportState: ExportSessionState;
	onCancelExport: () => void;
	onDownloadGeneratedMedia: (generatedMedia: GeneratedMedia) => void;
	onApplyOutputSettings: (outputSettings: OutputSettings) => void;
	onStartExport: () => void;
	outputSettings: OutputSettings;
	runtime: RuntimeSupport;
	selection: Selection;
};
