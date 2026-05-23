import { describe, expect, it } from 'vitest'

import {
  evaluateRuntimeSupport,
  readRuntimeCapabilities,
} from './runtime-capabilities'
import { createInitialEditorSession, editorSessionReducer } from './session'

describe('editor-next session runtime gate', () => {
  it('reads WebCodecs and browser media API basics from a runtime object', () => {
    expect(
      readRuntimeCapabilities({
        File: function File() {},
        MediaSource: function MediaSource() {},
        URL: {
          createObjectURL() {
            return 'blob:asset'
          },
          revokeObjectURL() {},
        },
        VideoDecoder: function VideoDecoder() {},
        VideoEncoder: function VideoEncoder() {},
      }),
    ).toEqual({
      fileApi: true,
      mediaSource: true,
      objectUrl: true,
      videoDecoder: true,
      videoEncoder: true,
    })
  })

  it('starts blocked when WebCodecs runtime basics are missing', () => {
    const runtime = evaluateRuntimeSupport({
      fileApi: true,
      mediaSource: true,
      objectUrl: true,
      videoDecoder: false,
      videoEncoder: false,
    })

    const session = createInitialEditorSession(runtime)

    expect(session.status).toBe('unsupported-runtime')
    if (session.status !== 'unsupported-runtime') {
      throw new Error(`Expected unsupported runtime, got ${session.status}`)
    }

    expect(session.importEnabled).toBe(false)
    expect(session.message).toContain('WebCodecs')
  })

  it('moves a supported session through loading, ready placeholder, failure, and closed states', () => {
    const runtime = evaluateRuntimeSupport({
      fileApi: true,
      mediaSource: true,
      objectUrl: true,
      videoDecoder: true,
      videoEncoder: true,
    })
    const empty = createInitialEditorSession(runtime)

    expect(empty.status).toBe('empty')
    expect(empty.importEnabled).toBe(true)

    const loading = editorSessionReducer(empty, {
      draftLabel: 'clip.mp4',
      type: 'import.started',
    })

    expect(loading.status).toBe('loading')
    if (loading.status !== 'loading') {
      throw new Error(`Expected loading, got ${loading.status}`)
    }

    expect(loading.importEnabled).toBe(false)
    expect(loading.draftLabel).toBe('clip.mp4')

    const ready = editorSessionReducer(loading, {
      assetLabel: 'clip.mp4',
      type: 'ready-placeholder.entered',
    })

    expect(ready.status).toBe('ready-placeholder')
    if (ready.status !== 'ready-placeholder') {
      throw new Error(`Expected ready placeholder, got ${ready.status}`)
    }

    expect(ready.assetLabel).toBe('clip.mp4')

    const failed = editorSessionReducer(loading, {
      message: 'The media asset could not be analyzed.',
      technicalDetails: 'No readable duration was found.',
      type: 'session.failed',
    })

    expect(failed.status).toBe('failure')
    if (failed.status !== 'failure') {
      throw new Error(`Expected failure, got ${failed.status}`)
    }

    expect(failed.message).toBe('The media asset could not be analyzed.')
    expect(failed.technicalDetails).toBe('No readable duration was found.')

    const closed = editorSessionReducer(ready, { type: 'session.closed' })

    expect(closed.status).toBe('closed')
    expect(closed.importEnabled).toBe(false)
  })
})
