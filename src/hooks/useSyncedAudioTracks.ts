import type ReactPlayer from 'react-player'
import { useEffect, useRef, useState } from 'react'
import type { AudioTrackInfo } from './useMediabunnyAudioTracks'

export type AudioTrackControls = {
  volume: number
  muted: boolean
  solo: boolean
  mono: boolean
}

type UseSyncedAudioTracksProps = {
  audioTracks: AudioTrackInfo[]
  playerRef: React.RefObject<ReactPlayer | null>
  isPlaying: boolean
  currentTime: number
  playbackSpeed: number
}

type TrackPlaybackState = {
  stereoBuffer: AudioBuffer
  monoBuffer?: AudioBuffer
  source: AudioBufferSourceNode | null
  gainNode: GainNode
  startTime: number // when playback started
  startOffset: number // offset into the buffer
}

export const useSyncedAudioTracks = ({
  audioTracks,
  playerRef,
  isPlaying,
  currentTime,
  playbackSpeed
}: UseSyncedAudioTracksProps) => {
  const audioContextRef = useRef<AudioContext | null>(null)
  const playbackStatesRef = useRef<Map<number, TrackPlaybackState>>(new Map())
  const [trackControls, setTrackControls] = useState<Map<number, AudioTrackControls>>(new Map())
  const lastSeekTimeRef = useRef<number>(currentTime)
  const isPlayingRef = useRef(isPlaying)
  const playbackSpeedRef = useRef(playbackSpeed)

  // Helper: Convert AudioBuffer to mono
  const convertToMono = (buffer: AudioBuffer): AudioBuffer => {
    if (buffer.numberOfChannels === 1) return buffer
    
    const ctx = audioContextRef.current || new AudioContext()
    const monoBuffer = ctx.createBuffer(1, buffer.length, buffer.sampleRate)
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

  // Initialize audio context and playback states
  useEffect(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext()
    }
    
    const ctx = audioContextRef.current
    const newStates = new Map<number, TrackPlaybackState>()
    
    // Create playback state for each track
    audioTracks.forEach(track => {
      if (!track.audioBuffer) return
      
      const gainNode = ctx.createGain()
      gainNode.connect(ctx.destination)
      
      newStates.set(track.index, {
        stereoBuffer: track.audioBuffer,
        monoBuffer: undefined,
        source: null,
        gainNode,
        startTime: 0,
        startOffset: 0
      })
    })
    
    playbackStatesRef.current = newStates
    
    // Initialize controls
    const newControls = new Map(trackControls)
    audioTracks.forEach(track => {
      if (!newControls.has(track.index)) {
        newControls.set(track.index, { volume: 1, muted: false, solo: false, mono: false })
      }
    })
    setTrackControls(newControls)
    
    return () => {
      // Stop all sources
      playbackStatesRef.current.forEach(state => {
        if (state.source) {
          state.source.stop()
          state.source.disconnect()
        }
      })
      playbackStatesRef.current.clear()
    }
  }, [audioTracks])

  // Helper: Start playback for a track
  const startTrackPlayback = (trackIndex: number, offset: number) => {
    const state = playbackStatesRef.current.get(trackIndex)
    const controls = trackControls.get(trackIndex)
    if (!state || !audioContextRef.current) return
    
    // Stop existing source
    if (state.source) {
      state.source.stop()
      state.source.disconnect()
    }
    
    // Determine which buffer to use
    const controls_current = controls || { volume: 1, muted: false, solo: false, mono: false }
    let bufferToPlay = state.stereoBuffer
    
    if (controls_current.mono) {
      // Create mono buffer if not cached
      if (!state.monoBuffer) {
        state.monoBuffer = convertToMono(state.stereoBuffer)
      }
      bufferToPlay = state.monoBuffer
    }
    
    // Create new source
    const source = audioContextRef.current.createBufferSource()
    source.buffer = bufferToPlay
    source.playbackRate.value = playbackSpeedRef.current
    source.connect(state.gainNode)
    
    // Start playback from offset
    const when = audioContextRef.current.currentTime
    source.start(when, offset)
    
    state.source = source
    state.startTime = when
    state.startOffset = offset
  }
  
  // Helper: Stop playback for a track
  const stopTrackPlayback = (trackIndex: number) => {
    const state = playbackStatesRef.current.get(trackIndex)
    if (!state || !state.source) return
    
    state.source.stop()
    state.source.disconnect()
    state.source = null
  }

  // Sync play/pause
  useEffect(() => {
    isPlayingRef.current = isPlaying
    
    if (isPlaying) {
      // Start all tracks
      playbackStatesRef.current.forEach((state, trackIndex) => {
        startTrackPlayback(trackIndex, currentTime)
      })
    } else {
      // Stop all tracks
      playbackStatesRef.current.forEach((state, trackIndex) => {
        stopTrackPlayback(trackIndex)
      })
    }
  }, [isPlaying])

  // Sync seek
  useEffect(() => {
    const timeDiff = Math.abs(currentTime - lastSeekTimeRef.current)
    
    // Only seek if diff > 0.1s to avoid micro-adjustments
    if (timeDiff > 0.1) {
      lastSeekTimeRef.current = currentTime
      
      // Restart playback from new position if playing
      if (isPlayingRef.current) {
        playbackStatesRef.current.forEach((state, trackIndex) => {
          stopTrackPlayback(trackIndex)
          startTrackPlayback(trackIndex, currentTime)
        })
      }
    }
  }, [currentTime])

  // Update volume/mute/solo/mono
  useEffect(() => {
    const hasSolo = Array.from(trackControls.values()).some(ctrl => ctrl.solo)
    
    playbackStatesRef.current.forEach((state, trackIndex) => {
      const controls = trackControls.get(trackIndex)
      if (!controls) return

      // Calculate effective gain
      let effectiveGain = controls.volume
      
      // Apply mute/solo logic
      if (hasSolo) {
        if (!controls.solo || controls.muted) {
          effectiveGain = 0
        }
      } else if (controls.muted) {
        effectiveGain = 0
      }
      
      state.gainNode.gain.value = effectiveGain
    })
  }, [trackControls])
  
  // Handle mono toggle - restart playback with correct buffer
  const prevControlsRef = useRef(trackControls)
  useEffect(() => {
    const prev = prevControlsRef.current
    prevControlsRef.current = trackControls
    
    // Check if any mono state changed
    playbackStatesRef.current.forEach((state, trackIndex) => {
      const oldControls = prev.get(trackIndex)
      const newControls = trackControls.get(trackIndex)
      
      if (oldControls?.mono !== newControls?.mono && isPlayingRef.current && audioContextRef.current) {
        // Calculate current playback position
        const elapsed = audioContextRef.current.currentTime - state.startTime
        const currentOffset = state.startOffset + elapsed * playbackSpeedRef.current
        
        // Restart with new buffer
        stopTrackPlayback(trackIndex)
        startTrackPlayback(trackIndex, currentOffset)
      }
    })
  }, [trackControls])

  // Handle playback speed changes
  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed
    
    // If playing, restart all tracks with new playback rate
    if (isPlayingRef.current && audioContextRef.current) {
      playbackStatesRef.current.forEach((state, trackIndex) => {
        if (state.source) {
          // Calculate current position accounting for old playback rate
          const elapsed = audioContextRef.current!.currentTime - state.startTime
          const currentOffset = state.startOffset + elapsed * state.source.playbackRate.value
          
          // Restart with new rate
          stopTrackPlayback(trackIndex)
          startTrackPlayback(trackIndex, currentOffset)
        }
      })
    }
  }, [playbackSpeed])

  const setTrackVolume = (trackIndex: number, volume: number) => {
    setTrackControls(prev => {
      const next = new Map(prev)
      const ctrl = next.get(trackIndex) || { volume: 1, muted: false, solo: false, mono: false }
      next.set(trackIndex, { ...ctrl, volume: Math.max(0, Math.min(1, volume)) })
      return next
    })
  }

  const toggleMute = (trackIndex: number) => {
    setTrackControls(prev => {
      const next = new Map(prev)
      const ctrl = next.get(trackIndex) || { volume: 1, muted: false, solo: false, mono: false }
      next.set(trackIndex, { ...ctrl, muted: !ctrl.muted })
      return next
    })
  }

  const toggleSolo = (trackIndex: number) => {
    setTrackControls(prev => {
      const next = new Map(prev)
      const ctrl = next.get(trackIndex) || { volume: 1, muted: false, solo: false, mono: false }
      next.set(trackIndex, { ...ctrl, solo: !ctrl.solo })
      return next
    })
  }

  const toggleMono = (trackIndex: number) => {
    setTrackControls(prev => {
      const next = new Map(prev)
      const ctrl = next.get(trackIndex) || { volume: 1, muted: false, solo: false, mono: false }
      next.set(trackIndex, { ...ctrl, mono: !ctrl.mono })
      return next
    })
  }

  return {
    trackControls,
    setTrackVolume,
    toggleMute,
    toggleSolo,
    toggleMono
  }
}

