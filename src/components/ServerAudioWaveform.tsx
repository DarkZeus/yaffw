import { useEffect, useRef } from 'react'

type WaveformPoint = {
  time: number
  amplitude: number
}

type ServerAudioWaveformProps = {
  waveformData: WaveformPoint[]
  duration: number
  currentTime: number
  trimStart: number
  trimEnd: number
  height?: number
  className?: string
  color?: string
  backgroundColor?: string
}

export function ServerAudioWaveform({
  waveformData,
  duration,
  currentTime,
  trimStart,
  trimEnd,
  height = 60,
  className = '',
  color = '#3b82f6',
  backgroundColor = '#1f2937'
}: ServerAudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Draw waveform on canvas
  const drawWaveform = () => {
    const canvas = canvasRef.current
    if (!canvas || waveformData.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Use display dimensions for calculations, not canvas buffer dimensions
    const rect = canvas.getBoundingClientRect()
    const displayWidth = rect.width
    const displayHeight = rect.height
    const centerY = displayHeight / 2

    // Clear canvas using actual canvas buffer size
    ctx.fillStyle = backgroundColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    if (duration === 0) return

    // Enable smooth rendering
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    // Draw waveform bars using display dimensions for positioning
    waveformData.forEach((point, index) => {
      const x = (point.time / duration) * displayWidth
      const maxBarHeight = centerY * 0.9 // Use 90% of available height from center
      const barHeight = Math.min(point.amplitude * centerY * 0.8, maxBarHeight) // Constrain bar height
      
      // Determine color based on trim selection
      const isInTrimRange = point.time >= trimStart && point.time <= trimEnd
      ctx.fillStyle = isInTrimRange ? color : `${color}40` // 40 is hex for 25% opacity
      
      // Calculate bar width with minimum of 0.5px for crisp rendering
      const barWidth = Math.max(0.5, displayWidth / waveformData.length * 0.8)
      const topY = Math.max(0, centerY - barHeight)
      const bottomY = Math.min(displayHeight, centerY + barHeight)
      
      // Draw upper half
      ctx.fillRect(x, topY, barWidth, centerY - topY)
      // Draw lower half  
      ctx.fillRect(x, centerY, barWidth, bottomY - centerY)
    })

    // Draw playhead with high precision
    if (duration > 0) {
      const playheadX = (currentTime / duration) * displayWidth
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(playheadX, 0)
      ctx.lineTo(playheadX, displayHeight)
      ctx.stroke()
    }

    // Draw trim markers with high precision
    if (duration > 0) {
      const trimStartX = (trimStart / duration) * displayWidth
      const trimEndX = (trimEnd / duration) * displayWidth

      // Trim start marker
      ctx.strokeStyle = '#10b981'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(trimStartX, 0)
      ctx.lineTo(trimStartX, displayHeight)
      ctx.stroke()

      // Trim end marker
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(trimEndX, 0)
      ctx.lineTo(trimEndX, displayHeight)
      ctx.stroke()
    }
  }

  // Redraw when dependencies change
  useEffect(() => {
    drawWaveform()
  }, [waveformData, currentTime, trimStart, trimEnd, duration, color, backgroundColor])

  // Handle canvas resize with proper high-DPI support
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleResize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      
      // Set the canvas buffer size to account for device pixel ratio
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      
      // Scale the drawing context so everything draws at the correct size
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.scale(dpr, dpr)
      }
      
      // Set the display size (CSS size) to the actual size we want
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      
      drawWaveform()
    }

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(canvas)
    handleResize() // Initial setup

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  return (
    <div className={`relative ${className}`} style={{ height }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full rounded-md"
        style={{ 
          width: '100%', 
          height: '100%',
          backgroundColor 
        }}
      />
      
      {/* Loading state */}
      {waveformData.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800 rounded-md">
          <div className="flex items-center space-x-2 text-gray-400">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Processing audio...</span>
          </div>
        </div>
      )}
    </div>
  )
} 