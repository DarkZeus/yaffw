import type { LocalMediaAssetInspector } from "@/editor-core/local-file-analysis";
import type {
	AudioTrackChannelMode,
	GeneratedMedia,
} from "@/editor-core/model";
import type { RuntimeSupport } from "@/editor-core/runtime-capabilities";
import type { EditorSessionState } from "@/editor-core/session";
import type { DefaultExportRunner } from "./default-export-runner";
import type { GeneratedMediaDeliveryRequest } from "./generated-media-delivery";

export type SingleAssetEditingSessionCommands = {
	cancelDefaultExport: () => void;
	downloadGeneratedMedia: (generatedMedia: GeneratedMedia) => void;
	importLocalFile: (file: File) => Promise<void>;
	moveSelectionRange: (deltaUs: number) => void;
	requestCloseFile: () => void;
	resetSelection: () => void;
	setAudioTrackChannelMode: (
		trackId: string,
		channelMode: AudioTrackChannelMode,
	) => void;
	setAudioTrackIncluded: (trackId: string, include: boolean) => void;
	setAudioTrackVolumePercent: (trackId: string, volumePercent: number) => void;
	setSelectionEndFromPlayhead: (playheadUs: number) => void;
	setSelectionStartFromPlayhead: (playheadUs: number) => void;
	startDefaultExport: () => Promise<void>;
};

export type SingleAssetEditingSession = {
	commands: SingleAssetEditingSessionCommands;
	localFileInputKey: number;
	previewSource: Blob | null;
	session: EditorSessionState;
};

export type UseSingleAssetEditingSessionOptions = {
	confirmCloseFile?: (message: string) => boolean;
	createAssetId: () => string;
	createDraftId: () => string;
	createExportJobId: () => string;
	createGeneratedMediaId: () => string;
	defaultExportRunner: DefaultExportRunner;
	deliverGeneratedMedia: (request: GeneratedMediaDeliveryRequest) => void;
	inspectLocalAsset: LocalMediaAssetInspector;
	now: () => number;
	runtime: RuntimeSupport;
};
