import { Maximize2, Minimize2, Pause, Play } from 'lucide-react'
import { forwardRef } from 'react'
import ReactPlayer from 'react-player'

import { 
  CLICK_OVERLAY_Z_INDEX, 
  CONTROLS_Z_INDEX, 
  VIDEO_PLAYER_CLASSES 
} from '../../constants/video-player.constants'
import { useAutoHideControls, useClickDetection } from '../../hooks/video-player'
import type { VideoOperations } from '../../types/video-editor-mediator.types'
import { 
  getClickOverlayClasses, 
  getContainerClasses, 
  getControlsOverlayClasses, 
  getControlsVisibility, 
  shouldHideCursor 
} from '../../utils/video-player'
import { VolumeControl } from '../VolumeControl'
import { Button } from '../ui/button'

type VideoPlayerSectionProps = {
  videoUrl: string
  isPlaying: boolean
  isFullscreen: boolean
  aspectRatioClass: string
  playbackSpeed: number
  videoOps: VideoOperations
  playerRef: React.RefObject<ReactPlayer | null>
  volumeControlRef: React.RefObject<{ updateState: (volume: number, isMuted: boolean) => void } | null>
}

export const VideoPlayerSection = forwardRef<HTMLDivElement, VideoPlayerSectionProps>(
  ({ 
    videoUrl, 
    isPlaying, 
    isFullscreen, 
    aspectRatioClass, 
    playbackSpeed, 
    videoOps, 
    playerRef, 
    volumeControlRef 
  }, ref) => {
    // Custom hooks for managing state and behavior
    const { showControls, resetHideTimer } = useAutoHideControls(isFullscreen)
    const { handleVideoClick, handleVideoDoubleClick, handleKeyDown } = useClickDetection({
      onSingleClick: videoOps.handlePlayPause,
      onDoubleClick: videoOps.handleToggleFullscreen
    })

    // Handle mouse movement to show controls and reset timer
    const handleMouseMove = (): void => {
      if (!isFullscreen) return
      resetHideTimer()
    }

    // Derived state using utility functions
    const controlsVisible = getControlsVisibility(isFullscreen, showControls)
    const cursorShouldHide = shouldHideCursor(isFullscreen, showControls)

    // Generate CSS classes using utility functions
    const containerClasses = getContainerClasses(
      VIDEO_PLAYER_CLASSES.CONTAINER,
      VIDEO_PLAYER_CLASSES.CONTAINER_CURSOR_HIDDEN,
      cursorShouldHide
    )

    const controlsOverlayClasses = getControlsOverlayClasses(
      VIDEO_PLAYER_CLASSES.CONTROLS_OVERLAY_BASE,
      VIDEO_PLAYER_CLASSES.CONTROLS_VISIBLE,
      VIDEO_PLAYER_CLASSES.CONTROLS_HIDDEN,
      VIDEO_PLAYER_CLASSES.CONTROLS_HOVER,
      isFullscreen,
      controlsVisible
    )

    const clickOverlayClasses = getClickOverlayClasses(
      VIDEO_PLAYER_CLASSES.CLICK_OVERLAY,
      VIDEO_PLAYER_CLASSES.CLICK_OVERLAY_CURSOR_HIDDEN,
      VIDEO_PLAYER_CLASSES.CLICK_OVERLAY_CURSOR_VISIBLE,
      cursorShouldHide
    )

    return (
      <div 
        ref={ref} 
        className={containerClasses}
        onMouseMove={handleMouseMove}
      >
        <div className={`${VIDEO_PLAYER_CLASSES.VIDEO_WRAPPER} ${aspectRatioClass}`}>
          <ReactPlayer
            ref={playerRef}
            url={videoUrl}
            width="100%"
            height="100%"
            playing={isPlaying}
            playbackRate={playbackSpeed}
            onProgress={videoOps.handleProgress}
            onDuration={videoOps.handleDuration}
            controls={false}
          />
          
          {/* Video Controls Overlay */}
          <div className={controlsOverlayClasses}>
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
            <div className="absolute top-4 right-4 flex items-center gap-2 pointer-events-auto" style={{ zIndex: CONTROLS_Z_INDEX }}>
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
            <div className="absolute bottom-4 left-4" style={{ zIndex: CONTROLS_Z_INDEX }}>
              <VolumeControl
                ref={volumeControlRef}
                onVolumeChange={videoOps.handleVolumeUpdate}
              />
            </div>
          </div>

          {/* Click overlay for play/pause and fullscreen */}
          <div 
            className={clickOverlayClasses}
            style={{ zIndex: CLICK_OVERLAY_Z_INDEX }}
          >
            <div
              className={VIDEO_PLAYER_CLASSES.CLICKABLE_AREA}
              onClick={handleVideoClick}
              onDoubleClick={handleVideoDoubleClick}
              onKeyDown={handleKeyDown}
              role="button"
              tabIndex={0}
            />
          </div>
        </div>
      </div>
    )
  }
) 