import { useCallback, useEffect } from 'react'

interface KeyboardShortcutsProps {
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
    // Don't trigger shortcuts if typing in input fields
    if (!enabled || 
        e.target instanceof HTMLInputElement || 
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement) {
      return
    }

    // Prevent default for handled keys
    const handledKeys = [
      'Space', 'ArrowLeft', 'ArrowRight', 'KeyJ', 'KeyK', 'KeyI', 'KeyO',
      'Home', 'End', 'Enter', 'KeyM', 'Equal', 'Minus', 'KeyF', 'KeyR'
    ]
    
    if (handledKeys.includes(e.code)) {
      e.preventDefault()
    }

    switch (e.code) {
      // Basic Playback
      case 'Space':
        onPlayPause()
        break
        
      case 'ArrowLeft':
        if (e.shiftKey) {
          // Fine control: 1 second
          onSeek(Math.max(0, currentTime - 1))
        } else {
          // Normal: 5 seconds
          onSeek(Math.max(0, currentTime - 5))
        }
        break
        
      case 'ArrowRight':
        if (e.shiftKey) {
          // Fine control: 1 second
          onSeek(Math.min(duration, currentTime + 1))
        } else {
          // Normal: 5 seconds
          onSeek(Math.min(duration, currentTime + 5))
        }
        break
        
      // Trimming
      case 'KeyJ':
        onSetTrimStart()
        break
        
      case 'KeyK':
        onSetTrimEnd()
        break
        
      case 'KeyI':
        onJumpToTrimStart()
        break
        
      case 'KeyO':
        onJumpToTrimEnd()
        break
        
      // Navigation
      case 'Home':
        onSeek(0)
        break
        
      case 'End':
        onSeek(duration)
        break
        
      // Export
      case 'Enter':
        if (onExport) {
          onExport()
        }
        break
        
      // Volume
      case 'KeyM':
        if (onToggleMute) {
          onToggleMute()
        }
        break
        
      case 'Equal': // + key
        if (onVolumeChange) {
          onVolumeChange(0.1)
        }
        break
        
      case 'Minus':
        if (onVolumeChange) {
          onVolumeChange(-0.1)
        }
        break
        
      // Fullscreen
      case 'KeyF':
        if (onToggleFullscreen) {
          onToggleFullscreen()
        }
        break
        
      // Reset
      case 'KeyR':
        if (onResetTrim) {
          onResetTrim()
        }
        break
    }
  }, [
    enabled, onPlayPause, onSeek, currentTime, duration,
    onSetTrimStart, onSetTrimEnd, onJumpToTrimStart, onJumpToTrimEnd,
    onExport, onToggleMute, onVolumeChange,
    onToggleFullscreen, onResetTrim
  ])

  useEffect(() => {
    if (enabled) {
      window.addEventListener('keydown', handleKeyPress)
      return () => window.removeEventListener('keydown', handleKeyPress)
    }
  }, [handleKeyPress, enabled])

  // Return the shortcuts for display in UI
  return {
    shortcuts: [
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
  }
} 