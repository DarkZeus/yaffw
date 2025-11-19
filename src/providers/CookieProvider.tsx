import { type ReactNode, createContext, useContext, useReducer } from 'react'
import type { CookieAction, CookieContextType, CookieSession, CookieState } from '../types/cookie.types'

const initialState: CookieState = {
  sessions: [],
  currentSessionId: null
}

function cookieReducer(state: CookieState, action: CookieAction): CookieState {
  switch (action.type) {
    case 'ADD_SESSION':
      return {
        ...state,
        sessions: [...state.sessions, action.payload]
      }
    
    case 'REMOVE_SESSION':
      return {
        ...state,
        sessions: state.sessions.filter(session => session.sessionId !== action.payload.sessionId),
        currentSessionId: state.currentSessionId === action.payload.sessionId ? null : state.currentSessionId
      }
    
    case 'SET_CURRENT_SESSION':
      return {
        ...state,
        currentSessionId: action.payload.sessionId
      }
    
    case 'MARK_SESSION_USED':
      return {
        ...state,
        sessions: state.sessions.map(session =>
          session.sessionId === action.payload.sessionId
            ? { ...session, used: true }
            : session
        )
      }
    
    case 'CLEAR_SESSIONS':
      return {
        ...state,
        sessions: [],
        currentSessionId: null
      }
    
    default:
      return state
  }
}



const CookieContext = createContext<CookieContextType | null>(null)

type CookieProviderProps = {
  children: ReactNode
}

export function CookieProvider({ children }: CookieProviderProps) {
  const [state, dispatch] = useReducer(cookieReducer, initialState)

  const addSession = (session: CookieSession) => {
    dispatch({ type: 'ADD_SESSION', payload: session })
  }

  const removeSession = (sessionId: string) => {
    dispatch({ type: 'REMOVE_SESSION', payload: { sessionId } })
  }

  const setCurrentSession = (sessionId: string | null) => {
    dispatch({ type: 'SET_CURRENT_SESSION', payload: { sessionId } })
  }

  const markSessionUsed = (sessionId: string) => {
    dispatch({ type: 'MARK_SESSION_USED', payload: { sessionId } })
  }

  const clearSessions = () => {
    dispatch({ type: 'CLEAR_SESSIONS' })
  }

  const getCurrentSession = () => {
    if (!state.currentSessionId) return null
    return state.sessions.find(session => session.sessionId === state.currentSessionId) || null
  }

  const value: CookieContextType = {
    state,
    addSession,
    removeSession,
    setCurrentSession,
    markSessionUsed,
    clearSessions,
    getCurrentSession
  }

  return (
    <CookieContext.Provider value={value}>
      {children}
    </CookieContext.Provider>
  )
}

export function useCookie() {
  const context = useContext(CookieContext)
  if (!context) {
    throw new Error('useCookie must be used within a CookieProvider')
  }
  return context
} 