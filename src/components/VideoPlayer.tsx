import { Loader2, Maximize2, Minimize2, Settings, Volume2, VolumeX } from 'lucide-react'
import { useDeferredValue, useEffect, useRef, useState, useTransition } from 'react'
import ReactPlayer from 'react-player'
import { VideoControls } from './VideoControls'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import { Card } from './ui/card'

type VideoPlayerProps = {
  url: string
  isPlaying: boolean
  currentTime: number
  duration: number
  onProgress: (state: { played: number, playedSeconds: number }) => void
  onDuration: (duration: number) => void
  onPlayPause: () => void
  onSeek: (time: number) => void
}

export function VideoPlayer({
  url,
  isPlaying,
  currentTime,
  duration,
  onProgress,
  onDuration,
  onPlayPause,
  onSeek
}: VideoPlayerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [isHovering, setIsHovering] = useState(false)
  const playerRef = useRef<ReactPlayer>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Auto-hide controls after 3 seconds
  useEffect(() => {
    if (isHovering || !isPlaying) {
      setShowControls(true)
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current)
      }
    } else {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false)
      }, 3000)
    }

    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current)
      }
      // Cleanup click timeout on unmount
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current)
      }
    }
  }, [isHovering, isPlaying])

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen()
        setIsFullscreen(true)
      } else {
        await document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch (error) {
      console.warn('Fullscreen operation failed:', error)
    }
  }

  const toggleMute = () => {
    setIsMuted(!isMuted)
  }

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume)
    setIsMuted(newVolume === 0)
  }

  // Handle video click with single/double click detection
  const handleVideoClick = (e: React.MouseEvent) => {
    // Don't handle clicks on interactive controls
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('input') || target.closest('[role="slider"]')) {
      return
    }

    // Clear any existing timeout
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current)
      clickTimeoutRef.current = null
    }

    // Set a timeout for single click
    clickTimeoutRef.current = setTimeout(() => {
      onPlayPause()
      clickTimeoutRef.current = null
    }, 150) // 150ms delay for snappier response
  }

  // Handle double click for fullscreen
  const handleVideoDoubleClick = (e: React.MouseEvent) => {
    // Don't handle double clicks on interactive controls
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('input') || target.closest('[role="slider"]')) {
      return
    }

    // Clear the single click timeout
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current)
      clickTimeoutRef.current = null
    }
    
    // Trigger fullscreen
    toggleFullscreen()
  }

  return (
    <Card 
      ref={containerRef}
      className="relative bg-black overflow-hidden group"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onMouseMove={() => setIsHovering(true)}
    >
      {/* Video Player */}
      <div className="relative aspect-video">
        <ReactPlayer
          ref={playerRef}
          url={url}
          width="100%"
          height="100%"
          playing={isPlaying}
          volume={isMuted ? 0 : volume}
          onProgress={onProgress}
          onDuration={onDuration}
          controls={false}
          className="absolute inset-0"
        />
        
        {/* Loading Overlay */}
        {!duration && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <Alert className="bg-black/70 border-0">
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription className="text-white">
                Loading video...
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Controls Overlay */}
        <div className={`
          absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent
          transition-opacity duration-300 select-none
          ${showControls ? 'opacity-100' : 'opacity-0'}
        `}>
          {/* Top Controls */}
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={toggleFullscreen}
              className="bg-black/50 hover:bg-black/70 text-white border-0"
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Bottom Controls */}
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <div className="space-y-3">
              {/* Main Controls */}
              <VideoControls
                isPlaying={isPlaying}
                currentTime={currentTime}
                duration={duration}
                onPlayPause={onPlayPause}
              />
              
              {/* Additional Controls */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Volume Control */}
                  <div className="flex items-center gap-2 select-none">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={toggleMute}
                      className="text-white hover:text-muted-foreground p-1 h-auto"
                    >
                      {isMuted || volume === 0 ? (
                        <VolumeX className="h-4 w-4" />
                      ) : (
                        <Volume2 className="h-4 w-4" />
                      )}
                    </Button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={isMuted ? 0 : volume}
                      onChange={(e) => handleVolumeChange(Number(e.target.value))}
                      className="w-20 h-1 bg-muted rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-white hover:text-muted-foreground p-1 h-auto"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Click overlay for play/pause and fullscreen - positioned above controls */}
        <div 
          className="absolute inset-0 cursor-pointer select-none pointer-events-none"
          style={{ zIndex: 10 }}
        >
          {/* Clickable area that avoids controls */}
          <div
            className="absolute inset-0 pointer-events-auto"
            onClick={handleVideoClick}
            onDoubleClick={handleVideoDoubleClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onPlayPause()
              if (e.key === 'f' || e.key === 'F') toggleFullscreen()
            }}
            role="button"
            tabIndex={0}
            style={{
              /* Exclude control areas from clicks */
              clipPath: 'polygon(0% 0%, 100% 0%, 100% calc(100% - 120px), 0% calc(100% - 120px))'
            }}
          />
        </div>
      </div>
    </Card>
  )
} 