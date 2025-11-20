import { Volume2, VolumeX } from 'lucide-react'
import type ReactPlayer from 'react-player'
import { useEffect } from 'react'
import { useMediabunnyAudioTracks } from '../hooks/useMediabunnyAudioTracks'
import { useSyncedAudioTracks } from '../hooks/useSyncedAudioTracks'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import { Slider } from './ui/slider'
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
  isPlaying: boolean
  audioTrackControlsRef?: React.RefObject<Map<number, { volume: number; muted: boolean; solo: boolean; mono: boolean }>>
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
  isPlaying,
  audioTrackControlsRef
}: MultiTrackWaveformProps) => {
  const { audioTracks, isExtracting, error } = useMediabunnyAudioTracks(videoFile)
  const { trackControls, setTrackVolume, toggleMute, toggleSolo, toggleMono } = useSyncedAudioTracks({
    audioTracks,
    playerRef,
    isPlaying,
    currentTime
  })

  // Update ref whenever controls change so export can access them
  useEffect(() => {
    if (audioTrackControlsRef?.current) {
      audioTrackControlsRef.current = new Map(trackControls)
    }
  }, [trackControls, audioTrackControlsRef])

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

  // If multiple tracks detected, show each track's waveform with controls
  if (audioTracks.length > 1) {
    return (
      <div className="space-y-4">
        {audioTracks.map((track) => {
          const controls = trackControls.get(track.index) || { volume: 1, muted: false, solo: false, mono: false }
          
          return (
            <div key={track.index} className="space-y-1">
              <div className="flex items-center gap-3 px-2">
                <div className="flex items-center gap-2 min-w-[150px]">
                  <span className="text-xs text-muted-foreground">{track.label}</span>
                  {track.languageCode !== 'und' && (
                    <span className="text-xs bg-gray-800 px-2 py-0.5 rounded">
                      {track.languageCode}
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  {/* Mute Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleMute(track.index)}
                    className={`h-7 w-7 p-0 ${controls.muted ? 'text-red-400' : ''}`}
                    title="Mute"
                  >
                    {controls.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </Button>
                  
                  {/* Solo Button */}
                  <Button
                    variant={controls.solo ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleSolo(track.index)}
                    className="h-7 px-2 text-xs"
                    title="Solo"
                  >
                    S
                  </Button>
                  
                  {/* Mono Checkbox */}
                  <div className="flex items-center gap-1.5">
                    <Checkbox
                      checked={controls.mono}
                      onCheckedChange={() => toggleMono(track.index)}
                      id={`mono-${track.index}`}
                    />
                    <label
                      htmlFor={`mono-${track.index}`}
                      className="text-xs text-muted-foreground cursor-pointer select-none"
                      title="Convert to mono"
                    >
                      Mono
                    </label>
                  </div>
                  
                  {/* Volume Slider */}
                  <div className="w-24">
                    <Slider
                      value={[controls.volume * 100]}
                      onValueChange={([val]) => setTrackVolume(track.index, val / 100)}
                      max={100}
                      step={1}
                      className="cursor-pointer"
                    />
                  </div>
                  
                  <span className="text-xs text-muted-foreground w-8">
                    {Math.round(controls.volume * 100)}%
                  </span>
                </div>
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
          )
        })}
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

