import { useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js'

type UseWavesurferOptions = {
  containerRef: React.RefObject<HTMLDivElement>
  timelineContainerRef: React.RefObject<HTMLDivElement>
  audioFile: File | null
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
  const trimRegionRef = useRef<any>(null)
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

    // Create Timeline plugin
    const timeline = TimelinePlugin.create({
      container: timelineContainerRef.current,
      height: 20,
      insertPosition: 'beforebegin',
      timeInterval: 1,
      primaryLabelInterval: 5,
      secondaryLabelInterval: 1,
      style: {
        fontSize: '10px',
        color: '#9ca3af',
      },
    })

    // Create Regions plugin
    const regions = RegionsPlugin.create()
    regionsPluginRef.current = regions

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor,
      progressColor,
      height,
      normalize: true,
      cursorWidth: 1,
      cursorColor: '#ef4444',
      interact: true,
      plugins: [regions, timeline],
    })

    wavesurferRef.current = ws

    // Setup event listeners
    ws.on('ready', () => {
      console.log('Wavesurfer ready!')
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
      console.log('Loading audio file into wavesurfer:', audioFile.name)
      // Wavesurfer can load directly from File/Blob and extract audio
      wavesurferRef.current.loadBlob(audioFile)
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

