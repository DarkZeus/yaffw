import { useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin, { type Region } from 'wavesurfer.js/dist/plugins/regions.esm.js'

type UseWavesurferOptions = {
  containerRef: React.RefObject<HTMLDivElement>
  timelineContainerRef: React.RefObject<HTMLDivElement>
  audioFile: File | Blob | AudioBuffer | null
  trimStart: number
  trimEnd: number
  onReady?: () => void
  onSeek?: (time: number) => void
  onTrimChange?: (start: number, end: number) => void
  waveColor?: string
  progressColor?: string
  height?: number
}

/**
 * Hook for managing wavesurfer.js lifecycle with Regions and Timeline plugins
 * Handles initialization, destruction, and audio file loading
 */
export const useWavesurfer = ({
  containerRef,
  timelineContainerRef,
  audioFile,
  trimStart,
  trimEnd,
  onReady,
  onSeek,
  onTrimChange,
  waveColor = '#4F4A85',
  progressColor = '#383351',
  height = 120,
}: UseWavesurferOptions) => {
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const regionsPluginRef = useRef<RegionsPlugin | null>(null)
  const trimRegionRef = useRef<Region | null>(null)
  const [isReady, setIsReady] = useState(false)
  const onReadyRef = useRef(onReady)
  const onSeekRef = useRef(onSeek)
  const onTrimChangeRef = useRef(onTrimChange)

  // Keep callback refs up to date
  useEffect(() => {
    onReadyRef.current = onReady
    onSeekRef.current = onSeek
    onTrimChangeRef.current = onTrimChange
  }, [onReady, onSeek, onTrimChange])

  // Initialize wavesurfer instance once with plugins
  useEffect(() => {
    if (!containerRef.current || !timelineContainerRef.current) return
    // Create Regions plugin
    const regions = RegionsPlugin.create()
    regionsPluginRef.current = regions

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor,
      progressColor,
      height,
      cursorWidth: 1,
      cursorColor: '#ef4444',
      interact: true,
      dragToSeek: true,
      plugins: [regions],
    })

    wavesurferRef.current = ws

    // Setup event listeners
    ws.on('ready', () => {
      setIsReady(true)
      onReadyRef.current?.()
    })

    ws.on('interaction', (time) => {
      onSeekRef.current?.(time)
    })

    ws.on('error', (error) => {
      console.error('Wavesurfer error:', error)
    })

    // Handle region updates
    regions.on('region-updated', (region) => {
      if (region.id === 'trim-region') {
        onTrimChangeRef.current?.(region.start, region.end)
      }
    })

    // Cleanup on unmount
    return () => {
      ws.destroy()
      wavesurferRef.current = null
      regionsPluginRef.current = null
      trimRegionRef.current = null
      setIsReady(false)
    }
  }, [containerRef, timelineContainerRef, waveColor, progressColor, height])

  // Load audio file when available - wavesurfer extracts audio automatically
  useEffect(() => {
    if (!wavesurferRef.current || !audioFile) {
      setIsReady(false)
      return
    }

    setIsReady(false) // Reset ready state while loading
    
    try {
      if (audioFile instanceof AudioBuffer) {
        // Convert AudioBuffer to WAV Blob
        const blob = audioBufferToWavBlob(audioFile)
        wavesurferRef.current.loadBlob(blob)
      } else {
        // Wavesurfer can load directly from File/Blob and extract audio
        wavesurferRef.current.loadBlob(audioFile)
      }
    } catch (error) {
      console.error('Failed to load audio file into wavesurfer:', error)
    }
  }, [audioFile])

  // Create/update trim region when trim values or ready state change
  useEffect(() => {
    if (!regionsPluginRef.current || !isReady || !wavesurferRef.current) return

    const duration = wavesurferRef.current.getDuration()
    if (!duration) return

    // Remove existing trim region if it exists
    if (trimRegionRef.current) {
      trimRegionRef.current.remove()
    }

    // Create new trim region
    trimRegionRef.current = regionsPluginRef.current.addRegion({
      id: 'trim-region',
      start: trimStart,
      end: trimEnd,
      color: 'rgba(16, 185, 129, 0.2)',
      drag: true,
      resize: true,
    })
  }, [isReady, trimStart, trimEnd])

  return {
    wavesurfer: wavesurferRef.current,
    isReady,
  }
}

/**
 * Convert AudioBuffer to WAV Blob for WaveSurfer
 */
function audioBufferToWavBlob(audioBuffer: AudioBuffer): Blob {
  const numberOfChannels = audioBuffer.numberOfChannels
  const sampleRate = audioBuffer.sampleRate
  const length = audioBuffer.length * numberOfChannels * 2
  const buffer = new ArrayBuffer(44 + length)
  const view = new DataView(buffer)
  
  // Write WAV header
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + length, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, numberOfChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numberOfChannels * 2, true) // byte rate
  view.setUint16(32, numberOfChannels * 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeString(view, 36, 'data')
  view.setUint32(40, length, true)
  
  // Write interleaved audio data
  const channels: Float32Array[] = []
  for (let i = 0; i < numberOfChannels; i++) {
    channels.push(audioBuffer.getChannelData(i))
  }
  
  let offset = 44
  for (let i = 0; i < audioBuffer.length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true)
      offset += 2
    }
  }
  
  return new Blob([buffer], { type: 'audio/wav' })
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}

