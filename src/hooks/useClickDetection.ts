import { useEffect, useRef } from 'react'
import { CLICK_DETECTION_DELAY, KEYBOARD_SHORTCUTS } from '../constants/video-player.constants'
import { clearTimeoutSafely, createDebouncedTimeout, isInteractiveElement } from '../utils/video-player.utils'

type ClickDetectionConfig = {
  onSingleClick: () => void
  onDoubleClick: () => void
}

/**
 * Custom hook for handling single/double click detection with proper timeout management
 */
export const useClickDetection = ({ onSingleClick, onDoubleClick }: ClickDetectionConfig) => {
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimeoutSafely(clickTimeoutRef)
  }, [])

  /**
   * Handle video click with single/double click detection
   */
  const handleVideoClick = (e: React.MouseEvent): void => {
    const target = e.target as HTMLElement
    
    // Early return for interactive elements
    if (isInteractiveElement(target)) return

    clearTimeoutSafely(clickTimeoutRef)

    // Set timeout for single click
    createDebouncedTimeout(onSingleClick, CLICK_DETECTION_DELAY, clickTimeoutRef)
  }

  /**
   * Handle double click for fullscreen
   */
  const handleVideoDoubleClick = (e: React.MouseEvent): void => {
    const target = e.target as HTMLElement
    
    // Early return for interactive elements
    if (isInteractiveElement(target)) return

    // Clear single click timeout and trigger double click
    clearTimeoutSafely(clickTimeoutRef)
    onDoubleClick()
  }

  /**
   * Handle keyboard events
   */
  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (KEYBOARD_SHORTCUTS.PLAY_PAUSE.includes(e.key)) {
      onSingleClick()
      return
    }
    
    if (KEYBOARD_SHORTCUTS.FULLSCREEN.includes(e.key)) {
      onDoubleClick()
      return
    }
  }

  return {
    handleVideoClick,
    handleVideoDoubleClick,
    handleKeyDown
  }
} 