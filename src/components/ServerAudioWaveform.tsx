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

    const { width, height: canvasHeight } = canvas
    const centerY = canvasHeight / 2

    // Clear canvas
    ctx.fillStyle = backgroundColor
    ctx.fillRect(0, 0, width, canvasHeight)

    if (duration === 0) return

    // Draw waveform bars
    waveformData.forEach((point, index) => {
      const x = (point.time / duration) * width
      const barHeight = point.amplitude * centerY * 0.8 // Scale to 80% of available height
      
      // Determine color based on trim selection
      const isInTrimRange = point.time >= trimStart && point.time <= trimEnd
      ctx.fillStyle = isInTrimRange ? color : `${color}40` // 40 is hex for 25% opacity
      
      // Draw symmetric waveform (top and bottom)
      const barWidth = Math.max(1, width / waveformData.length)
      ctx.fillRect(x, centerY - barHeight, barWidth, barHeight * 2)
    })

    // Draw playhead
    if (duration > 0) {
      const playheadX = (currentTime / duration) * width
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(playheadX, 0)
      ctx.lineTo(playheadX, canvasHeight)
      ctx.stroke()
    }

    // Draw trim markers
    if (duration > 0) {
      const trimStartX = (trimStart / duration) * width
      const trimEndX = (trimEnd / duration) * width

      // Trim start marker
      ctx.strokeStyle = '#10b981'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(trimStartX, 0)
      ctx.lineTo(trimStartX, canvasHeight)
      ctx.stroke()

      // Trim end marker
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(trimEndX, 0)
      ctx.lineTo(trimEndX, canvasHeight)
      ctx.stroke()
    }
  }

  // Redraw when dependencies change
  useEffect(() => {
    drawWaveform()
  }, [waveformData, currentTime, trimStart, trimEnd, duration, color, backgroundColor])

  // Handle canvas resize
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleResize = () => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * window.devicePixelRatio
      canvas.height = rect.height * window.devicePixelRatio
      
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
      }
      
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