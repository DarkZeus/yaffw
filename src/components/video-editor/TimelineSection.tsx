import type { TrimOperations, TrimState, VideoOperations, VideoState } from '../../types/video-editor-mediator.types'
import type { LocalVideoFile } from '../../utils/localFileProcessor'
import { VideoTimeline } from '../VideoTimeline'
import { Badge } from '../ui/badge'
import { ScrollArea } from '../ui/scroll-area'

type TimelineSectionProps = {
  videoState: Pick<VideoState, 'currentTime' | 'duration'>
  trimState: TrimState
  currentVideo: LocalVideoFile
  deferredCurrentTime: number
  videoOps: VideoOperations
  trimOps: TrimOperations
}

export const TimelineSection = ({ 
  videoState, 
  trimState, 
  currentVideo, 
  deferredCurrentTime, 
  videoOps, 
  trimOps 
}: TimelineSectionProps) => {
  const { currentTime, duration } = videoState
  const { trimStart, trimEnd } = trimState

  return (
    <ScrollArea className="h-full">
      <div className="h-full border-t bg-card">
        {/* Status Bar */}
        <div className="px-6 pt-4 pb-2 border-b border-border/50">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Time:</span>
                <Badge variant="outline" className="font-mono">
                  {Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60).toString().padStart(2, '0')} / {Math.floor(duration / 60)}:{Math.floor(duration % 60).toString().padStart(2, '0')}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Trim Duration:</span>
                <Badge variant="outline" className="font-mono">
                  {(trimEnd - trimStart).toFixed(1)}s
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Coverage:</span>
              <Badge variant="secondary" className="font-mono">
                {Math.round(((trimEnd - trimStart) / duration) * 100) || 0}%
              </Badge>
            </div>
          </div>
        </div>

        <div className="p-6">
          <VideoTimeline
            duration={duration}
            currentTime={deferredCurrentTime}
            trimStart={trimStart}
            trimEnd={trimEnd}
            onTrimChange={trimOps.handleTrimChange}
            onSeek={videoOps.handleSeek}
            waveformData={currentVideo?.waveformData || []}
            waveformImagePath={currentVideo?.waveformImagePath}
            waveformImageDimensions={currentVideo?.waveformImageDimensions}
          />
        </div>
      </div>
    </ScrollArea>
  )
} 