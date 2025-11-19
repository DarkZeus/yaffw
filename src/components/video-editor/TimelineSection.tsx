
import type ReactPlayer from 'react-player'
import type { TrimOperations, TrimState, UIState, VideoOperations, VideoState } from '../../types/video-editor-mediator.types'
import type { LocalVideoFile } from '../../utils/localFileProcessor'
import { VideoTimeline } from '../VideoTimeline'
import { Badge } from '../ui/badge'
import { ScrollArea, ScrollBar } from '../ui/scroll-area'
import { VideoControlBar } from './VideoControlBar'
import { ZoomControls } from './ZoomControls'

type TimelineSectionProps = {
  videoState: Pick<VideoState, 'currentTime' | 'duration' | 'isPlaying' | 'playbackSpeed'>
  trimState: TrimState
  uiState: UIState
  currentVideo: LocalVideoFile
  deferredCurrentTime: number
  videoOps: VideoOperations
  trimOps: TrimOperations
  playerRef: React.RefObject<ReactPlayer | null>
}

export const TimelineSection = ({ 
  videoState, 
  trimState, 
  uiState,
  currentVideo, 
  deferredCurrentTime, 
  videoOps, 
  trimOps,
  playerRef
}: TimelineSectionProps) => {
  const { currentTime, duration, isPlaying, playbackSpeed } = videoState
  const { trimStart, trimEnd } = trimState
  const { isFullscreen, zoomLevel, handleZoomChange } = uiState

  return (
    <ScrollArea className="h-full">
      <div className="h-full border-t bg-card">
        {/* Video Control Bar */}
        <VideoControlBar
          isPlaying={isPlaying}
          isFullscreen={isFullscreen}
          currentTime={currentTime}
          duration={duration}
          playbackSpeed={playbackSpeed}
          videoOps={videoOps}
        />

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
          <ZoomControls zoomLevel={zoomLevel} onZoomChange={handleZoomChange} />
          <ScrollArea type="always">
          <VideoTimeline
            duration={duration}
            currentTime={deferredCurrentTime}
            trimStart={trimStart}
            trimEnd={trimEnd}
            onTrimChange={trimOps.handleTrimChange}
            onSeek={videoOps.handleSeek}
            waveformImagePath={currentVideo?.waveformImagePath}
            hasAudio={currentVideo?.hasAudio}
            isPlaying={isPlaying}
            playerRef={playerRef}
            zoomLevel={zoomLevel}
          />
          <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      </div>
    </ScrollArea>
  )
} 