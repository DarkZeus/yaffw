import { useCallback, useEffect } from 'react'

type KeyboardShortcutsProps = {
  // Playback controls
  onPlayPause: () => void
  onSeek: (time: number) => void
  currentTime: number
  duration: number
  
  // Trim controls
  onSetTrimStart: () => void
  onSetTrimEnd: () => void
  onJumpToTrimStart: () => void
  onJumpToTrimEnd: () => void
  trimStart: number
  trimEnd: number
  
  // Export
  onExport?: () => void
  
  // Volume (optional)
  onToggleMute?: () => void
  onVolumeChange?: (delta: number) => void
  
  // Fullscreen (optional)
  onToggleFullscreen?: () => void
  
  // Reset
  onResetTrim?: () => void
  
  // Enable/disable shortcuts (useful when input fields are focused)
  enabled?: boolean
}

type Shortcut = {
  key: string
  description: string
}

const HANDLED_KEYS = [
  'Space', 'ArrowLeft', 'ArrowRight', 'KeyJ', 'KeyK', 'KeyI', 'KeyO',
  'Home', 'End', 'Enter', 'KeyM', 'Equal', 'Minus', 'KeyF', 'KeyR'
] as const

const SHORTCUTS: Shortcut[] = [
  { key: 'Space', description: 'Play/Pause' },
  { key: '← →', description: 'Seek 5 seconds' },
  { key: 'Shift + ← →', description: 'Seek 1 second' },
  { key: 'J', description: 'Set trim start' },
  { key: 'K', description: 'Set trim end' },
  { key: 'I', description: 'Jump to trim start' },
  { key: 'O', description: 'Jump to trim end' },
  { key: 'Home', description: 'Jump to beginning' },
  { key: 'End', description: 'Jump to end' },
  { key: 'Enter', description: 'Export video' },
  { key: 'M', description: 'Toggle mute' },
  { key: '+ -', description: 'Volume up/down' },
  { key: 'F', description: 'Toggle fullscreen' },
  { key: 'R', description: 'Reset trim' },
]

const isInputElement = (target: EventTarget | null): boolean => {
  return target instanceof HTMLInputElement || 
         target instanceof HTMLTextAreaElement ||
         target instanceof HTMLSelectElement
}

export function useKeyboardShortcuts({
  onPlayPause,
  onSeek,
  currentTime,
  duration,
  onSetTrimStart,
  onSetTrimEnd,
  onJumpToTrimStart,
  onJumpToTrimEnd,
  trimStart,
  trimEnd,
  onExport,
  onToggleMute,
  onVolumeChange,
  onToggleFullscreen,
  onResetTrim,
  enabled = true
}: KeyboardShortcutsProps) {
  
  const handleKeyPress = useCallback((e: KeyboardEvent) => {
    // Early returns for guard clauses
    if (!enabled) return
    if (isInputElement(e.target)) return

    // Prevent default for handled keys
    if (HANDLED_KEYS.includes(e.code as typeof HANDLED_KEYS[number])) {
      e.preventDefault()
    }

    // Use functional approach with early returns instead of switch
    const seekLeft = e.shiftKey ? 1 : 5
    const seekRight = e.shiftKey ? 1 : 5

    const keyActions: Record<string, () => void> = {
      Space: onPlayPause,
      ArrowLeft: () => onSeek(Math.max(0, currentTime - seekLeft)),
      ArrowRight: () => onSeek(Math.min(duration, currentTime + seekRight)),
      KeyJ: onSetTrimStart,
      KeyK: onSetTrimEnd,
      KeyI: onJumpToTrimStart,
      KeyO: onJumpToTrimEnd,
      Home: () => onSeek(0),
      End: () => onSeek(duration),
      Enter: () => onExport?.(),
      KeyM: () => onToggleMute?.(),
      Equal: () => onVolumeChange?.(0.1),
      Minus: () => onVolumeChange?.(-0.1),
      KeyF: () => onToggleFullscreen?.(),
      KeyR: () => onResetTrim?.(),
    }

    const action = keyActions[e.code]
    action?.()
  }, [
    enabled, onPlayPause, onSeek, currentTime, duration,
    onSetTrimStart, onSetTrimEnd, onJumpToTrimStart, onJumpToTrimEnd,
    onExport, onToggleMute, onVolumeChange,
    onToggleFullscreen, onResetTrim
  ])

  // This useEffect is necessary for keyboard event handling - no way around it
  useEffect(() => {
    if (!enabled) return

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [handleKeyPress, enabled])

  return { shortcuts: SHORTCUTS }
} 