# Providers

This directory contains app-level React providers used by the current route tree.

## CookieProvider

`CookieProvider` stores temporary cookie-upload sessions for the legacy bulk-download and URL-acquisition surfaces. It is mounted at the root so legacy dialogs and bulk-download components can share a selected cookie session.

This provider is not part of the editor-next domain model. Editor-next should treat URL acquisition as an import adapter that produces media asset drafts; cookie state should not shape media asset, Selection, Export job, or Generated media behavior.

Public hook:

```tsx
import { useCookie } from "../providers/CookieProvider"

const {
  state,
  addSession,
  removeSession,
  setCurrentSession,
  markSessionUsed,
  clearSessions,
  getCurrentSession,
} = useCookie()
```

State shape:

```ts
type CookieState = {
  sessions: CookieSession[]
  currentSessionId: string | null
}

type CookieSession = {
  sessionId: string
  originalName: string
  uploadTime: number
  used: boolean
}
```
