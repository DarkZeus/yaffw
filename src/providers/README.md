# Cookie Provider

The Cookie Provider manages cookie sessions throughout the YAFFW application, allowing components to access and update cookie state globally.

## Usage

### Basic Usage

```tsx
import { useCookie } from '../providers/CookieProvider'

function MyComponent() {
  const { 
    state, 
    addSession, 
    removeSession, 
    setCurrentSession, 
    getCurrentSession 
  } = useCookie()

  // Get current active session
  const currentSession = getCurrentSession()

  // Add a new cookie session
  const handleUpload = async (file: File) => {
    const response = await uploadCookieFile(file)
    addSession({
      sessionId: response.sessionId,
      originalName: file.name,
      uploadTime: Date.now(),
      used: false
    })
  }

  return (
    <div>
      {currentSession ? (
        <p>Active cookie: {currentSession.originalName}</p>
      ) : (
        <p>No active cookie session</p>
      )}
    </div>
  )
}
```

### Available Methods

- `addSession(session: CookieSession)` - Add a new cookie session
- `removeSession(sessionId: string)` - Remove a cookie session
- `setCurrentSession(sessionId: string | null)` - Set the current active session
- `markSessionUsed(sessionId: string)` - Mark a session as used
- `clearSessions()` - Clear all sessions
- `getCurrentSession()` - Get the current active session

### State Structure

```tsx
type CookieState = {
  sessions: CookieSession[]        // All available sessions
  currentSessionId: string | null  // ID of current active session
}

type CookieSession = {
  sessionId: string    // Unique session identifier
  originalName: string // Original filename
  uploadTime: number   // Upload timestamp
  used: boolean        // Whether session has been used
}
```

## Integration

The Cookie Provider is already integrated into the root layout and is available throughout the application. Components can access it using the `useCookie` hook.

### Example: Cookie Status Component

```tsx
import { useCookie } from '../providers/CookieProvider'

export function CookieStatus() {
  const { state, getCurrentSession } = useCookie()
  const currentSession = getCurrentSession()

  if (state.sessions.length === 0) return null

  return (
    <div>
      {currentSession ? 'Cookie active' : 'Cookie available'}
    </div>
  )
}
``` 