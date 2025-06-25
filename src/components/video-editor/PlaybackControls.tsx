import { Home, Pause, Play, SkipBack, SkipForward, Square } from 'lucide-react'

import type { VideoOperations, VideoState } from '../../types/video-editor-mediator.types'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'

type PlaybackControlsProps = {
  videoState: Pick<VideoState, 'isPlaying' | 'currentTime' | 'duration'>
  videoOps: VideoOperations
}

export const PlaybackControls = ({ videoState, videoOps }: PlaybackControlsProps) => {
  const { isPlaying, currentTime, duration } = videoState

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Play className="h-4 w-4" />
          Playback
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={videoOps.handlePlayPause}
                size="lg"
                className="h-16 w-16 rounded-full"
                variant={isPlaying ? "secondary" : "default"}
              >
                {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isPlaying ? 'Pause' : 'Play'} (Space)</p>
            </TooltipContent>
          </Tooltip>
          <Badge variant="secondary" className="mt-2">
            {isPlaying ? 'Playing' : 'Paused'}
          </Badge>
        </div>

        {/* Navigation Controls */}
        <div className="grid grid-cols-4 gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={() => videoOps.handleSeek(0)}>
                <Home className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Jump to start (Home)</p></TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={() => videoOps.handleSeek(Math.max(0, currentTime - 5))}>
                <SkipBack className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Seek backward (←)</p></TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={() => videoOps.handleSeek(Math.min(duration, currentTime + 5))}>
                <SkipForward className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Seek forward (→)</p></TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={() => videoOps.handleSeek(duration)}>
                <Square className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Jump to end (End)</p></TooltipContent>
          </Tooltip>
        </div>
      </CardContent>
    </Card>
  )
} 