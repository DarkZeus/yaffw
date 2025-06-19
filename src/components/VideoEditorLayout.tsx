import { 
  Activity,
  BarChart3,
  Clock,
  Download, 
  Home, 
  Loader2,
  Pause, 
  Play, 
  RotateCcw, 
  Scissors, 
  SkipBack, 
  SkipForward, 
  Sliders, 
  Square 
} from 'lucide-react'
import { useDeferredValue, useRef, useState, useTransition } from 'react'
import ReactPlayer from 'react-player'
import { toast } from 'sonner'

import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { axiosUpload as streamingUpload } from '../utils/axiosUpload'
import { type LocalVideoFile, type WaveformPoint, cleanupLocalFile, commitFileToServer, processVideoLocally } from '../utils/localFileProcessor'
import { downloadVideoFromUrl } from '../utils/urlDownloader'
import { type VideoMetadata, extractDetailedVideoMetadata } from '../utils/videoMetadata'
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp'
import { UnifiedUploadZone } from './UnifiedUploadZone'
import { VideoAnalytics } from './VideoAnalytics'
import { VideoTimeline } from './VideoTimeline'
import { Alert, AlertDescription } from './ui/alert'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './ui/resizable'
import { Separator } from './ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'

export function VideoEditorLayout() {
  const [currentVideo, setCurrentVideo] = useState<LocalVideoFile | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata>({})
  const [isDeleting, setIsDeleting] = useState(false)
  const [showLargeFileConfirmDialog, setShowLargeFileConfirmDialog] = useState(false)
  const [largeFileSize, setLargeFileSize] = useState(0)
  const playerRef = useRef<ReactPlayer>(null)

  // React 19 performance optimizations
  const [isPending, startTransition] = useTransition()
  const deferredUploadProgress = useDeferredValue(uploadProgress)
  const deferredCurrentTime = useDeferredValue(currentTime)

  // Convert aspect ratio string to Tailwind class
  const getAspectRatioClass = (aspectRatio?: string) => {
    if (!aspectRatio) return 'aspect-video' // Default to 16:9
    
    const commonRatios: Record<string, string> = {
      '16:9': 'aspect-video',
      '4:3': 'aspect-[4/3]',
      '3:2': 'aspect-[3/2]', 
      '21:9': 'aspect-[21/9]',
      '1:1': 'aspect-square',
      '9:16': 'aspect-[9/16]', // Vertical/portrait
      '3:4': 'aspect-[3/4]',   // Vertical 4:3
      '2:3': 'aspect-[2/3]',   // Vertical 3:2
    }
    
    // Check for exact match first
    if (commonRatios[aspectRatio]) {
      return commonRatios[aspectRatio]
    }
    
    // Parse custom ratio (e.g., "17:10" -> "aspect-[17/10]")
    const match = aspectRatio.match(/^(\d+):(\d+)$/)
    if (match) {
      const [, width, height] = match
      return `aspect-[${width}/${height}]`
    }
    
    // Fallback to 16:9 if parsing fails
    return 'aspect-video'
  }

  const handleTrimChange = (start: number, end: number) => {
    setTrimStart(start)
    setTrimEnd(end)
  }

  const onDrop = async (acceptedFiles: File[]) => {
    const videoFile = acceptedFiles[0]
    if (videoFile?.type.startsWith('video/')) {
      setIsUploading(true)
      setUploadProgress(0)
      
      try {
        // Process file locally for immediate preview
        const localVideo = await processVideoLocally(videoFile)
        
        startTransition(() => {
          setCurrentVideo(localVideo)
        })
        
        // Extract detailed metadata for analytics
        extractDetailedVideoMetadata(videoFile).then((metadata) => {
          startTransition(() => {
            setVideoMetadata(metadata)
          })
        })
        
        setIsUploading(false)
        setUploadProgress(100)
        
        // Reset progress after a short delay for UX
        setTimeout(() => {
          setUploadProgress(0)
        }, 1000)
        
        // Show success toast
        toast.success("File uploaded successfully!", {
          description: `Loaded ${videoFile.name}`,
        })
        
      } catch (error) {
        showError('File Processing Failed', error instanceof Error ? error.message : 'Unknown error')
        resetAllVideoState()
        setIsUploading(false)
        setUploadProgress(0)
      }
    }
  }

  const onUrlDownload = async (url: string) => {
    setIsDownloading(true)
    setUploadProgress(0)

    // Show info toast that download started
    toast.info("Download started", {
      description: "Downloading video from URL...",
    })

    try {
      console.log('🌐 Starting download from URL:', url)
      
      // Download video from URL
      const response = await downloadVideoFromUrl(url)
      
      if (response.success) {
        // Fetch the downloaded video file and create a blob URL like we do for uploads
        console.log('📥 Fetching downloaded video for local processing...')
        const videoResponse = await fetch(`http://localhost:3001/api/stream/${response.uniqueFileName}`)
        
        if (!videoResponse.ok) {
          throw new Error('Failed to fetch downloaded video')
        }
        
        const videoBlob = await videoResponse.blob()
        const videoUrl = URL.createObjectURL(videoBlob)
        
        // Create a proper File object from the downloaded data
        const videoFile = new File([videoBlob], response.originalFileName, {
          type: 'video/mp4',
          lastModified: Date.now()
        })
        
        // Process the video locally like we do for uploaded files
        const localVideo = await processVideoLocally(videoFile)
        
        // Use server waveform data directly (it's already in the correct WaveformPoint format)
        console.log('🎵 Processing waveform data...')
        console.log('🎵 Server waveform length:', response.waveformData?.length || 0)
        console.log('🎵 Server waveform image:', response.waveformImagePath)
        console.log('🎵 Sample server waveform point:', response.waveformData?.[0])
        
        const serverWaveformData = (response.waveformData || []) as WaveformPoint[]
        
        // Add server file path and use server-generated waveform (it's better quality)
        const localVideoWithServerPath = {
          ...localVideo,
          waveformData: serverWaveformData.length > 0 ? serverWaveformData : localVideo.waveformData,
          serverFilePath: response.filePath,
          waveformImagePath: response.waveformImagePath,
          waveformImageDimensions: response.waveformImageDimensions
        }

        startTransition(() => {
          setCurrentVideo(localVideoWithServerPath)
        })
        
        // Extract detailed metadata for analytics (like we do for uploads)
        extractDetailedVideoMetadata(videoFile).then((metadata) => {
          startTransition(() => {
            setVideoMetadata(metadata)
          })
        }).catch(err => {
          console.warn('Failed to extract detailed metadata:', err)
          // Fallback to server metadata if detailed extraction fails
          startTransition(() => {
            setVideoMetadata(response.metadata || {})
          })
        })

        setUploadProgress(100)
        
        // Reset progress after a short delay for UX
        setTimeout(() => {
          setUploadProgress(0)
        }, 1000)
        
        // Show success toast
        toast.success("Video downloaded successfully!", {
          description: `Loaded ${response.originalFileName}`,
        })
        
      } else {
        throw new Error('Download failed')
      }
      
    } catch (error) {
      showError('URL Download Failed', error instanceof Error ? error.message : 'Unknown error')
      resetAllVideoState()
      setUploadProgress(0)
    } finally {
      setIsDownloading(false)
    }
  }

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

  const handleSeekBackward = () => {
    handleSeek(Math.max(0, currentTime - 5))
  }

  const handleSeekForward = () => {
    handleSeek(Math.min(duration, currentTime + 5))
  }

  const handleJumpToStart = () => {
    handleSeek(0)
  }

  const handleJumpToEnd = () => {
    handleSeek(duration)
  }

  const downloadVideo = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trimmed_${fileName}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    // Show success toast
    toast.success("Video exported successfully!", {
      description: `Downloaded as trimmed_${fileName}`,
    })
  }

  const resetAllVideoState = () => {
    console.log('🧹 Cleaning up all video state and data')
    
    // Complete cleanup of all video-related state
    setCurrentVideo(null)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setTrimStart(0)
    setTrimEnd(0) // Reset to 0, will be set to actual duration when video loads
    setVideoMetadata({})
    setIsProcessing(false)
    setIsUploading(false)
    setIsDownloading(false)
    setUploadProgress(0)
    setIsFullscreen(false)
    
    // Reset player reference
    if (playerRef.current) {
      playerRef.current.seekTo(0, 'seconds')
    }
    
    console.log('✅ Video state cleanup complete')
  }

  const handleLoadNewVideo = async () => {
    // Early return if no current video
    if (!currentVideo) {
      return
    }
    
    setIsDeleting(true)

    // Clean up local resources
    cleanupLocalFile(currentVideo)

    // Delete server file if it exists
    if (currentVideo.serverFilePath) {
      try {
        const response = await fetch('http://localhost:3001/api/delete-video', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filePath: currentVideo.serverFilePath,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => null)
          const errorMessage = errorData?.error || 'Failed to delete video file'
          console.warn(`Delete warning: ${errorMessage}`)
          // Continue with reset even if delete fails
        }
      } catch (error) {
        console.warn('Failed to delete server file:', error)
        // Continue with reset even if delete fails
      }
    }

    // Reset all state and cleanup
    resetAllVideoState()
    setIsDeleting(false)
  }

  const showError = (message: string, details = '') => {
    toast.error(message, {
      description: details || undefined,
    })
  }

  const handleTrimVideo = async () => {
    if (!currentVideo) {
      showError('No Video', 'Please select a video file first.')
      return
    }

    // If file hasn't been committed to server yet, commit it first
    if (!currentVideo.serverFilePath) {
      showError('Committing to Server', 'Preparing file for processing...')
      setIsUploading(true)
      
      try {
        const serverFilePath = await commitFileToServer(currentVideo, (progress) => {
          setUploadProgress(progress)
        })
        
        // Update currentVideo with server file path
        setCurrentVideo(prev => prev ? { ...prev, serverFilePath } : null)
        setIsUploading(false)
        setUploadProgress(0)
        
        // Continue with trimming after commit
        await processVideoTrim(serverFilePath)
        return
        
      } catch (error) {
        showError('Commit Failed', error instanceof Error ? error.message : 'Unknown error')
        setIsUploading(false)
        setUploadProgress(0)
        return
      }
    }
    
    const fileSizeGB = currentVideo.file.size / (1024 * 1024 * 1024)
    
    if (fileSizeGB > 1) {
      setLargeFileSize(fileSizeGB)
      setShowLargeFileConfirmDialog(true)
      return
    }
    
    await processVideoTrim(currentVideo.serverFilePath)
  }

  const processVideoTrim = async (serverFilePath?: string) => {
    const filePath = serverFilePath || currentVideo?.serverFilePath
    if (!filePath || !currentVideo) return
    
    setIsProcessing(true)
    
    // Use functional approach without try/catch
    const response = await fetch('http://localhost:3001/api/trim-video', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filePath: filePath,
        startTime: trimStart,
        endTime: trimEnd,
        fileName: currentVideo.file.name,
      }),
    })
    
    // Handle error cases with early returns
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      const errorMessage = errorData?.error || `Server error: ${response.status}`
      const errorDetails = errorData?.details || 'Unknown error'
      showError(errorMessage, errorDetails)
      setIsProcessing(false)
      return
    }
    
    const blob = await response.blob()
    downloadVideo(blob, currentVideo.file.name)
    setIsProcessing(false)
  }

  const handleConfirmLargeFile = async () => {
    setShowLargeFileConfirmDialog(false)
    await processVideoTrim()
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
    enabled: !!currentVideo && !isProcessing && !isDeleting // Disabled during deletion
  })

  if (!currentVideo) {
    return (
      <TooltipProvider>
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="w-full max-w-2xl">
            <UnifiedUploadZone 
              onFileDrop={onDrop}
              onUrlDownload={onUrlDownload}
              isUploading={isUploading}
              isDownloading={isDownloading}
              uploadProgress={uploadProgress}
            />
          </div>
        </div>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      <div className={`${isFullscreen ? 'fixed inset-0 z-50' : 'min-h-screen'} bg-background flex flex-col`}>
        {/* Header */}
        <header className="border-b bg-card">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Scissors className="h-5 w-5" />
                <h1 className="font-semibold">Yet Another FFmpeg Wrapper</h1>
              </div>
              <Separator orientation="vertical" className="h-6" />
              <p className="text-sm text-muted-foreground truncate">
                {currentVideo.file.name}
              </p>
            </div>
            
            <KeyboardShortcutsHelp shortcuts={shortcuts} />
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 min-h-0">
          <ResizablePanelGroup direction="horizontal" className="h-full">
            {/* Sidebar */}
            <ResizablePanel defaultSize={25} minSize={20} maxSize={35}>
              <div className="h-full border-r bg-card">
                <Tabs defaultValue="controls" className="h-full flex flex-col">
                  <TabsList className="grid w-full grid-cols-2 rounded-none border-b">
                    <TabsTrigger value="controls" className="flex items-center gap-2">
                      <Sliders className="h-4 w-4" />
                      Controls
                    </TabsTrigger>
                    <TabsTrigger value="analytics" className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Analytics
                    </TabsTrigger>
                  </TabsList>

                  <div className="flex-1 overflow-y-auto">
                    <TabsContent value="controls" className="p-6 space-y-6 m-0">
                      {/* Playback Control */}
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
                                  onClick={handlePlayPause}
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
                                <Button variant="outline" size="sm" onClick={handleJumpToStart}>
                                  <Home className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent><p>Jump to start (Home)</p></TooltipContent>
                            </Tooltip>
                            
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="outline" size="sm" onClick={handleSeekBackward}>
                                  <SkipBack className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent><p>Seek backward (←)</p></TooltipContent>
                            </Tooltip>
                            
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="outline" size="sm" onClick={handleSeekForward}>
                                  <SkipForward className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent><p>Seek forward (→)</p></TooltipContent>
                            </Tooltip>
                            
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="outline" size="sm" onClick={handleJumpToEnd}>
                                  <Square className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent><p>Jump to end (End)</p></TooltipContent>
                            </Tooltip>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Trim Controls */}
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Scissors className="h-4 w-4" />
                            Trim Controls
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid grid-cols-2 gap-3">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button onClick={handleSetTrimStart} className="h-12">
                                  Set Start
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent><p>Set trim start (J)</p></TooltipContent>
                            </Tooltip>
                            
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button onClick={handleSetTrimEnd} className="h-12">
                                  Set End
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent><p>Set trim end (K)</p></TooltipContent>
                            </Tooltip>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button onClick={handleJumpToTrimStart} variant="outline" size="sm">
                                  Jump to Start
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent><p>Jump to trim start (I)</p></TooltipContent>
                            </Tooltip>
                            
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button onClick={handleJumpToTrimEnd} variant="outline" size="sm">
                                  Jump to End
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent><p>Jump to trim end (O)</p></TooltipContent>
                            </Tooltip>
                          </div>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button onClick={handleResetTrim} variant="outline" className="w-full">
                                <RotateCcw className="h-4 w-4 mr-2" />
                                Reset Trim
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Reset trim (R)</p></TooltipContent>
                          </Tooltip>
                        </CardContent>
                      </Card>

                      {/* Export */}
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Download className="h-4 w-4" />
                            Export
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                onClick={handleTrimVideo}
                                disabled={isProcessing || isUploading || !currentVideo}
                                className="w-full h-12"
                              >
                                {isProcessing ? (
                                  <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Processing...
                                  </>
                                ) : (
                                  <>
                                    <Download className="h-4 w-4 mr-2" />
                                    Export Video
                                  </>
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Export video (Enter) - Creates multiple trims from same source</p></TooltipContent>
                          </Tooltip>
                        </CardContent>
                      </Card>

                      {/* Status */}
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Activity className="h-4 w-4" />
                            Status
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Shortcuts</span>
                            <Badge variant={!!currentVideo && !isProcessing && !isDeleting ? "default" : "secondary"}>
                              {!!currentVideo && !isProcessing && !isDeleting ? 'Active' : 'Disabled'}
                            </Badge>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Duration
                            </span>
                            <Badge variant="outline" className="font-mono">
                              {Math.floor(duration / 60)}:{(Math.floor(duration % 60)).toString().padStart(2, '0')}
                            </Badge>
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Selection</span>
                            <Badge variant="outline" className="font-mono">
                              {(trimEnd - trimStart).toFixed(1)}s
                            </Badge>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Progress</span>
                            <Badge variant="outline" className="font-mono">
                              {Math.round(((trimEnd - trimStart) / duration) * 100) || 0}%
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>

                      {/* File Management */}
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Square className="h-4 w-4" />
                            File Management
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Alert className="mb-3">
                            <AlertDescription className="text-xs">
                              💡 "Load New Video" will clear the current video from memory. 
                              Make sure you've exported any trims you need first!
                            </AlertDescription>
                          </Alert>
                          
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                onClick={handleLoadNewVideo}
                                disabled={isDeleting || isProcessing || isUploading}
                                variant="secondary"
                                className="w-full"
                              >
                                {isDeleting ? (
                                  <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Clearing...
                                  </>
                                ) : (
                                  <>
                                    <Square className="h-4 w-4 mr-2" />
                                    Load New Video
                                  </>
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Clear current video and load a new one</p></TooltipContent>
                          </Tooltip>
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="analytics" className="p-6 m-0">
                      <VideoAnalytics 
                        file={currentVideo.file}
                        duration={duration}
                        videoMetadata={videoMetadata}
                      />
                    </TabsContent>
                  </div>
                </Tabs>
              </div>
            </ResizablePanel>

            <ResizableHandle />

            {/* Main Video Area */}
            <ResizablePanel defaultSize={75}>
              <div className="flex flex-col">
                {/* Video Player */}
                <div className="flex-1 bg-black flex items-center justify-center min-h-0">
                  <div className={`w-full max-w-full max-h-full ${getAspectRatioClass(videoMetadata?.aspectRatio)}`}>
                    <ReactPlayer
                      ref={playerRef}
                      url={currentVideo?.url}
                      width="100%"
                      height="100%"
                      playing={isPlaying}
                      onProgress={handleProgress}
                      onDuration={handleDuration}
                      controls={false}
                    />
                  </div>
                </div>

                {/* Timeline */}
                <div className="h-80 border-t bg-card flex-shrink-0 overflow-y-auto">
                  <div className="p-6">
                    <VideoTimeline
                      duration={duration}
                      currentTime={deferredCurrentTime}
                      trimStart={trimStart}
                      trimEnd={trimEnd}
                      onTrimChange={handleTrimChange}
                      onSeek={handleSeek}
                      waveformData={currentVideo?.waveformData || []}
                      waveformImagePath={currentVideo?.waveformImagePath}
                      waveformImageDimensions={currentVideo?.waveformImageDimensions}
                    />
                  </div>
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>



        {/* Large File Confirmation Dialog */}
        <Dialog open={showLargeFileConfirmDialog} onOpenChange={setShowLargeFileConfirmDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-600">
                <Clock className="h-5 w-5" />
                Large File Processing
              </DialogTitle>
              <DialogDescription className="space-y-3 text-left">
                <p>This is a large file ({largeFileSize.toFixed(2)} GB).</p>
                <p>Processing may take several minutes depending on your system and the complexity of the trim.</p>
                <p>The application may appear unresponsive during processing. Please be patient.</p>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button 
                variant="outline" 
                onClick={() => setShowLargeFileConfirmDialog(false)}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleConfirmLargeFile}
                className="bg-amber-600 hover:bg-amber-700"
              >
                Continue Processing
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>


      </div>
    </TooltipProvider>
  )
} 