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
}

export const useSyncedAudioTracks = ({
  audioTracks,
  playerRef,
  isPlaying,
  currentTime
}: UseSyncedAudioTracksProps) => {
  const audioElementsRef = useRef<(HTMLAudioElement | null)[]>([])
  const [trackControls, setTrackControls] = useState<Map<number, AudioTrackControls>>(new Map())
  const lastSeekTimeRef = useRef<number>(currentTime)

  // Initialize audio elements and controls
  useEffect(() => {
    audioElementsRef.current = audioTracks.map((track, idx) => {
      if (!track.audioBlob) return null
      
      const audio = new Audio()
      audio.src = URL.createObjectURL(track.audioBlob)
      audio.preload = 'auto'
      
      // Apply existing controls or defaults
      const controls = trackControls.get(track.index) || { volume: 1, muted: false, solo: false, mono: false }
      audio.volume = controls.volume
      audio.muted = controls.muted
      
      return audio
    })

    // Initialize controls for new tracks
    const newControls = new Map(trackControls)
    audioTracks.forEach(track => {
      if (!newControls.has(track.index)) {
        newControls.set(track.index, { volume: 1, muted: false, solo: false, mono: false })
      }
    })
    setTrackControls(newControls)

    return () => {
      audioElementsRef.current.forEach(audio => {
        if (audio) {
          audio.pause()
          URL.revokeObjectURL(audio.src)
        }
      })
      audioElementsRef.current = []
    }
  }, [audioTracks])

  // Sync play/pause
  useEffect(() => {
    audioElementsRef.current.forEach(audio => {
      if (!audio) return
      
      if (isPlaying) {
        audio.play().catch(err => console.warn('Audio play failed:', err))
      } else {
        audio.pause()
      }
    })
  }, [isPlaying])

  // Sync seek (with threshold to avoid excessive seeks)
  useEffect(() => {
    const timeDiff = Math.abs(currentTime - lastSeekTimeRef.current)
    
    // Only seek if diff > 0.1s to avoid micro-adjustments
    if (timeDiff > 0.1) {
      audioElementsRef.current.forEach(audio => {
        if (audio) {
          audio.currentTime = currentTime
        }
      })
      lastSeekTimeRef.current = currentTime
    }
  }, [currentTime])

  // Update volume/mute/solo
  useEffect(() => {
    const hasSolo = Array.from(trackControls.values()).some(ctrl => ctrl.solo)
    
    audioElementsRef.current.forEach((audio, idx) => {
      if (!audio) return
      
      const trackIndex = audioTracks[idx]?.index
      if (trackIndex === undefined) return
      
      const controls = trackControls.get(trackIndex)
      if (!controls) return

      // If any track is solo'd, mute non-solo tracks
      if (hasSolo) {
        audio.muted = !controls.solo || controls.muted
      } else {
        audio.muted = controls.muted
      }
      
      audio.volume = controls.volume
    })
  }, [trackControls, audioTracks])

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

