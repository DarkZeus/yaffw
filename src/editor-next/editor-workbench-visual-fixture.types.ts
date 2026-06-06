import type { EditorSessionState } from "@/editor-core/session";

export type EditorWorkbenchVisualFixture = {
	session: Extract<EditorSessionState, { status: "ready" }>;
	source: Blob;
};
