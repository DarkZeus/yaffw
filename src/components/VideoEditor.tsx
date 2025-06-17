import { Download, Scissors } from 'lucide-react'
import React, { useState, useRef, useTransition, useDeferredValue } from 'react'
import ReactPlayer from 'react-player'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { axiosUpload as streamingUpload } from '../utils/axiosUpload'
import { ActionButton } from './ActionButton'
import { AnimatedProgress } from './AnimatedProgress'
import { FileDropZone } from './FileDropZone'
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp'
import { UploadProgress } from './UploadProgress'
import { VideoControls } from './VideoControls'
import { VideoPlayer } from './VideoPlayer'
import { VideoTimeline } from './VideoTimeline'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Progress } from './ui/progress'

interface VideoFile {
  file: File
  url: string
  duration: number
  filePath?: string // Server file path after chunked upload
}

export function VideoEditor() {
  const [currentVideo, setCurrentVideo] = useState<VideoFile | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(100)
  
  // Handle timeline trim changes
  const handleTrimChange = (start: number, end: number) => {
    setTrimStart(start)
    setTrimEnd(end)
  }
  const [isProcessing, setIsProcessing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const playerRef = useRef<ReactPlayer>(null)

  // React 19 performance optimizations
  const [isPending, startTransition] = useTransition()
  const deferredUploadProgress = useDeferredValue(uploadProgress)
  const deferredCurrentTime = useDeferredValue(currentTime)

  const onDrop = async (acceptedFiles: File[]) => {
    const videoFile = acceptedFiles[0]
    if (videoFile?.type.startsWith('video/')) {
      const url = URL.createObjectURL(videoFile)
      const newVideo: VideoFile = {
        file: videoFile,
        url,
        duration: 0
      }
      
      // Use transition for non-urgent video state update
      startTransition(() => {
        setCurrentVideo(newVideo)
      })
      
      // Start chunked upload in background
      setIsUploading(true)
      setUploadProgress(0)
      
      try {
        const result = await streamingUpload({
          file: videoFile,
          onProgress: (progress: number) => {
            // Use transition for smooth progress updates
            startTransition(() => {
              setUploadProgress(progress)
            })
          },
          onComplete: (result) => {
            // Update video with server file path using transition
            startTransition(() => {
              setCurrentVideo(prev => prev ? { ...prev, filePath: result.filePath } : null)
            })
          },
          onError: (error) => {
            alert(`Upload failed: ${error.message}`)
          }
        })
        
      } catch (error) {
        alert('Upload failed. Please try again.')
      } finally {
        setIsUploading(false)
        setUploadProgress(0)
      }
    }
  }

  // Dropzone is now handled by FileDropZone component

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying)
  }

  const handleProgress = (state: { played: number, playedSeconds: number }) => {
    setCurrentTime(state.playedSeconds)
  }

  const handleDuration = (duration: number) => {
    startTransition(() => {
      setDuration(duration)
      if (currentVideo) {
        setCurrentVideo(prev => prev ? { ...prev, duration } : null)
        setTrimEnd(duration)
      }
    })
  }

  const handleSeek = (time: number) => {
    setCurrentTime(time)
    playerRef.current?.seekTo(time, 'seconds')
  }

  // Keyboard shortcuts handlers
  const handleSetTrimStart = () => {
    startTransition(() => {
      setTrimStart(currentTime)
    })
  }

  const handleSetTrimEnd = () => {
    startTransition(() => {
      setTrimEnd(currentTime)
    })
  }

  const handleJumpToTrimStart = () => {
    handleSeek(trimStart)
  }

  const handleJumpToTrimEnd = () => {
    handleSeek(trimEnd)
  }

  const handleResetTrim = () => {
    startTransition(() => {
      setTrimStart(0)
      setTrimEnd(duration)
    })
  }

  const handleTrimVideo = async () => {
    if (!currentVideo || !currentVideo.filePath) {
      alert('Please wait for the video upload to complete before trimming.')
      return
    }
    
    const fileSizeGB = currentVideo.file.size / (1024 * 1024 * 1024)
    
    // Warn about large files
    if (fileSizeGB > 1) {
      const confirmed = confirm(
        `This is a large file (${fileSizeGB.toFixed(2)} GB). Processing may take several minutes. Continue?`
      )
      if (!confirmed) return
    }
    
    setIsProcessing(true)
    try {
      const response = await fetch('http://localhost:3001/api/trim-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filePath: currentVideo.filePath,
          startTime: trimStart,
          endTime: trimEnd,
          fileName: currentVideo.file.name,
        }),
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        const errorMessage = errorData?.error || `Server error: ${response.status}`
        const errorDetails = errorData?.details || 'Unknown error'
        throw new Error(`${errorMessage}: ${errorDetails}`)
      }
      
      // Download the trimmed video
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `trimmed_${currentVideo.file.name}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
    } catch (error) {
      alert(`Error processing video: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsProcessing(false)
    }
  }

  // Initialize keyboard shortcuts
  const { shortcuts } = useKeyboardShortcuts({
    onPlayPause: handlePlayPause,
    onSeek: handleSeek,
    currentTime,
    duration,
    onSetTrimStart: handleSetTrimStart,
    onSetTrimEnd: handleSetTrimEnd,
    onJumpToTrimStart: handleJumpToTrimStart,
    onJumpToTrimEnd: handleJumpToTrimEnd,
    trimStart,
    trimEnd,
    onExport: handleTrimVideo,
    onResetTrim: handleResetTrim,
    enabled: !!currentVideo && !isProcessing // Removed !isUploading - shortcuts should work during upload
  })

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Scissors className="h-5 w-5" />
              Video Editor MVP
            </CardTitle>
            {currentVideo && (
              <KeyboardShortcutsHelp shortcuts={shortcuts} />
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enhanced File Upload */}
          {!currentVideo && (
            <FileDropZone 
              onDrop={onDrop}
              isUploading={isUploading}
            />
          )}

          {/* Upload Progress */}
          <UploadProgress 
            progress={uploadProgress}
            isUploading={isUploading}
            fileName={currentVideo?.file.name}
          />

          {/* Video Player */}
          {currentVideo && (
            <div className="space-y-4">
              <div className="relative bg-black rounded-lg overflow-hidden">
                <ReactPlayer
                  ref={playerRef}
                  url={currentVideo.url}
                  width="100%"
                  height="400px"
                  playing={isPlaying}
                  onProgress={handleProgress}
                  onDuration={handleDuration}
                  controls={false}
                />
              </div>

              {/* Controls */}
              <VideoControls
                isPlaying={isPlaying}
                currentTime={currentTime}
                duration={duration}
                onPlayPause={handlePlayPause}
              />

              {/* Professional Timeline Editor */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Scissors className="h-4 w-4" />
                      Timeline Editor
                    </CardTitle>
                                         <div className="flex items-center gap-2 text-xs text-gray-500">
                       <div className={`w-2 h-2 rounded-full ${
                         !!currentVideo && !isProcessing 
                           ? 'bg-green-500 animate-pulse' 
                           : 'bg-gray-300'
                       }`} />
                       <span>Shortcuts {!!currentVideo && !isProcessing ? 'Active' : 'Disabled'}</span>
                       {isUploading && <span className="text-blue-500">(Upload in progress)</span>}
                     </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-sm text-gray-600 mb-4">
                    <div className="flex justify-between">
                      <span>Selection: {trimStart.toFixed(1)}s - {trimEnd.toFixed(1)}s</span>
                      <span>Duration: {(trimEnd - trimStart).toFixed(1)}s</span>
                    </div>
                  </div>
                  
                                    {/* Custom Video Timeline */}
                  <VideoTimeline
                    duration={duration}
                    currentTime={currentTime}
                    trimStart={trimStart}
                    trimEnd={trimEnd}
                    onTrimChange={handleTrimChange}
                    onSeek={(time) => {
                      setCurrentTime(time)
                      playerRef.current?.seekTo(time, 'seconds')
                    }}
                  />

                  <div className="flex gap-2">
                    <Button
                      onClick={handleTrimVideo}
                      disabled={isProcessing || isUploading || !currentVideo?.filePath}
                      className="flex items-center gap-2"
                    >
                      {isProcessing ? (
                        <>Processing...</>
                      ) : isUploading ? (
                        <>Uploading...</>
                      ) : !currentVideo?.filePath ? (
                        <>Upload in Progress...</>
                      ) : (
                        <>
                          <Download className="h-4 w-4" />
                          Export Trimmed Video
                        </>
                      )}
                    </Button>
                    
                    <Button
                      variant="outline"
                      onClick={() => setCurrentVideo(null)}
                    >
                      Upload New Video
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 