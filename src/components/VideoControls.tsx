import { Pause, Play } from 'lucide-react'
import { memo, useDeferredValue, useTransition } from 'react'
import { Button } from './ui/button'
import { Progress } from './ui/progress'

interface VideoControlsProps {
  isPlaying: boolean
  currentTime: number
  duration: number
  onPlayPause: () => void
}

export const VideoControls = memo(function VideoControls({ 
  isPlaying, 
  currentTime, 
  duration, 
  onPlayPause 
}: VideoControlsProps) {
  const [isPending] = useTransition()
  const deferredCurrentTime = useDeferredValue(currentTime)
  
  const progressPercentage = duration > 0 ? (deferredCurrentTime / duration) * 100 : 0
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex items-center justify-center gap-4">
      <Button
        onClick={onPlayPause}
        variant="outline"
        size="sm"
        className="transition-all duration-200"
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      
      <div className="flex-1 max-w-md">
        <Progress 
          value={progressPercentage} 
          className="w-full transition-all duration-300" 
        />
      </div>
      
      <span className="text-sm text-gray-500 min-w-[100px] font-mono">
        {formatTime(deferredCurrentTime)} / {formatTime(duration)}
        {isPending && <span className="ml-1 animate-pulse">⏳</span>}
      </span>
    </div>
  )
}) 