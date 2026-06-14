import type {
	AudioMix,
	ExportProgress,
	ReadyMediaAsset,
	Selection,
} from "@/editor-core/model";

export type DefaultExportRunnerRequest = {
	asset: ReadyMediaAsset;
	audioMix: AudioMix;
	onProgress: (progress: ExportProgress) => void;
	selection: Selection;
	signal: AbortSignal;
	source: Blob;
};

export type DefaultExportRunnerResult = {
	blob: Blob;
	fileName?: string;
	mimeType?: string;
};

export type DefaultExportRunner = {
	cancelSupported: boolean;
	run: (
		request: DefaultExportRunnerRequest,
	) => Promise<DefaultExportRunnerResult>;
};
