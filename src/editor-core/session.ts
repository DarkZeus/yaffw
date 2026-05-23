import type {
	MediaAssetDraft,
	MediaTimeUs,
	ReadyMediaAsset,
	Selection,
} from "./model";
import type { RuntimeSupport } from "./runtime-capabilities";
import {
	moveSelectionRangeByDelta,
	resetSelection,
	setSelectionEndFromPlayhead,
	setSelectionStartFromPlayhead,
} from "./selection";

type BaseSessionState = {
	runtime: RuntimeSupport;
};

export type UnsupportedRuntimeSession = {
	importEnabled: false;
	message: string;
	status: "unsupported-runtime";
} & BaseSessionState;

export type EmptySession = {
	importEnabled: true;
	status: "empty";
} & BaseSessionState;

export type LoadingSession = {
	draft: MediaAssetDraft;
	importEnabled: false;
	status: "loading";
} & BaseSessionState;

export type ReadySession = {
	asset: ReadyMediaAsset;
	importEnabled: false;
	selection: Selection;
	status: "ready";
} & BaseSessionState;

export type FailureSession = {
	importEnabled: true;
	message: string;
	status: "failure";
	technicalDetails?: string;
} & BaseSessionState;

export type ClosedSession = {
	importEnabled: false;
	status: "closed";
} & BaseSessionState;

export type EditorSessionState =
	| ClosedSession
	| EmptySession
	| FailureSession
	| LoadingSession
	| ReadySession
	| UnsupportedRuntimeSession;

export type EditorSessionAction =
	| {
			runtime: RuntimeSupport;
			type: "runtime.checked";
	  }
	| {
			draft: MediaAssetDraft;
			type: "import.started";
	  }
	| {
			asset: ReadyMediaAsset;
			selection: Selection;
			type: "asset.ready";
	  }
	| {
			message: string;
			technicalDetails?: string;
			type: "session.failed";
	  }
	| {
			playheadUs: MediaTimeUs;
			type: "selection.start.setFromPlayhead";
	  }
	| {
			playheadUs: MediaTimeUs;
			type: "selection.end.setFromPlayhead";
	  }
	| {
			deltaUs: MediaTimeUs;
			type: "selection.range.moved";
	  }
	| {
			type: "selection.reset";
	  }
	| {
			type: "session.closed";
	  };

export function createInitialEditorSession(
	runtime: RuntimeSupport,
): EditorSessionState {
	if (!runtime.supported) {
		return {
			importEnabled: false,
			message: runtime.reason,
			runtime,
			status: "unsupported-runtime",
		};
	}

	return {
		importEnabled: true,
		runtime,
		status: "empty",
	};
}

export function editorSessionReducer(
	state: EditorSessionState,
	action: EditorSessionAction,
): EditorSessionState {
	switch (action.type) {
		case "runtime.checked":
			return createInitialEditorSession(action.runtime);
		case "import.started":
			if (state.status !== "empty" && state.status !== "failure") {
				return state;
			}

			return {
				draft: action.draft,
				importEnabled: false,
				runtime: state.runtime,
				status: "loading",
			};
		case "asset.ready":
			if (state.status !== "loading") {
				return state;
			}

			return {
				asset: action.asset,
				importEnabled: false,
				selection: action.selection,
				runtime: state.runtime,
				status: "ready",
			};
		case "session.failed":
			if (state.status === "unsupported-runtime" || state.status === "closed") {
				return state;
			}

			return {
				importEnabled: true,
				message: action.message,
				runtime: state.runtime,
				status: "failure",
				technicalDetails: action.technicalDetails,
			};
		case "selection.start.setFromPlayhead":
			if (state.status !== "ready") {
				return state;
			}

			return {
				...state,
				selection: setSelectionStartFromPlayhead(
					state.selection,
					action.playheadUs,
					{
						durationUs: state.asset.durationUs,
						frameTiming: state.asset.frameTiming,
					},
				),
			};
		case "selection.end.setFromPlayhead":
			if (state.status !== "ready") {
				return state;
			}

			return {
				...state,
				selection: setSelectionEndFromPlayhead(
					state.selection,
					action.playheadUs,
					{
						durationUs: state.asset.durationUs,
						frameTiming: state.asset.frameTiming,
					},
				),
			};
		case "selection.range.moved":
			if (state.status !== "ready") {
				return state;
			}

			return {
				...state,
				selection: moveSelectionRangeByDelta(state.selection, action.deltaUs, {
					durationUs: state.asset.durationUs,
					frameTiming: state.asset.frameTiming,
				}),
			};
		case "selection.reset":
			if (state.status !== "ready") {
				return state;
			}

			return {
				...state,
				selection: resetSelection({
					durationUs: state.asset.durationUs,
					frameTiming: state.asset.frameTiming,
				}),
			};
		case "session.closed":
			return {
				importEnabled: false,
				runtime: state.runtime,
				status: "closed",
			};
	}
}
