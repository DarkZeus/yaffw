import { PLAYBACK_SPEEDS } from '../../constants/video-player.constants'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'

type SpeedControlProps = {
  currentSpeed: number
  onSpeedChange: (speed: number) => void
}

export const SpeedControl = ({ currentSpeed, onSpeedChange }: SpeedControlProps) => {
  const handleValueChange = (value: string) => {
    const speed = Number.parseFloat(value)
    onSpeedChange(speed)
  }

  return (
    <Select value={currentSpeed.toString()} onValueChange={handleValueChange}>
      <SelectTrigger className="w-20">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PLAYBACK_SPEEDS.map((speed) => (
          <SelectItem key={speed.value} value={speed.value.toString()}>
            {speed.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
} 