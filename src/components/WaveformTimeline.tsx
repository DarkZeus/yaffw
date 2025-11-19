import { useEffect, useRef } from 'react'
import type ReactPlayer from 'react-player'
import { useWavesurfer } from '../hooks/useWavesurfer'

type WaveformTimelineProps = {
  videoFile: File | null
  hasAudio: boolean
  duration: number
  currentTime: number
  trimStart: number
  trimEnd: number
  onSeek: (time: number) => void
  onTrimChange: (start: number, end: number) => void
  playerRef: React.RefObject<ReactPlayer | null>
}

export const WaveformTimeline = ({
  videoFile,
  hasAudio,
  duration,
  currentTime,
  trimStart,
  trimEnd,
  onSeek,
  onTrimChange,
}: WaveformTimelineProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const timelineContainerRef = useRef<HTMLDivElement>(null)

  const { wavesurfer, isReady } = useWavesurfer({
    containerRef,
    timelineContainerRef,
    audioFile: hasAudio ? videoFile : null,
    trimStart,
    trimEnd,
    onSeek,
    onTrimChange,
    waveColor: '#6366f1',
    progressColor: '#06b6d4',
    height: 100,
  })

  // Sync wavesurfer playhead with video currentTime
  useEffect(() => {
    if (!wavesurfer || !isReady) return
    wavesurfer.setTime(currentTime)
  }, [wavesurfer, isReady, currentTime])

  return (
    <div className="relative w-full space-y-2">
      {/* Timeline (time markers) */}
      <div ref={timelineContainerRef} className="h-5" />

      {/* Waveform Container */}
      <div 
        ref={containerRef}
        className="relative w-full h-24 bg-gray-900 rounded-lg overflow-hidden"
      />

      {/* Loading State */}
      {!isReady && videoFile && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900/90 rounded-lg">
          <div className="flex items-center gap-2 text-gray-400">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Loading waveform...</span>
          </div>
        </div>
      )}

      {/* No Audio State */}
      {!hasAudio && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 rounded-lg">
          <span className="text-gray-500 text-sm">No audio track</span>
        </div>
      )}
    </div>
  )
}

