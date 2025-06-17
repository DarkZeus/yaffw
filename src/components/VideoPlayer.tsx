import { Maximize2, Minimize2, Settings, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import ReactPlayer from 'react-player'
import { VideoControls } from './VideoControls'

interface VideoPlayerProps {
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
  const controlsTimeoutRef = useRef<NodeJS.Timeout>()

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
    }
  }, [isHovering, isPlaying])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  const toggleMute = () => {
    setIsMuted(!isMuted)
  }

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume)
    setIsMuted(newVolume === 0)
  }

  return (
    <div 
      ref={containerRef}
      className="relative bg-black rounded-lg overflow-hidden group shadow-2xl"
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
            <div className="flex items-center gap-3 text-white">
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Loading video...</span>
            </div>
          </div>
        )}

        {/* Click to Play/Pause Overlay */}
        <div 
          className="absolute inset-0 cursor-pointer"
          onClick={onPlayPause}
          onKeyDown={(e) => e.key === 'Enter' && onPlayPause()}
          role="button"
          tabIndex={0}
        />

        {/* Controls Overlay */}
        <div className={`
          absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent
          transition-opacity duration-300
          ${showControls ? 'opacity-100' : 'opacity-0'}
        `}>
          {/* Top Controls */}
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-2 bg-black/50 hover:bg-black/70 text-white rounded-lg transition-colors"
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </button>
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
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleMute}
                      className="p-1 text-white hover:text-gray-300 transition-colors"
                    >
                      {isMuted || volume === 0 ? (
                        <VolumeX className="h-4 w-4" />
                      ) : (
                        <Volume2 className="h-4 w-4" />
                      )}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={isMuted ? 0 : volume}
                      onChange={(e) => handleVolumeChange(Number(e.target.value))}
                      className="w-20 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button className="p-1 text-white hover:text-gray-300 transition-colors">
                    <Settings className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 