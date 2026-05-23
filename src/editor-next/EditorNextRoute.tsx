import { AlertTriangle, CheckCircle2, FileVideo } from 'lucide-react'
import { type ChangeEvent, useMemo, useReducer } from 'react'

import {
  detectRuntimeSupport,
  type RuntimeSupport,
} from '@/editor-core/runtime-capabilities'
import {
  createInitialEditorSession,
  editorSessionReducer,
  type EditorSessionState,
} from '@/editor-core/session'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

type EditorNextRouteProps = {
  initialRuntime?: RuntimeSupport
}

export function EditorNextRoute({ initialRuntime }: EditorNextRouteProps) {
  const runtime = useMemo(
    () => initialRuntime ?? detectRuntimeSupport(),
    [initialRuntime],
  )
  const [session, dispatch] = useReducer(
    editorSessionReducer,
    runtime,
    createInitialEditorSession,
  )

  function handleLocalFileSelected(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.currentTarget.files?.[0]

    if (!file || !session.importEnabled) {
      return
    }

    dispatch({
      draftLabel: file.name,
      type: 'import.started',
    })
    dispatch({
      assetLabel: file.name,
      type: 'ready-placeholder.entered',
    })
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b pb-5 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-2">
            <Badge variant="outline" className="w-fit">
              First slice
            </Badge>
            <div className="flex flex-col gap-1">
              <h1 className="text-3xl font-semibold tracking-tight">
                Editor-next
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                A separate local-first editor surface for one active media asset.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
            {runtime.supported ? (
              <CheckCircle2 aria-hidden="true" className="text-chart-2" />
            ) : (
              <AlertTriangle aria-hidden="true" className="text-destructive" />
            )}
            <span className="font-medium">
              {runtime.supported ? 'Runtime ready' : 'Runtime blocked'}
            </span>
          </div>
        </header>

        {session.status === 'unsupported-runtime' ? (
          <UnsupportedRuntimeState session={session} />
        ) : (
          <EditorSessionShell
            onLocalFileSelected={handleLocalFileSelected}
            session={session}
          />
        )}
      </div>
    </main>
  )
}

type UnsupportedRuntimeStateProps = {
  session: Extract<EditorSessionState, { status: 'unsupported-runtime' }>
}

function UnsupportedRuntimeState({ session }: UnsupportedRuntimeStateProps) {
  const missing = session.runtime.supported ? [] : session.runtime.missing

  return (
    <section className="grid min-h-[26rem] content-center">
      <Alert variant="destructive" className="max-w-3xl">
        <AlertTriangle aria-hidden="true" />
        <AlertTitle>Unsupported runtime</AlertTitle>
        <AlertDescription>
          <p>{session.message}</p>
          {missing.length > 0 ? (
            <p>Missing capability keys: {missing.join(', ')}</p>
          ) : null}
        </AlertDescription>
      </Alert>
    </section>
  )
}

type EditorSessionShellProps = {
  onLocalFileSelected: (event: ChangeEvent<HTMLInputElement>) => void
  session: Exclude<EditorSessionState, { status: 'unsupported-runtime' }>
}

function EditorSessionShell({
  onLocalFileSelected,
  session,
}: EditorSessionShellProps) {
  return (
    <section
      aria-labelledby="editor-next-import-title"
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]"
    >
      <div className="flex min-h-[28rem] flex-col gap-6 rounded-md border bg-card p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-md border bg-muted">
              <FileVideo aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-1">
              <h2
                id="editor-next-import-title"
                className="text-xl font-semibold tracking-tight"
              >
                Local media asset
              </h2>
              <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                Ready to accept one local media asset for the first-slice
                workflow.
              </p>
            </div>
          </div>
          <Badge variant="secondary">{formatSessionStatus(session.status)}</Badge>
        </div>

        <div className="grid flex-1 place-items-center rounded-md border border-dashed bg-background/60 p-6">
          <div className="flex w-full max-w-lg flex-col gap-4">
            <label
              className="text-sm font-medium"
              htmlFor="editor-next-local-file"
            >
              Local video file
            </label>
            <div className="flex flex-col gap-3">
              <Input
                accept="video/*"
                disabled={!session.importEnabled}
                id="editor-next-local-file"
                onChange={onLocalFileSelected}
                type="file"
              />
            </div>
            <SessionStatusLine session={session} />
          </div>
        </div>
      </div>

      <aside className="flex flex-col gap-3 rounded-md border bg-card p-4">
        <h2 className="text-sm font-semibold tracking-tight">
          Runtime checks
        </h2>
        <ul className="flex flex-col gap-3 text-sm text-muted-foreground">
          {runtimeCheckRows(session.runtime).map((row) => (
            <li className="flex items-center justify-between gap-3" key={row.label}>
              <span>{row.label}</span>
              <Badge variant={row.available ? 'secondary' : 'destructive'}>
                {row.available ? 'Ready' : 'Missing'}
              </Badge>
            </li>
          ))}
        </ul>
      </aside>
    </section>
  )
}

function runtimeCheckRows(runtime: EditorSessionState['runtime']) {
  return [
    {
      available: runtime.capabilities.videoDecoder,
      label: 'Video decoder',
    },
    {
      available: runtime.capabilities.videoEncoder,
      label: 'Video encoder',
    },
    {
      available: runtime.capabilities.mediaSource,
      label: 'Media source',
    },
    {
      available: runtime.capabilities.objectUrl && runtime.capabilities.fileApi,
      label: 'Local file APIs',
    },
  ]
}

function SessionStatusLine({
  session,
}: Pick<EditorSessionShellProps, 'session'>) {
  if (session.status === 'ready-placeholder') {
    return (
      <p className="text-sm text-muted-foreground">
        Ready placeholder entered for {session.assetLabel}.
      </p>
    )
  }

  if (session.status === 'loading') {
    return (
      <p className="text-sm text-muted-foreground">
        Preparing media asset draft {session.draftLabel}.
      </p>
    )
  }

  if (session.status === 'failure') {
    return (
      <Alert>
        <AlertTriangle aria-hidden="true" />
        <AlertTitle>{session.message}</AlertTitle>
        {session.technicalDetails ? (
          <AlertDescription>{session.technicalDetails}</AlertDescription>
        ) : null}
      </Alert>
    )
  }

  if (session.status === 'closed') {
    return (
      <p className="text-sm text-muted-foreground">
        Session closed; reopen the route to start again.
      </p>
    )
  }

  return (
    <p className="text-sm text-muted-foreground">
      Waiting for a media asset draft.
    </p>
  )
}

function formatSessionStatus(status: EditorSessionShellProps['session']['status']) {
  switch (status) {
    case 'closed':
      return 'Closed'
    case 'empty':
      return 'Empty'
    case 'failure':
      return 'Failure'
    case 'loading':
      return 'Loading'
    case 'ready-placeholder':
      return 'Ready placeholder'
  }
}
