import { Maximize2, Minimize2, Pause, Play } from 'lucide-react'

import { VIDEO_PLAYER_CLASSES } from '../../constants/video-player.constants'
import type { VideoOperations } from '../../types/video-editor-mediator.types'
import { Button } from '../ui/button'
import { SpeedControl } from './SpeedControl'
import { TimeDisplay } from './TimeDisplay'

type VideoControlBarProps = {
  isPlaying: boolean
  isFullscreen: boolean
  currentTime: number
  duration: number
  playbackSpeed: number
  videoOps: VideoOperations
}

export const VideoControlBar = ({
  isPlaying,
  isFullscreen,
  currentTime,
  duration,
  playbackSpeed,
  videoOps
}: VideoControlBarProps) => {
  return (
    <div className={VIDEO_PLAYER_CLASSES.CONTROL_BAR}>
      <div className={VIDEO_PLAYER_CLASSES.CONTROL_BAR_LEFT}>
        {/* Play/Pause Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={videoOps.handlePlayPause}
          className="h-8 w-8 p-0"
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>

        {/* Time Display */}
        <TimeDisplay currentTime={currentTime} duration={duration} />
      </div>

      <div className={VIDEO_PLAYER_CLASSES.CONTROL_BAR_RIGHT}>
        {/* Speed Control */}
        <SpeedControl
          currentSpeed={playbackSpeed}
          onSpeedChange={videoOps.handlePlaybackSpeedChange}
        />

        {/* Fullscreen Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={videoOps.handleToggleFullscreen}
          className="h-8 w-8 p-0"
        >
          {isFullscreen ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  )
} 