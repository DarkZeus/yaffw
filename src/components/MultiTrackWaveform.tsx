import type ReactPlayer from 'react-player'
import { useMediabunnyAudioTracks } from '../hooks/useMediabunnyAudioTracks'
import { WaveformTimeline } from './WaveformTimeline'

type MultiTrackWaveformProps = {
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

export const MultiTrackWaveform = ({
  videoFile,
  hasAudio,
  duration,
  currentTime,
  trimStart,
  trimEnd,
  onSeek,
  onTrimChange,
  playerRef,
}: MultiTrackWaveformProps) => {
  const { audioTracks, isExtracting, error } = useMediabunnyAudioTracks(videoFile)

  // Show error state
  if (error) {
    return (
      <div className="relative w-full h-32 bg-gray-900 rounded-lg flex items-center justify-center">
        <div className="text-red-400 text-sm">
          Failed to extract audio tracks: {error}
        </div>
      </div>
    )
  }

  // Show loading state while extracting
  if (isExtracting) {
    return (
      <div className="relative w-full h-32 bg-gray-900 rounded-lg flex items-center justify-center">
        <div className="flex items-center gap-2 text-gray-400">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Extracting audio tracks...</span>
        </div>
      </div>
    )
  }

  // If multiple tracks detected, show each track's waveform
  if (audioTracks.length > 1) {
    return (
      <div className="space-y-4">
        {audioTracks.map((track) => (
          <div key={track.index} className="space-y-1">
            <div className="text-xs text-muted-foreground px-2 flex items-center gap-2">
              <span>{track.label}</span>
              {track.languageCode !== 'und' && (
                <span className="text-xs bg-gray-800 px-2 py-0.5 rounded">
                  {track.languageCode}
                </span>
              )}
            </div>
            <WaveformTimeline
              videoFile={track.audioBuffer}
              hasAudio={true}
              duration={duration}
              currentTime={currentTime}
              trimStart={trimStart}
              trimEnd={trimEnd}
              onSeek={onSeek}
              onTrimChange={onTrimChange}
              playerRef={playerRef}
            />
          </div>
        ))}
      </div>
    )
  }

  // Single track or no tracks - use default waveform
  return (
    <WaveformTimeline
      videoFile={videoFile}
      hasAudio={hasAudio}
      duration={duration}
      currentTime={currentTime}
      trimStart={trimStart}
      trimEnd={trimEnd}
      onSeek={onSeek}
      onTrimChange={onTrimChange}
      playerRef={playerRef}
    />
  )
}

