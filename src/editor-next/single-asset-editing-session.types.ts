import type { LocalMediaAssetInspector } from "@/editor-core/local-file-analysis";
import type {
	AudioTrackChannelMode,
	GeneratedMedia,
	Selection,
} from "@/editor-core/model";
import type { RuntimeSupport } from "@/editor-core/runtime-capabilities";
import type { EditorSessionState } from "@/editor-core/session";
import type { ActiveMediaAssetCleanupScope } from "./active-media-asset-cleanup-scope";
import type { DefaultExportRunner } from "./default-export-runner.types";
import type { GeneratedMediaDeliveryRequest } from "./generated-media-delivery.types";

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
	setSelectionRange: (selection: Selection) => void;
	setSelectionStartFromPlayhead: (playheadUs: number) => void;
	startDefaultExport: () => Promise<void>;
};

export type SingleAssetEditingSession = {
	activeMediaAssetCleanupScope: ActiveMediaAssetCleanupScope | null;
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
