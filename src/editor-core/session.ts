import type { RuntimeSupport } from './runtime-capabilities'

type BaseSessionState = {
  runtime: RuntimeSupport
}

export type UnsupportedRuntimeSession = {
  importEnabled: false
  message: string
  status: 'unsupported-runtime'
} & BaseSessionState

export type EmptySession = {
  importEnabled: true
  status: 'empty'
} & BaseSessionState

export type LoadingSession = {
  draftLabel: string
  importEnabled: false
  status: 'loading'
} & BaseSessionState

export type ReadyPlaceholderSession = {
  assetLabel: string
  importEnabled: false
  status: 'ready-placeholder'
} & BaseSessionState

export type FailureSession = {
  importEnabled: true
  message: string
  status: 'failure'
  technicalDetails?: string
} & BaseSessionState

export type ClosedSession = {
  importEnabled: false
  status: 'closed'
} & BaseSessionState

export type EditorSessionState =
  | ClosedSession
  | EmptySession
  | FailureSession
  | LoadingSession
  | ReadyPlaceholderSession
  | UnsupportedRuntimeSession

export type EditorSessionAction =
  | {
      runtime: RuntimeSupport
      type: 'runtime.checked'
    }
  | {
      draftLabel: string
      type: 'import.started'
    }
  | {
      assetLabel: string
      type: 'ready-placeholder.entered'
    }
  | {
      message: string
      technicalDetails?: string
      type: 'session.failed'
    }
  | {
      type: 'session.closed'
    }

export function createInitialEditorSession(
  runtime: RuntimeSupport,
): EditorSessionState {
  if (!runtime.supported) {
    return {
      importEnabled: false,
      message: runtime.reason,
      runtime,
      status: 'unsupported-runtime',
    }
  }

  return {
    importEnabled: true,
    runtime,
    status: 'empty',
  }
}

export function editorSessionReducer(
  state: EditorSessionState,
  action: EditorSessionAction,
): EditorSessionState {
  switch (action.type) {
    case 'runtime.checked':
      return createInitialEditorSession(action.runtime)
    case 'import.started':
      if (state.status !== 'empty') {
        return state
      }

      return {
        draftLabel: action.draftLabel,
        importEnabled: false,
        runtime: state.runtime,
        status: 'loading',
      }
    case 'ready-placeholder.entered':
      if (state.status !== 'loading') {
        return state
      }

      return {
        assetLabel: action.assetLabel,
        importEnabled: false,
        runtime: state.runtime,
        status: 'ready-placeholder',
      }
    case 'session.failed':
      if (
        state.status === 'unsupported-runtime' ||
        state.status === 'closed'
      ) {
        return state
      }

      return {
        importEnabled: true,
        message: action.message,
        runtime: state.runtime,
        status: 'failure',
        technicalDetails: action.technicalDetails,
      }
    case 'session.closed':
      return {
        importEnabled: false,
        runtime: state.runtime,
        status: 'closed',
      }
  }
}
