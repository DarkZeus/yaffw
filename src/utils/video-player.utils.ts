import { INTERACTIVE_SELECTORS } from '../constants/video-player.constants'

/**
 * Checks if the clicked target is an interactive control element
 */
export const isInteractiveElement = (target: HTMLElement): boolean => {
  return INTERACTIVE_SELECTORS.some(selector => target.closest(selector))
}

/**
 * Clears a timeout if it exists
 */
export const clearTimeoutSafely = (timeoutRef: React.MutableRefObject<NodeJS.Timeout | null>): void => {
  if (timeoutRef.current) {
    clearTimeout(timeoutRef.current)
    timeoutRef.current = null
  }
}

/**
 * Creates a debounced function for setting timeouts
 */
export const createDebouncedTimeout = (
  callback: () => void,
  delay: number,
  timeoutRef: React.MutableRefObject<NodeJS.Timeout | null>
): void => {
  clearTimeoutSafely(timeoutRef)
  timeoutRef.current = setTimeout(callback, delay)
}

/**
 * Determines control visibility based on fullscreen state
 */
export const getControlsVisibility = (isFullscreen: boolean, showControls: boolean): boolean => {
  return isFullscreen ? showControls : true
}

/**
 * Determines if cursor should be hidden
 */
export const shouldHideCursor = (isFullscreen: boolean, showControls: boolean): boolean => {
  return isFullscreen && !showControls
}

/**
 * Generates container classes based on cursor state
 */
export const getContainerClasses = (baseClass: string, hideCursorClass: string, shouldHide: boolean): string => {
  return shouldHide ? `${baseClass} ${hideCursorClass}` : baseClass
}

/**
 * Generates click overlay classes based on cursor state
 */
export const getClickOverlayClasses = (
  baseClass: string,
  hiddenCursorClass: string,
  visibleCursorClass: string,
  shouldHide: boolean
): string => {
  const cursorClass = shouldHide ? hiddenCursorClass : visibleCursorClass
  return `${baseClass} ${cursorClass}`
}

/**
 * Generates controls overlay classes based on visibility state
 */
export const getControlsOverlayClasses = (
  baseClass: string,
  visibleClass: string,
  hiddenClass: string,
  hoverClass: string,
  isFullscreen: boolean,
  isVisible: boolean
): string => {
  if (isFullscreen) {
    const visibilityClass = isVisible ? visibleClass : hiddenClass
    return `${baseClass} ${visibilityClass}`
  }
  return `${baseClass} ${hoverClass}`
}

/**
 * Formats time in seconds to MM:SS or HH:MM:SS format
 */
export const formatTime = (timeInSeconds: number): string => {
  if (!timeInSeconds || Number.isNaN(timeInSeconds)) return '00:00'
  
  const hours = Math.floor(timeInSeconds / 3600)
  const minutes = Math.floor((timeInSeconds % 3600) / 60)
  const seconds = Math.floor(timeInSeconds % 60)
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
} 