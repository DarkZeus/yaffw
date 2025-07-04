import { useCallback, useEffect, useRef } from 'react'

type UseSmoothTimelinePlayheadProps = {
  currentTime: number
  duration: number
  isPlaying: boolean
  isDragging: boolean
}

export const useSmoothTimelinePlayhead = ({ 
  currentTime, 
  duration, 
  isPlaying, 
  isDragging 
}: UseSmoothTimelinePlayheadProps) => {
  const playheadRef = useRef<HTMLDivElement>(null)
  const rafId = useRef<number | null>(null)
  const lastUpdateTime = useRef<number>(0)
  const lastPosition = useRef<number>(0)
  const targetPosition = useRef<number>(0)

  // Convert time to position percentage
  const getPositionFromTime = useCallback((time: number): number => {
    return duration > 0 ? (time / duration) * 100 : 0
  }, [duration])

  // Smooth interpolation for buttery movement
  const interpolatePosition = useCallback((current: number, target: number, factor: number): number => {
    return current + (target - current) * factor
  }, [])

  // High-frequency update loop - runs at display refresh rate (up to 120fps)
  const updatePlayheadPosition = useCallback(() => {
    if (!playheadRef.current) return

    const now = performance.now()
    const deltaTime = now - lastUpdateTime.current
    lastUpdateTime.current = now

    // Calculate target position from current time
    const newTargetPosition = getPositionFromTime(currentTime)
    targetPosition.current = newTargetPosition

    // During playback, interpolate for ultra-smooth movement
    if (isPlaying && !isDragging) {
      // Smooth interpolation factor (higher = more responsive, lower = smoother)
      const interpolationFactor = Math.min(deltaTime / 16, 1) // Normalize to 60fps baseline
      lastPosition.current = interpolatePosition(lastPosition.current, targetPosition.current, interpolationFactor)
    } else {
      // Immediate update when not playing or when dragging
      lastPosition.current = targetPosition.current
    }

    // Use GPU-accelerated transform instead of changing left property
    const transform = `translateX(${lastPosition.current}%)`
    playheadRef.current.style.transform = transform

    // Continue the animation loop if playing
    if (isPlaying && !isDragging) {
      rafId.current = requestAnimationFrame(updatePlayheadPosition)
    }
  }, [currentTime, isPlaying, isDragging, getPositionFromTime, interpolatePosition])

  // Start/stop the animation loop based on playback state
  useEffect(() => {
    if (isPlaying && !isDragging) {
      // Reset timing for smooth start
      lastUpdateTime.current = performance.now()
      lastPosition.current = getPositionFromTime(currentTime)
      targetPosition.current = lastPosition.current
      
      rafId.current = requestAnimationFrame(updatePlayheadPosition)
    } else {
      // Stop the loop and do immediate update
      if (rafId.current) {
        cancelAnimationFrame(rafId.current)
        rafId.current = null
      }
      updatePlayheadPosition()
    }

    return () => {
      if (rafId.current) {
        cancelAnimationFrame(rafId.current)
        rafId.current = null
      }
    }
  }, [isPlaying, isDragging, updatePlayheadPosition, currentTime, getPositionFromTime])

  // Force immediate update when time changes (for seeking)
  useEffect(() => {
    if (!isPlaying || isDragging) {
      updatePlayheadPosition()
    }
  }, [updatePlayheadPosition, isPlaying, isDragging])

  return {
    playheadRef,
    // Return static position for fallback/initial render
    fallbackPosition: getPositionFromTime(currentTime)
  }
} 