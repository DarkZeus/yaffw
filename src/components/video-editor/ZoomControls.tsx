import { memo, useCallback } from 'react'
import { Button } from '../ui/button'

type ZoomControlsProps = {
  zoomLevel: number
  onZoomChange: (newZoom: number) => void
  minZoom?: number
  maxZoom?: number
  zoomStep?: number
}

export const ZoomControls = memo(function ZoomControls({
  zoomLevel,
  onZoomChange,
  minZoom = 1,
  maxZoom = 3,
  zoomStep = 1.5
}: ZoomControlsProps) {
  const handleZoomIn = useCallback(() => {
    const newZoomLevel = Math.min(maxZoom, zoomLevel * zoomStep)
    onZoomChange(newZoomLevel)
  }, [zoomLevel, maxZoom, zoomStep, onZoomChange])

  const handleZoomOut = useCallback(() => {
    const newZoomLevel = Math.max(minZoom, zoomLevel / zoomStep)
    onZoomChange(newZoomLevel)
  }, [zoomLevel, minZoom, zoomStep, onZoomChange])

  const handleZoomReset = useCallback(() => {
    onZoomChange(minZoom)
  }, [minZoom, onZoomChange])

  return (
    <div className="flex items-center justify-center gap-2">
      <Button
        onClick={handleZoomOut}
        disabled={zoomLevel <= minZoom}
      >
        Zoom Out
      </Button>
      <span className="text-gray-400 text-sm font-mono min-w-[60px] text-center">
        {zoomLevel.toFixed(1)}x
      </span>
      <Button
        onClick={handleZoomIn}
        disabled={zoomLevel >= maxZoom}
      >
        Zoom In
        </Button>
      {zoomLevel > minZoom && (
        <Button
          onClick={handleZoomReset}
        >
          Reset
        </Button>
      )}
    </div>
  )
})