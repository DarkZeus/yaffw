import { Maximize2, Minimize2, Pause, Play } from 'lucide-react'
import { forwardRef } from 'react'
import ReactPlayer from 'react-player'

import type { VideoOperations } from '../../types/video-editor-mediator.types'
import { VolumeControl } from '../VolumeControl'
import { Button } from '../ui/button'

type VideoPlayerSectionProps = {
  videoUrl: string
  isPlaying: boolean
  isFullscreen: boolean
  aspectRatioClass: string
  videoOps: VideoOperations
  playerRef: React.RefObject<ReactPlayer | null>
  volumeControlRef: React.RefObject<{ updateState: (volume: number, isMuted: boolean) => void } | null>
}

export const VideoPlayerSection = forwardRef<HTMLDivElement, VideoPlayerSectionProps>(
  ({ videoUrl, isPlaying, isFullscreen, aspectRatioClass, videoOps, playerRef, volumeControlRef }, ref) => {
    return (
      <div ref={ref} className="h-full bg-black flex items-center justify-center relative group">
        <div className={`w-full max-w-full max-h-full ${aspectRatioClass} relative`}>
          <ReactPlayer
            ref={playerRef}
            url={videoUrl}
            width="100%"
            height="100%"
            playing={isPlaying}
            onProgress={videoOps.handleProgress}
            onDuration={videoOps.handleDuration}
            controls={false}
          />
          
          {/* Video Controls Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none select-none">
            {/* Center Play/Pause Button */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
              <Button
                variant="secondary"
                size="lg"
                onClick={videoOps.handlePlayPause}
                className="bg-black/70 hover:bg-black/90 text-white border-0 w-16 h-16 rounded-full opacity-80 hover:opacity-100 transition-opacity duration-200"
              >
                {isPlaying ? (
                  <Pause className="h-8 w-8" />
                ) : (
                  <Play className="h-8 w-8 ml-1" />
                )}
              </Button>
            </div>
            
            {/* Top Right Controls */}
            <div className="absolute top-4 right-4 flex items-center gap-2 pointer-events-auto" style={{ zIndex: 20 }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={videoOps.handleToggleFullscreen}
                className="bg-black/50 hover:bg-black/70 text-white border-0"
              >
                {isFullscreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </Button>
            </div>
            
            {/* Bottom Left Volume Controls */}
            <div className="absolute bottom-4 left-4" style={{ zIndex: 20 }}>
              <VolumeControl
                ref={volumeControlRef}
                onVolumeChange={videoOps.handleVolumeUpdate}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }
) 