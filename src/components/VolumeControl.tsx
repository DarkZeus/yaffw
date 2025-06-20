import { Volume2, VolumeX } from 'lucide-react'
import { forwardRef, memo, useDeferredValue, useImperativeHandle, useState, useTransition } from 'react'
import { Button } from './ui/button'

type VolumeControlProps = {
  onVolumeChange: (volume: number, isMuted: boolean) => void
  className?: string
}

type VolumeControlRef = {
  updateState: (volume: number, isMuted: boolean) => void
}

export const VolumeControl = memo(forwardRef<VolumeControlRef, VolumeControlProps>(function VolumeControl({
  onVolumeChange,
  className = ''
}, ref) {
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  
  // React 19 performance optimizations
  const [isPending, startTransition] = useTransition()
  const deferredVolume = useDeferredValue(volume)
  const deferredIsMuted = useDeferredValue(isMuted)
  
  // Expose method to parent for external state updates
  useImperativeHandle(ref, () => ({
    updateState: (newVolume: number, newMuted: boolean) => {
      startTransition(() => {
        setVolume(newVolume)
        setIsMuted(newMuted)
      })
    }
  }), [])

  const handleToggleMute = () => {
    const newMuted = !isMuted
    startTransition(() => {
      setIsMuted(newMuted)
    })
    // Call parent immediately for responsive audio feedback
    onVolumeChange(volume, newMuted)
  }

  const handleVolumeSliderChange = (newVolume: number) => {
    const newMuted = newVolume === 0
    
    // Immediate parent callback for responsive audio
    onVolumeChange(newVolume, newMuted)
    
    // Deferred state updates for smooth UI
    startTransition(() => {
      setVolume(newVolume)
      setIsMuted(newMuted)
    })
  }

  return (
    <div className={`flex items-center gap-3 pointer-events-auto select-none ${className}`}>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggleMute}
        className="text-white hover:text-muted-foreground p-2 h-auto bg-black/50 hover:bg-black/70"
      >
        {deferredIsMuted || deferredVolume === 0 ? (
          <VolumeX className="h-4 w-4" />
        ) : (
          <Volume2 className="h-4 w-4" />
        )}
      </Button>
      
      {/* Volume Slider */}
      <div className="flex items-center gap-2 bg-black/50 rounded-md px-3 py-2 select-none">
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={isMuted ? 0 : volume} // Use immediate values for slider responsiveness
          onChange={(e) => {
            const newVolume = Number(e.target.value)
            handleVolumeSliderChange(newVolume)
          }}
          className="w-20 h-1 bg-muted rounded-lg appearance-none cursor-pointer"
        />
        <span className="text-white text-xs font-mono w-6 text-center select-none">
          {Math.round((deferredIsMuted ? 0 : deferredVolume) * 100)}
        </span>
      </div>
    </div>
  )
})) 