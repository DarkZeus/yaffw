export type CookieSession = {
  sessionId: string
  originalName: string
  uploadTime: number
  used: boolean
}

export type CookieState = {
  sessions: CookieSession[]
  currentSessionId: string | null
}

export type CookieAction =
  | { type: 'ADD_SESSION'; payload: CookieSession }
  | { type: 'REMOVE_SESSION'; payload: { sessionId: string } }
  | { type: 'SET_CURRENT_SESSION'; payload: { sessionId: string | null } }
  | { type: 'MARK_SESSION_USED'; payload: { sessionId: string } }
  | { type: 'CLEAR_SESSIONS' }

export type CookieContextType = {
  state: CookieState
  addSession: (session: CookieSession) => void
  removeSession: (sessionId: string) => void
  setCurrentSession: (sessionId: string | null) => void
  markSessionUsed: (sessionId: string) => void
  clearSessions: () => void
  getCurrentSession: () => CookieSession | null
} 