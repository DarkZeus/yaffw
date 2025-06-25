import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { ImageAudioWaveform } from './ImageAudioWaveform'

type WaveformPoint = {
  time: number
  amplitude: number
}

type VideoTimelineProps = {
  duration: number
  currentTime: number
  trimStart: number
  trimEnd: number
  onTrimChange: (start: number, end: number) => void
  onSeek: (time: number) => void
  waveformData?: WaveformPoint[]
  waveformImagePath?: string
  waveformImageDimensions?: { width: number; height: number }
  hasAudio?: boolean
}

export const VideoTimeline = memo(function VideoTimeline({
  duration,
  currentTime,
  trimStart,
  trimEnd,
  onTrimChange,
  onSeek,
  waveformData,
  waveformImagePath,
  waveformImageDimensions,
  hasAudio = true
}: VideoTimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState<'playhead' | 'trimStart' | 'trimEnd' | 'selection' | null>(null)
  const [dragStartX, setDragStartX] = useState(0)
  const [initialTrimStart, setInitialTrimStart] = useState(0)
  const [initialTrimEnd, setInitialTrimEnd] = useState(0)
  const [isHovering, setIsHovering] = useState<string | null>(null)

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
    return Math.max(0, Math.min(duration, position * duration))
  }, [duration])

  const handleMouseDown = useCallback((e: React.MouseEvent, type: 'playhead' | 'trimStart' | 'trimEnd') => {
    e.stopPropagation()
    setIsDragging(type)
  }, [])

  const handleSelectionMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsDragging('selection')
    setDragStartX(e.clientX)
    setInitialTrimStart(trimStart)
    setInitialTrimEnd(trimEnd)
  }, [trimStart, trimEnd])

  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if (isDragging) return
    const newTime = getTimeFromPosition(e.clientX)
    startTransition(() => {
      onSeek(newTime)
    })
  }, [isDragging, getTimeFromPosition, onSeek])

  // Throttle mouse move events for better performance
  const lastMoveTime = useRef(0)
  const animationFrameId = useRef<number | null>(null)

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return
    
    // Throttle to 60fps for smooth performance
    const now = Date.now()
    if (now - lastMoveTime.current < 16) return
    lastMoveTime.current = now

    if (animationFrameId.current) return
    
    animationFrameId.current = requestAnimationFrame(() => {
      if (isDragging === 'selection') {
        // Calculate the offset in pixels, then convert to time
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
        
        startTransition(() => {
          onTrimChange(newTrimStart, newTrimEnd)
        })
        animationFrameId.current = null
        return
      }
      
      const newTime = getTimeFromPosition(e.clientX)
      
      if (isDragging === 'playhead') {
        onSeek(newTime)
      } else if (isDragging === 'trimStart') {
        startTransition(() => {
          onTrimChange(Math.min(newTime, trimEnd - 0.1), trimEnd)
        })
      } else if (isDragging === 'trimEnd') {
        startTransition(() => {
          onTrimChange(trimStart, Math.max(newTime, trimStart + 0.1))
        })
      }
      
      animationFrameId.current = null
    })
  }, [isDragging, getTimeFromPosition, onSeek, onTrimChange, trimStart, trimEnd, dragStartX, duration, initialTrimStart, initialTrimEnd])

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

  // Memoize expensive calculations
  const timeMarkers = useMemo(() => {
    return Array.from({ length: 11 }, (_, i) => ({
      id: `marker-${i}`,
      time: (i / 10) * duration,
      position: (i / 10) * 100
    }))
  }, [duration])

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
  const positions = useMemo(() => ({
    trimStartPos: (displayTrimStart / duration) * 100,
    trimEndPos: (displayTrimEnd / duration) * 100,
    playheadPos: (displayCurrentTime / duration) * 100
  }), [displayTrimStart, displayTrimEnd, displayCurrentTime, duration])

  // Memoize frequently used formatted times with deferred values
  const formattedTimes = useMemo(() => ({
    currentTime: formatTime(displayCurrentTime),
    trimStart: formatTime(displayTrimStart),
    trimEnd: formatTime(displayTrimEnd),
    duration: formatTime(duration),
    selectionDuration: formatTime(displayTrimEnd - displayTrimStart)
  }), [formatTime, displayCurrentTime, displayTrimStart, displayTrimEnd, duration])

  return (
    <div className="space-y-6">
      {/* Professional Timeline Container */}
      <div className="bg-gray-900 rounded-xl p-4 shadow-2xl">
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
          onMouseEnter={() => setIsHovering('timeline')}
          onMouseLeave={() => setIsHovering(null)}
        >
          {/* Waveform-style background pattern */}
          <div className="absolute inset-0 opacity-20">
            {waveformPattern.map((wave) => (
              <div
                key={wave.id}
                className="absolute bg-blue-400 rounded-full"
                style={{
                  left: `${wave.left}%`,
                  top: `${wave.top}px`,
                  width: '2px',
                  height: `${wave.height}px`,
                }}
              />
            ))}
          </div>

          {/* Trim Selection Area */}
          <div 
            className="absolute top-0 bottom-0 bg-gradient-to-r from-emerald-400/80 to-emerald-500/80 border-2 border-emerald-400 transition-all duration-200 ease-out cursor-move select-none"
            style={{
              left: `${positions.trimStartPos}%`,
              width: `${positions.trimEndPos - positions.trimStartPos}%`,
              boxShadow: isHovering === 'trim' || isDragging === 'selection' ? '0 0 20px rgba(52, 211, 153, 0.6)' : '0 4px 12px rgba(0, 0, 0, 0.3)',
            }}
            onMouseDown={handleSelectionMouseDown}
            onMouseEnter={() => setIsHovering('trim')}
            onMouseLeave={() => setIsHovering(null)}
          >
            {/* Selection Label */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-white font-bold text-xs bg-black/60 px-2 py-1 rounded backdrop-blur-sm">
                {formattedTimes.selectionDuration}
              </span>
            </div>
          </div>

          {/* Trim Start Handle */}
          <div
            className="absolute top-0 bottom-0 w-3 bg-emerald-500 cursor-ew-resize hover:bg-emerald-400 transition-all duration-200 flex items-center justify-center group/handle z-20 select-none"
            style={{ left: `${positions.trimStartPos}%`, transform: 'translateX(-50%)' }}
            onMouseDown={(e) => handleMouseDown(e, 'trimStart')}
            onMouseEnter={() => setIsHovering('trimStart')}
            onMouseLeave={() => setIsHovering(null)}
          >
            <div className="w-1 h-8 bg-white rounded opacity-80 group-hover/handle:opacity-100" />
            {isHovering === 'trimStart' && (
              <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-black text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                {formatTime(trimStart)}
              </div>
            )}
          </div>

          {/* Trim End Handle */}
          <div
            className="absolute top-0 bottom-0 w-3 bg-emerald-500 cursor-ew-resize hover:bg-emerald-400 transition-all duration-200 flex items-center justify-center group/handle z-20 select-none"
            style={{ left: `${positions.trimEndPos}%`, transform: 'translateX(-50%)' }}
            onMouseDown={(e) => handleMouseDown(e, 'trimEnd')}
            onMouseEnter={() => setIsHovering('trimEnd')}
            onMouseLeave={() => setIsHovering(null)}
          >
            <div className="w-1 h-8 bg-white rounded opacity-80 group-hover/handle:opacity-100" />
            {isHovering === 'trimEnd' && (
              <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-black text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                {formatTime(trimEnd)}
              </div>
            )}
          </div>

          {/* Professional Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 cursor-ew-resize z-30 transition-all duration-100 select-none"
            style={{ 
              left: `${positions.playheadPos}%`,
              boxShadow: '0 0 8px rgba(239, 68, 68, 0.8)',
            }}
            onMouseDown={(e) => handleMouseDown(e, 'playhead')}
          >
            {/* Playhead Top Triangle */}
            <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-8 border-l-transparent border-r-transparent border-b-red-500" />
            
            {/* Playhead Time Display */}
            {(isDragging === 'playhead' || isHovering === 'playhead') && (
              <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-red-500 text-white text-xs px-2 py-1 rounded whitespace-nowrap font-mono">
                {formatTime(currentTime)}
              </div>
            )}
          </div>

          {/* Hover Effects */}
          {isHovering === 'timeline' && (
            <div className="absolute inset-0 bg-blue-500/10 pointer-events-none transition-opacity duration-200" />
          )}
        </div>

        {/* Timeline Labels */}
        <div className="flex justify-between mt-2 text-xs text-gray-400">
          <span>Video Track {isPending && <span className="animate-pulse">⏳</span>}</span>
          <span className="font-mono">{formattedTimes.duration} total</span>
        </div>

        {/* Audio Track - Only show if video has audio */}
        {hasAudio && (
        <div className="mt-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-gray-400">Audio Track</span>
          </div>
          
          <ImageAudioWaveform
            waveformImagePath={waveformImagePath}
            waveformImageDimensions={waveformImageDimensions}
            keyPoints={waveformData || []}
            duration={duration}
            currentTime={displayCurrentTime}
            trimStart={displayTrimStart}
            trimEnd={displayTrimEnd}
            height={60}
            className="cursor-crosshair"
            color="#06b6d4"
            backgroundColor="#1f2937"
              hasAudio={hasAudio}
          />
        </div>
        )}
      </div>
    </div>
  )
}) 