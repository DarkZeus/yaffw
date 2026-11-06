import type {
	AudioMix,
	ExportProgress,
	ResolvedOutputPlan,
	Selection,
} from "@/editor-core/model";

export type DefaultExportRunnerRequest = {
	audioMix: AudioMix;
	onProgress: (progress: ExportProgress) => void;
	resolvedOutput: ResolvedOutputPlan;
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
