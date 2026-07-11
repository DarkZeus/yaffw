import type {
	AudioMix,
	GeneratedMedia,
	OutputSettings,
	ReadyMediaAsset,
	Selection,
} from "@/editor-core/model";
import type { RuntimeSupport } from "@/editor-core/runtime-capabilities";
import type { ExportSessionState } from "@/editor-core/session";

export type ExportInspectorFact = {
	label: string;
	value: string;
};

export type ExportInspectorReviewViewModel =
	| {
			audioMix: ExportInspectorFact;
			method: ExportInspectorFact;
			plannedOutput: ExportInspectorFact;
			precision: ExportInspectorFact;
			reason: string;
			resolution: ExportInspectorFact;
			supported: true;
	  }
	| {
			audioMix: ExportInspectorFact;
			plannedOutput: ExportInspectorFact;
			reason: string;
			resolution: ExportInspectorFact;
			supported: false;
			technicalDetails: string;
	  };

export type ExportInspectorStatusViewModel =
	| {
			kind: "idle";
	  }
	| {
			cancelUnavailableMessage: string | undefined;
			jobId: string;
			kind: "running";
			progressPercent: number;
			title: string;
	  }
	| {
			kind: "failed";
			message: string;
			technicalDetails?: string;
	  }
	| {
			deliveryState: "Delivered" | "Ready to download";
			fileName: string;
			kind: "succeeded";
			title: "Export complete";
	  }
	| {
			kind: "cancelled";
			message: "Export cancelled.";
	  };

export type ExportInspectorActionViewModel =
	| {
			disabled: boolean;
			kind: "start";
			label: "Start export";
	  }
	| {
			disabled: false;
			kind: "cancel";
			label: "Cancel export";
	  }
	| {
			disabled: false;
			generatedMedia: GeneratedMedia;
			kind: "download";
			label: "Download export";
	  }
	| {
			kind: "none";
	  };

export type ExportInspectorCapabilityViewModel = {
	label: "Export capability";
	tone: "blocked" | "ready";
	value: "Blocked" | "Ready";
};

export type ExportInspectorRuntimeCheckViewModel = {
	available: boolean;
	label: string;
	status: "Missing" | "Ready";
};

export type ExportInspectorViewModel = {
	action: ExportInspectorActionViewModel;
	badge: {
		label: "Blocked" | "Ready";
		tone: "blocked" | "ready";
	};
	capability: ExportInspectorCapabilityViewModel;
	review: ExportInspectorReviewViewModel;
	runtimeChecks: ExportInspectorRuntimeCheckViewModel[];
	status: ExportInspectorStatusViewModel;
};

export type CreateExportInspectorViewModelOptions = {
	asset: ReadyMediaAsset;
	audioMix: AudioMix;
	exportState: ExportSessionState;
	outputSettings: OutputSettings;
	runtime: RuntimeSupport;
	selection: Selection;
};
