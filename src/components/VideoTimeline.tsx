import { motion } from 'motion/react'
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import type ReactPlayer from 'react-player'
import { useVideoTimelineSync } from '../hooks/useVideoTimelineSync'

type VideoTimelineProps = {
  duration: number
  currentTime: number
  trimStart: number
  trimEnd: number
  onTrimChange: (start: number, end: number) => void
  onSeek: (time: number) => void
  waveformImagePath?: string
  hasAudio?: boolean
  isPlaying?: boolean
  playerRef: React.RefObject<ReactPlayer | null>
  zoomLevel?: number
}

export const VideoTimeline = memo(function VideoTimeline({
  duration,
  currentTime,
  trimStart,
  trimEnd,
  onTrimChange,
  onSeek,
  waveformImagePath,
  hasAudio = true,
  isPlaying = false,
  playerRef,
  zoomLevel = 1
}: VideoTimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState<'playhead' | 'trimStart' | 'trimEnd' | 'selection' | null>(null)
  const [dragStartX, setDragStartX] = useState(0)
  const [initialTrimStart, setInitialTrimStart] = useState(0)
  const [initialTrimEnd, setInitialTrimEnd] = useState(0)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)

  // Simple zoom calculation - let parent ScrollArea handle containment

  // Real-time playhead sync with video element
  const { playheadPosition, forceUpdatePosition } = useVideoTimelineSync({
    playerRef,
    duration,
    isPlaying,
    isDragging: isDragging === 'playhead',
    currentTime // Pass React state currentTime to detect external seeks
  })

  // Use transitions for non-urgent updates
  const [isPending, startTransition] = useTransition()

  // Defer expensive visual updates during interactions
  const deferredTrimStart = useDeferredValue(trimStart)
  const deferredTrimEnd = useDeferredValue(trimEnd)
  const deferredCurrentTime = useDeferredValue(currentTime)

  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }, [])

  const getTimeFromPosition = useCallback((clientX: number) => {
    if (!timelineRef.current) return 0
    const rect = timelineRef.current.getBoundingClientRect()
    const position = (clientX - rect.left) / rect.width
    const calculatedTime = Math.max(0, Math.min(duration, position * duration))
    return calculatedTime
  }, [duration])

  // Convert time to position percentage (0-100%)
  const getPositionFromTime = useCallback((time: number) => {
    return (time / duration) * 100
  }, [duration])

  const handleMouseDown = useCallback((e: React.MouseEvent, type: 'playhead' | 'trimStart' | 'trimEnd') => {
    e.stopPropagation()
    e.preventDefault() // Also prevent default to ensure no interference
    setIsDragging(type)
  }, [])

  const handleSelectionMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault() // Also prevent default to ensure no interference
    setIsDragging('selection')
    setDragStartX(e.clientX)
    setInitialTrimStart(trimStart)
    setInitialTrimEnd(trimEnd)
  }, [trimStart, trimEnd])

  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      return
    }
    
    const newTime = getTimeFromPosition(e.clientX)
    
    startTransition(() => {
      onSeek(newTime)
      // Force update playhead position immediately for responsiveness
      forceUpdatePosition(newTime)
    })
  }, [isDragging, getTimeFromPosition, onSeek, forceUpdatePosition])

  // Throttle mouse move events for better performance
  const lastMoveTime = useRef(0)
  const animationFrameId = useRef<number | null>(null)

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return
    
      if (isDragging === 'selection') {
      // Immediate selection drag - no throttling, no rAF, no startTransition
        const pixelOffset = e.clientX - dragStartX
        if (!timelineRef.current) return
        
        const timelineWidth = timelineRef.current.offsetWidth
        const timeOffset = (pixelOffset / timelineWidth) * duration
        
        const selectionDuration = initialTrimEnd - initialTrimStart
        let newTrimStart = initialTrimStart + timeOffset
        let newTrimEnd = initialTrimEnd + timeOffset
        
        // Constrain to video boundaries
        if (newTrimStart < 0) {
          newTrimStart = 0
          newTrimEnd = selectionDuration
        } else if (newTrimEnd > duration) {
          newTrimEnd = duration
          newTrimStart = duration - selectionDuration
        }
        
      // Update immediately for snappy response
          onTrimChange(newTrimStart, newTrimEnd)
        return
      }
      
    // For other drag types, keep some throttling for performance
    const now = Date.now()
    if (now - lastMoveTime.current < 16) return
    lastMoveTime.current = now

    if (animationFrameId.current) return
    
    animationFrameId.current = requestAnimationFrame(() => {
      const newTime = getTimeFromPosition(e.clientX)
      
      if (isDragging === 'playhead') {
        onSeek(newTime)
        // Force update playhead position during dragging for immediate feedback
        forceUpdatePosition(newTime)
      } else if (isDragging === 'trimStart') {
        // Update trim handles immediately too
          onTrimChange(Math.min(newTime, trimEnd - 0.1), trimEnd)
      } else if (isDragging === 'trimEnd') {
          onTrimChange(trimStart, Math.max(newTime, trimStart + 0.1))
      }
      
      animationFrameId.current = null
    })
  }, [isDragging, getTimeFromPosition, onSeek, onTrimChange, trimStart, trimEnd, dragStartX, duration, initialTrimStart, initialTrimEnd, forceUpdatePosition])

  const handleMouseUp = useCallback(() => {
    setIsDragging(null)
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current)
      animationFrameId.current = null
    }
  }, [])

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  // Memoize expensive calculations - limit markers to prevent layout issues
  const timeMarkers = useMemo(() => {
    const markerCount = Math.min(50, Math.max(11, Math.floor(zoomLevel * 11))) // Cap at 50 markers
    return Array.from({ length: markerCount }, (_, i) => ({
      id: `marker-${i}`,
      time: (i / (markerCount - 1)) * duration,
      position: (i / (markerCount - 1)) * 100
    }))
  }, [duration, zoomLevel])

  const waveformPattern = useMemo(() => {
    // Reduce DOM elements from 50 to 20 for better performance
    return Array.from({ length: 20 }, (_, i) => ({
      id: `wave-${i}`,
      left: (i / 19) * 100,
      top: 20 + Math.sin(i * 0.8) * 8,
      height: 20 + Math.abs(Math.sin(i * 0.5)) * 15
    }))
  }, [])

  // Use immediate values for dragging responsiveness, deferred for expensive visuals
  const displayTrimStart = isDragging ? trimStart : deferredTrimStart
  const displayTrimEnd = isDragging ? trimEnd : deferredTrimEnd
  const displayCurrentTime = isDragging === 'playhead' ? currentTime : deferredCurrentTime

  // Memoize position calculations with deferred values for smooth performance
  // Note: playheadPos is no longer used since we use the real-time MotionValue
  const positions = useMemo(() => {
    return {
    trimStartPos: getPositionFromTime(displayTrimStart),
      trimEndPos: getPositionFromTime(displayTrimEnd)
    }
  }, [displayTrimStart, displayTrimEnd, getPositionFromTime])

  // Memoize frequently used formatted times with deferred values
  const formattedTimes = useMemo(() => ({
    currentTime: formatTime(displayCurrentTime),
    trimStart: formatTime(displayTrimStart),
    trimEnd: formatTime(displayTrimEnd),
    duration: formatTime(duration),
    selectionDuration: formatTime(displayTrimEnd - displayTrimStart)
  }), [formatTime, displayCurrentTime, displayTrimStart, displayTrimEnd, duration])

  // Reset loading state when image URL changes
  const handleImageLoad = () => {
    setImageLoaded(true)
    setImageError(false)
  }

  const handleImageError = () => {
    setImageLoaded(false)
    setImageError(true)
  }

  // Generate waveform image 
  const imageUrl = useMemo(() => {
    if (!waveformImagePath) return null
    
    // Extract just the filename from the full path - handle both Windows (\) and Unix (/) paths
    const filename = waveformImagePath.split(/[/\\]/).pop() || waveformImagePath
    const url = `http://localhost:3001/api/waveform/${filename}`

    
    return url
  }, [waveformImagePath])

  return (
    <div 
      className="bg-gray-900 rounded-xl p-4 shadow-2xl"
      style={{ minWidth: `${100 * zoomLevel}%` }}
    >
        {/* Time Ruler */}
        <div className="relative h-8 mb-2">
          <div className="flex justify-between items-center h-auto">
            {timeMarkers.map((marker) => (
              <div key={marker.id} className="flex flex-col items-center">
                <div className="w-px h-4 bg-gray-600" />
                <span className="text-xs text-gray-400 mt-1 font-mono">
                  {formatTime(marker.time)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Main Timeline Track */}
        <div 
          ref={timelineRef}
          className="relative h-16 bg-gray-800 rounded-lg cursor-crosshair overflow-hidden group select-none"
          onClick={handleTimelineClick}
          onKeyDown={(e) => {
            if (e.key === ' ') {
              e.preventDefault()
              const newTime = getTimeFromPosition(e.currentTarget.offsetWidth / 2) // Seek to middle when using keyboard
              onSeek(newTime)
            }
          }}
        >
        {imageUrl && hasAudio && (
            <img
              src={imageUrl}
              alt="Audio waveform"
              className="w-full h-full object-fill rounded-md"
              style={{ backgroundColor: '#1f2937' }}
              onLoad={handleImageLoad}
              onError={handleImageError}
            />
          )}

          {/* Loading state - only show while image is loading */}
          {imageUrl && !imageLoaded && !imageError && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800 rounded-md">
              <div className="flex items-center space-x-2 text-gray-400">
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Loading waveform...</span>
              </div>
            </div>
          )}

          {/* Error state */}
          {imageUrl && imageError && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800 rounded-md">
              <div className="text-gray-400 text-sm">
                Failed to load waveform image
              </div>
            </div>
          )}
          
          {/* Trim Selection Area */}
          <motion.div 
            className="absolute top-0 bottom-0 bg-emerald-400/30 border-2 border-emerald-400 cursor-move select-none"
            animate={{
              left: `${positions.trimStartPos}%`,
              width: `${positions.trimEndPos - positions.trimStartPos}%`,
            }}
            transition={{
              duration: 0,
              ease: 'linear'
            }}
            onMouseDown={handleSelectionMouseDown}
          >
            {/* Selection Label - prevent it from blocking timeline clicks */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-white font-bold text-xs bg-black/60 px-2 py-1 rounded backdrop-blur-sm pointer-events-none">
              {formattedTimes.selectionDuration}
              </span>
            </div>
          </motion.div>

          {/* Trim Start Handle */}
          <motion.div
            className="absolute top-0 bottom-0 transform-gpu -translate-x-3 w-6 bg-transparent cursor-ew-resize flex items-center justify-center group/handle z-20 select-none"
            animate={{
              left: `${positions.trimStartPos}%`,
            }}
            transition={{
              duration: 0,
              ease: 'linear'
            }}
            onMouseDown={(e) => handleMouseDown(e, 'trimStart')}
          />

          {/* Trim End Handle */}
          <motion.div
            className="absolute top-0 bottom-0 transform-gpu -translate-x-3 w-6 bg-transparent cursor-ew-resize flex items-center justify-center group/handle z-20 select-none"
            animate={{
              left: `${positions.trimEndPos}%`,
            }}
            transition={{
              duration: 0,
              ease: 'linear'
            }}
            onMouseDown={(e) => handleMouseDown(e, 'trimEnd')}
          />

          {/* Playhead */}
          <motion.div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 cursor-ew-resize z-30 select-none"
            style={{ 
              left: playheadPosition,
            }}
            onMouseDown={(e) => handleMouseDown(e, 'playhead')}
          >
            
            {/* Playhead Time Display */}
            {(isDragging === 'playhead') && (
              <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-red-500 text-white text-xs px-2 py-1 rounded whitespace-nowrap font-mono">
                {formatTime(currentTime)}
              </div>
            )}
          </motion.div>

        </div>

        {/* Timeline Labels */}
        <div className="flex justify-between mt-2 text-xs text-gray-400">
          <span className="font-mono">
            {zoomLevel > 1 && (
              <span className="text-blue-400">
                Scroll horizontally to navigate
              </span>
            )}
            {zoomLevel === 1 && <span>&nbsp;</span>}
          </span>
          <span className="font-mono">{formattedTimes.duration} total</span>
        </div>
      </div>
  )
})