import { memo, useMemo, useState } from 'react'

type WaveformPoint = {
  time: number
  amplitude: number
}

type ImageAudioWaveformProps = {
  waveformImagePath?: string
  waveformImageDimensions?: { width: number; height: number }
  keyPoints?: WaveformPoint[] // For precise positioning when needed
  duration: number
  currentTime: number
  trimStart: number
  trimEnd: number
  height?: number
  className?: string
  color?: string
  backgroundColor?: string
  hasAudio?: boolean // Whether the video actually contains audio
}

export const ImageAudioWaveform = memo(function ImageAudioWaveform({
  waveformImagePath,
  waveformImageDimensions,
  keyPoints = [],
  duration,
  currentTime,
  trimStart,
  trimEnd,
  height = 60,
  className = '',
  color = '#06b6d4',
  backgroundColor = '#1f2937',
  hasAudio = true
}: ImageAudioWaveformProps) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  
  // Calculate overlay positions as percentages
  const overlayPositions = useMemo(() => {
    if (duration === 0) return { playhead: 0, trimStart: 0, trimEnd: 100 }
    
    return {
      playhead: (currentTime / duration) * 100,
      trimStart: (trimStart / duration) * 100,
      trimEnd: (trimEnd / duration) * 100
    }
  }, [currentTime, trimStart, trimEnd, duration])

  // Generate waveform image URL
  const imageUrl = useMemo(() => {
    if (!waveformImagePath) return null
    
    // Extract just the filename from the full path - handle both Windows (\) and Unix (/) paths
    const filename = waveformImagePath.split(/[/\\]/).pop() || waveformImagePath
    const url = `http://localhost:3001/api/waveform/${filename}`
    
    console.log('🎵 Waveform URL generation:', {
      originalPath: waveformImagePath,
      extractedFilename: filename,
      generatedURL: url
    })
    
    return url
  }, [waveformImagePath])

  // Reset loading state when image URL changes
  const handleImageLoad = () => {
    setImageLoaded(true)
    setImageError(false)
  }

  const handleImageError = () => {
    setImageLoaded(false)
    setImageError(true)
  }

  // Don't render anything if the video has no audio
  if (!hasAudio) {
    return null
  }

  return (
    <div className={`relative ${className}`} style={{ height }}>
      {/* Waveform Image or Fallback */}
      {imageUrl ? (
        <img
          src={imageUrl}
          alt="Audio waveform"
          className="w-full h-full object-cover rounded-md"
          style={{ backgroundColor }}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      ) : (
        /* Fallback - simple bars using keyPoints */
        <div 
          className="w-full h-full rounded-md flex items-end gap-px overflow-hidden"
          style={{ backgroundColor }}
        >
          {keyPoints.length > 0 ? (
            keyPoints.map((point, index) => {
              const isInTrimRange = point.time >= trimStart && point.time <= trimEnd
              const barHeight = Math.max(2, point.amplitude * height * 0.8)
              
              return (
                <div
                  key={`${point.time}-${point.amplitude}`}
                  className="flex-1 rounded-sm"
                  style={{
                    height: `${barHeight}px`,
                    backgroundColor: isInTrimRange ? color : `${color}40`,
                    minWidth: '1px'
                  }}
                />
              )
            })
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
              Processing audio...
            </div>
          )}
        </div>
      )}
      
      {/* Interactive Overlays */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Trim Selection Overlay */}
        <div 
          className="absolute top-0 bottom-0 bg-emerald-500/20 border-l-2 border-r-2 border-emerald-500"
          style={{
            left: `${overlayPositions.trimStart}%`,
            width: `${overlayPositions.trimEnd - overlayPositions.trimStart}%`
          }}
        />
        
        {/* Trim Start Marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-emerald-500"
          style={{ left: `${overlayPositions.trimStart}%` }}
        />
        
        {/* Trim End Marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-amber-500"
          style={{ left: `${overlayPositions.trimEnd}%` }}
        />
        
        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
          style={{ 
            left: `${overlayPositions.playhead}%`,
            boxShadow: '0 0 8px rgba(239, 68, 68, 0.8)'
          }}
        />
      </div>

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
    </div>
  )
}) 