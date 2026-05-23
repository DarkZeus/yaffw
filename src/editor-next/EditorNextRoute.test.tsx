/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { evaluateRuntimeSupport } from '@/editor-core/runtime-capabilities'

import { EditorNextRoute } from './EditorNextRoute'

afterEach(() => {
  cleanup()
})

describe('EditorNextRoute', () => {
  it('renders the empty local import shell when the runtime is supported', () => {
    render(
      <EditorNextRoute
        initialRuntime={evaluateRuntimeSupport({
          fileApi: true,
          mediaSource: true,
          objectUrl: true,
          videoDecoder: true,
          videoEncoder: true,
        })}
      />,
    )

    expect(screen.getByText('Editor-next')).toBeTruthy()
    expect(screen.getByLabelText('Local video file')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('renders the unsupported runtime state before exposing local import', () => {
    render(
      <EditorNextRoute
        initialRuntime={evaluateRuntimeSupport({
          fileApi: true,
          mediaSource: true,
          objectUrl: true,
          videoDecoder: false,
          videoEncoder: false,
        })}
      />,
    )

    const alert = screen.getByRole('alert')

    expect(alert.textContent).toContain('WebCodecs')
    expect(screen.queryByLabelText('Local video file')).toBeNull()
  })
})
