import { useMotionValue } from 'motion/react'
import { useCallback, useEffect, useRef } from 'react'
import type ReactPlayer from 'react-player'

type UseVideoTimelineSyncProps = {
  playerRef: React.RefObject<ReactPlayer | null>
  duration: number
  isPlaying: boolean
  isDragging: boolean
  currentTime: number // React state currentTime to detect external seeks
}

export const useVideoTimelineSync = ({ 
  playerRef, 
  duration, 
  isPlaying, 
  isDragging,
  currentTime 
}: UseVideoTimelineSyncProps) => {
  const rafId = useRef<number | null>(null)
  
  // MotionValue for smooth, hardware-accelerated playhead position
  const playheadPosition = useMotionValue("0%")
  
  // Get current time from video element (source of truth)
  const getCurrentVideoTime = useCallback((): number => {
    if (!playerRef.current) return 0
    
    try {
      // Try to get the current time from ReactPlayer
      const currentTime = playerRef.current.getCurrentTime()
      return typeof currentTime === 'number' ? currentTime : 0
    } catch {
      return 0
    }
  }, [playerRef])
  
  // Convert time to position percentage
  const timeToPosition = useCallback((time: number): number => {
    return duration > 0 ? (time / duration) * 100 : 0
  }, [duration])
  
  // Animation frame loop for real-time sync
  const updatePlayheadPosition = useCallback(() => {
    const currentTime = getCurrentVideoTime()
    const newPosition = timeToPosition(currentTime)
    
    // Update MotionValue directly (bypasses React rendering)
    // Use string with % unit for CSS left property
    playheadPosition.set(`${newPosition}%`)
    
    // Continue the loop if playing and not being dragged by user
    if (isPlaying && !isDragging) {
      rafId.current = requestAnimationFrame(updatePlayheadPosition)
    }
  }, [getCurrentVideoTime, timeToPosition, playheadPosition, isPlaying, isDragging])
  
  // Start/stop animation loop based on playback state
  useEffect(() => {
    if (isPlaying && !isDragging) {
      // Start the real-time sync loop
      rafId.current = requestAnimationFrame(updatePlayheadPosition)
    } else {
      // Stop the loop but do one final update
      if (rafId.current) {
        cancelAnimationFrame(rafId.current)
        rafId.current = null
      }
      // Immediate update for seeking/paused state
      updatePlayheadPosition()
    }
    
    return () => {
      if (rafId.current) {
        cancelAnimationFrame(rafId.current)
        rafId.current = null
      }
    }
  }, [isPlaying, isDragging, updatePlayheadPosition])
  
  // Force update when duration changes
  useEffect(() => {
    const currentTime = getCurrentVideoTime()
    const newPosition = timeToPosition(currentTime)
    playheadPosition.set(`${newPosition}%`)
  }, [getCurrentVideoTime, timeToPosition, playheadPosition])
  
  // Force update when React state currentTime changes (external seeks like I/O keys)
  useEffect(() => {
    if (!isDragging) { // Only update if not dragging to avoid conflicts
      const newPosition = timeToPosition(currentTime)
      playheadPosition.set(`${newPosition}%`)
    }
  }, [currentTime, timeToPosition, playheadPosition, isDragging])
  
  // Force update playhead position (useful for seeking)
  const forceUpdatePosition = useCallback((time?: number) => {
    const currentTime = time ?? getCurrentVideoTime()
    const newPosition = timeToPosition(currentTime)
    playheadPosition.set(`${newPosition}%`)
  }, [getCurrentVideoTime, timeToPosition, playheadPosition])

  return {
    playheadPosition, // MotionValue for the playhead's left position (%)
    getCurrentVideoTime, // Utility to get real video time
    timeToPosition, // Utility to convert time to position
    forceUpdatePosition // Force update position for seeking
  }
} 