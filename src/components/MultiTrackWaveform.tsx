import { Volume2, VolumeX } from 'lucide-react'
import type ReactPlayer from 'react-player'
import { useEffect, useRef, useState } from 'react'
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
  playbackSpeed: number
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
  playbackSpeed,
  audioTrackControlsRef
}: MultiTrackWaveformProps) => {
  const { audioTracks, isExtracting, error } = useMediabunnyAudioTracks(videoFile)
  const { trackControls, setTrackVolume, toggleMute, toggleSolo, toggleMono } = useSyncedAudioTracks({
    audioTracks,
    playerRef,
    isPlaying,
    currentTime,
    playbackSpeed
  })

  // Helper: Convert AudioBuffer to mono
  const convertBufferToMono = (buffer: AudioBuffer): AudioBuffer => {
    if (buffer.numberOfChannels === 1) return buffer
    
    const audioCtx = new AudioContext()
    const monoBuffer = audioCtx.createBuffer(1, buffer.length, buffer.sampleRate)
    const monoData = monoBuffer.getChannelData(0)
    
    // Average all channels
    for (let i = 0; i < buffer.length; i++) {
      let sum = 0
      for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        sum += buffer.getChannelData(ch)[i]
      }
      monoData[i] = sum / buffer.numberOfChannels
    }
    
    return monoBuffer
  }

  // Cache mono buffers to avoid re-conversion on every render
  const monoBuffersCache = useRef<Map<number, AudioBuffer>>(new Map())
  const [convertingTracks, setConvertingTracks] = useState<Set<number>>(new Set())
  
  const getBufferForWaveform = (trackIndex: number, buffer: AudioBuffer | null, isMono: boolean): AudioBuffer | null => {
    if (!buffer) return null
    if (!isMono) {
      // Clear cached mono if switching back to stereo
      monoBuffersCache.current.delete(trackIndex)
      return buffer
    }
    
    // Check cache first
    if (monoBuffersCache.current.has(trackIndex)) {
      return monoBuffersCache.current.get(trackIndex)!
    }
    
    // If not cached, return null and trigger async conversion
    return null
  }
  
  // Handle mono conversion asynchronously
  useEffect(() => {
    audioTracks.forEach(track => {
      const controls = trackControls.get(track.index)
      if (!controls?.mono || !track.audioBuffer) return
      
      // Skip if already cached or currently converting
      if (monoBuffersCache.current.has(track.index) || convertingTracks.has(track.index)) return
      
      // Start conversion
      setConvertingTracks(prev => new Set(prev).add(track.index))
      
      // Use setTimeout to make it async and allow UI to update
      setTimeout(() => {
        const monoBuffer = convertBufferToMono(track.audioBuffer!)
        monoBuffersCache.current.set(track.index, monoBuffer)
        
        setConvertingTracks(prev => {
          const next = new Set(prev)
          next.delete(track.index)
          return next
        })
      }, 0)
    })
  }, [audioTracks, trackControls])
  
  // Clear cache when audio tracks change
  useEffect(() => {
    monoBuffersCache.current.clear()
    setConvertingTracks(new Set())
  }, [audioTracks])

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
    // Check if any track is soloed
    const hasSolo = Array.from(trackControls.values()).some(ctrl => ctrl.solo)
    
    return (
      <div className="space-y-4">
        {audioTracks.map((track) => {
          const controls = trackControls.get(track.index) || { volume: 1, muted: false, solo: false, mono: false }
          
          // Calculate effective mute state (explicitly muted OR muted due to solo logic)
          const isEffectivelyMuted = controls.muted || (hasSolo && !controls.solo)
          
          // Check if this track is currently converting
          const isConverting = convertingTracks.has(track.index)
          
          return (
            <div key={track.index} className={`space-y-1 transition-opacity ${isConverting ? 'opacity-50' : 'opacity-100'}`}>
              <div className="flex items-center gap-3 px-2">
                <div className={`flex items-center gap-2 min-w-[150px] transition-opacity ${isEffectivelyMuted ? 'opacity-40' : 'opacity-100'}`}>
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
                    disabled={isConverting}
                    className={`h-7 w-7 p-0 ${isEffectivelyMuted ? 'text-red-500 hover:text-red-400' : 'hover:text-gray-300'}`}
                    title={controls.muted ? "Unmute" : "Mute"}
                  >
                    {isEffectivelyMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </Button>
                  
                  {/* Solo Button */}
                  <Button
                    variant={controls.solo ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleSolo(track.index)}
                    disabled={isConverting}
                    className="h-7 px-2 text-xs"
                    title={controls.solo ? "Unsolo" : "Solo"}
                  >
                    S
                  </Button>
                  
                  {/* Mono Checkbox */}
                  <div className="flex items-center gap-1.5">
                    <Checkbox
                      checked={controls.mono}
                      onCheckedChange={() => toggleMono(track.index)}
                      id={`mono-${track.index}`}
                      disabled={isConverting}
                    />
                    <label
                      htmlFor={`mono-${track.index}`}
                      className="text-xs text-muted-foreground cursor-pointer select-none flex items-center gap-1.5"
                      title={isConverting ? "Converting to mono..." : "Convert to mono"}
                    >
                      Mono
                      {isConverting && (
                        <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      )}
                    </label>
                  </div>
                  
                  {/* Volume Slider */}
                  <div className="w-24">
                    <Slider
                      value={[controls.volume * 100]}
                      onValueChange={([val]) => setTrackVolume(track.index, val / 100)}
                      max={100}
                      step={1}
                      disabled={isConverting}
                      className={isConverting ? 'pointer-events-none' : 'cursor-pointer'}
                    />
                  </div>
                  
                  <span className="text-xs text-muted-foreground w-8">
                    {Math.round(controls.volume * 100)}%
                  </span>
                </div>
              </div>
              
              <div className={`transition-opacity relative ${isEffectivelyMuted ? 'opacity-40' : 'opacity-100'}`}>
                {isConverting && (
                  <div className="absolute inset-0 z-10 bg-black/30 backdrop-blur-[1px] flex items-center justify-center">
                    <div className="flex items-center gap-2 text-sm text-blue-400">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span>Converting to mono...</span>
                    </div>
                  </div>
                )}
                <WaveformTimeline
                  videoFile={
                    // Show stereo while converting, mono when done, or stereo when mono is off
                    isConverting 
                      ? track.audioBuffer 
                      : getBufferForWaveform(track.index, track.audioBuffer, controls.mono) || track.audioBuffer
                  }
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

