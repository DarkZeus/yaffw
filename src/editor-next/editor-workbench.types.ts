import type { ChangeEvent, DragEvent, ReactNode } from "react";

import type { MediaTimeUs, ReadyMediaAsset } from "@/editor-core/model";
import type { RuntimeSupport } from "@/editor-core/runtime-capabilities";
import type { EditorSessionState } from "@/editor-core/session";

export type EditorWorkbenchFrameProps = {
	activeAsset: ReadyMediaAsset | null;
	children: ReactNode;
	previewStatus?: {
		playheadUs: MediaTimeUs;
		selectionDurationUs: MediaTimeUs;
	} | null;
	runtime: RuntimeSupport;
	status: EditorSessionState["status"];
};

export type UnsupportedRuntimeStateProps = {
	session: Extract<EditorSessionState, { status: "unsupported-runtime" }>;
};

export type EditorSessionShellProps = {
	audioPanel: ReactNode;
	exportInspector: ReactNode;
	localFileInputKey: number;
	mediaAssetContext: ReactNode;
	onLocalFileDropped: (event: DragEvent<HTMLElement>) => void;
	onLocalFileSelected: (event: ChangeEvent<HTMLInputElement>) => void;
	previewPlayer: ReactNode;
	session: Exclude<EditorSessionState, { status: "unsupported-runtime" }>;
};
