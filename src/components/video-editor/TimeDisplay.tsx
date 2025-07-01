import { formatTime } from '../../utils/video-player'

type TimeDisplayProps = {
  currentTime: number
  duration: number
}

export const TimeDisplay = ({ currentTime, duration }: TimeDisplayProps) => {
  const formattedCurrentTime = formatTime(currentTime)
  const formattedDuration = formatTime(duration)

  return (
    <div className="text-sm text-muted-foreground font-mono">
      {formattedCurrentTime} / {formattedDuration}
    </div>
  )
} 