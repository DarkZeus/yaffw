import { useEffect, useRef, useState } from 'react'
import { CONTROLS_HIDE_DELAY } from '../constants/video-player.constants'
import { clearTimeoutSafely, createDebouncedTimeout } from '../utils/video-player.utils'

/**
 * Custom hook for managing auto-hide controls in fullscreen mode
 * Encapsulates the useEffect logic to keep main component clean
 */
export const useAutoHideControls = (isFullscreen: boolean) => {
  const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [showControls, setShowControls] = useState(true)

  // Reset controls when fullscreen state changes
  useEffect(() => {
    if (!isFullscreen) {
      setShowControls(true)
      clearTimeoutSafely(hideControlsTimeoutRef)
      return
    }

    setShowControls(true)
    clearTimeoutSafely(hideControlsTimeoutRef)

    // Start hide timer in fullscreen
    createDebouncedTimeout(
      () => setShowControls(false),
      CONTROLS_HIDE_DELAY,
      hideControlsTimeoutRef
    )
  }, [isFullscreen])

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimeoutSafely(hideControlsTimeoutRef)
  }, [])

  /**
   * Reset the hide timer - used for mouse movement
   */
  const resetHideTimer = (): void => {
    if (!isFullscreen) return

    setShowControls(true)
    createDebouncedTimeout(
      () => setShowControls(false),
      CONTROLS_HIDE_DELAY,
      hideControlsTimeoutRef
    )
  }

  return {
    showControls,
    resetHideTimer
  }
} 