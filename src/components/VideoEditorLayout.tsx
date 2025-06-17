import { 
  BarChart3,
  Download, 
  Home, 
  Keyboard,
  Maximize2,
  Minimize2,
  Pause, 
  Play, 
  RotateCcw,
  Scissors, 
  Settings,
  SkipBack, 
  SkipForward, 
  Sliders,
  Square
} from 'lucide-react'
import React, { useState, useRef, useTransition, useDeferredValue } from 'react'
import ReactPlayer from 'react-player'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { axiosUpload as streamingUpload } from '../utils/axiosUpload'
import { type VideoMetadata, extractDetailedVideoMetadata } from '../utils/videoMetadata'
import { FileDropZone } from './FileDropZone'
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp'
import { UploadProgress } from './UploadProgress'
import { VideoAnalytics } from './VideoAnalytics'
import { VideoTimeline } from './VideoTimeline'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './ui/resizable'
import { Separator } from './ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'

interface VideoFile {
  file: File
  url: string
  duration: number
  filePath?: string
}

export function VideoEditorLayout() {
  const [currentVideo, setCurrentVideo] = useState<VideoFile | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(100)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata>({})
  const playerRef = useRef<ReactPlayer>(null)

  // React 19 performance optimizations
  const [isPending, startTransition] = useTransition()
  const deferredUploadProgress = useDeferredValue(uploadProgress)
  const deferredCurrentTime = useDeferredValue(currentTime)

  const handleTrimChange = (start: number, end: number) => {
    setTrimStart(start)
    setTrimEnd(end)
  }

  const onDrop = async (acceptedFiles: File[]) => {
    const videoFile = acceptedFiles[0]
    if (videoFile?.type.startsWith('video/')) {
      const url = URL.createObjectURL(videoFile)
      const newVideo: VideoFile = {
        file: videoFile,
        url,
        duration: 0
      }
      
      startTransition(() => {
        setCurrentVideo(newVideo)
      })
      
      // Client-side metadata extraction as fallback
      extractDetailedVideoMetadata(videoFile).then((metadata) => {
        startTransition(() => {
          setVideoMetadata(metadata)
        })
      })
      
      setIsUploading(true)
      setUploadProgress(0)
      
      try {
        await streamingUpload({
          file: videoFile,
          onProgress: (progress: number) => {
            startTransition(() => {
              setUploadProgress(progress)
            })
          },
          onComplete: (result) => {
            startTransition(() => {
              setCurrentVideo(prev => prev ? { ...prev, filePath: result.filePath } : null)
              
              // Use server metadata if available (more accurate than client estimation)
              if (result.metadata) {
                setVideoMetadata({
                  width: result.metadata.width,
                  height: result.metadata.height,
                  bitrate: result.metadata.bitrate,
                  codec: result.metadata.videoCodec,
                  fps: result.metadata.fps,
                  audioCodec: result.metadata.audioCodec,
                  audioBitrate: result.metadata.audioBitrate,
                  audioChannels: result.metadata.audioChannels,
                  audioSampleRate: result.metadata.audioSampleRate,
                  hasAudio: result.metadata.hasAudio,
                  aspectRatio: result.metadata.aspectRatio,
                  pixelFormat: result.metadata.pixelFormat,
                  profile: result.metadata.profile,
                })
              }
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

  const handleTrimVideo = async () => {
    if (!currentVideo || !currentVideo.filePath) {
      alert('Please wait for the video upload to complete before trimming.')
      return
    }
    
    const fileSizeGB = currentVideo.file.size / (1024 * 1024 * 1024)
    
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

  if (!currentVideo) {
    return (
      <div className="h-dvh flex items-center justify-center bg-gray-50">
        <div className="max-w-2xl w-full p-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-center justify-center">
                <Scissors className="h-6 w-6" />
                Professional Video Editor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FileDropZone 
                onDrop={onDrop}
                isUploading={isUploading}
              />
                             <UploadProgress 
                 progress={uploadProgress}
                 isUploading={isUploading}
                 fileName={undefined}
               />
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50' : 'h-dvh'} bg-gray-900 text-white flex flex-col`}>
      {/* Top Toolbar */}
      <div className="bg-gray-800 border-b border-gray-700 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Scissors className="h-5 w-5 text-blue-400" />
              <span className="font-semibold">Yet Another FFmpeg Wrapper</span>
            </div>
            <Separator orientation="vertical" className="h-6" />
            <div className="text-sm text-gray-400">
              {currentVideo.file.name}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <KeyboardShortcutsHelp shortcuts={shortcuts} />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup direction="horizontal" className="h-full">
                     {/* Left Sidebar - Tabbed Interface */}
           <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
             <div className="h-full bg-gradient-to-b from-slate-900 to-slate-800 border-r border-slate-700">
               <Tabs defaultValue="controls" className="h-full flex flex-col">
                 <TabsList className="grid w-full grid-cols-2 bg-slate-800 border-b border-slate-700 rounded-none">
                   <TabsTrigger 
                     value="controls" 
                     className="flex items-center gap-2 data-[state=active]:bg-slate-700 data-[state=active]:text-white"
                   >
                     <Sliders className="h-4 w-4" />
                     Controls
                   </TabsTrigger>
                   <TabsTrigger 
                     value="analytics" 
                     className="flex items-center gap-2 data-[state=active]:bg-slate-700 data-[state=active]:text-white"
                   >
                     <BarChart3 className="h-4 w-4" />
                     Analytics
                   </TabsTrigger>
                 </TabsList>

                 <div className="flex-1 overflow-y-auto">
                   <TabsContent value="controls" className="p-4 space-y-4 m-0">
                     {/* Main Playback Control */}
                     <div className="text-center">
                       <Button
                         onClick={handlePlayPause}
                         size="lg"
                         className={`w-16 h-16 rounded-full shadow-lg transition-all duration-200 ${
                           isPlaying 
                             ? 'bg-orange-500 hover:bg-orange-400 shadow-orange-500/25' 
                             : 'bg-green-500 hover:bg-green-400 shadow-green-500/25'
                         }`}
                       >
                         {isPlaying ? <Pause className="h-8 w-8" /> : <Play className="h-8 w-8 ml-1" />}
                       </Button>
                       <p className="text-xs text-slate-400 mt-2">
                         {isPlaying ? 'Playing' : 'Paused'} • Space
                       </p>
                     </div>

                     <Separator className="bg-slate-700" />

                     {/* Quick Actions */}
                     <div className="space-y-3">
                       <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                         <SkipBack className="h-4 w-4" />
                         Navigation
                       </h3>
                       
                       <div className="grid grid-cols-4 gap-2">
                         <Button
                           variant="ghost"
                           size="sm"
                           onClick={handleJumpToStart}
                           className="h-10 bg-slate-800/50 hover:bg-slate-700 border border-slate-600 text-slate-300"
                           title="Jump to start (Home)"
                         >
                           <Home className="h-4 w-4" />
                         </Button>
                         <Button
                           variant="ghost"
                           size="sm"
                           onClick={handleSeekBackward}
                           className="h-10 bg-slate-800/50 hover:bg-slate-700 border border-slate-600 text-slate-300"
                           title="Seek backward 5s (←)"
                         >
                           <SkipBack className="h-4 w-4" />
                         </Button>
                         <Button
                           variant="ghost"
                           size="sm"
                           onClick={handleSeekForward}
                           className="h-10 bg-slate-800/50 hover:bg-slate-700 border border-slate-600 text-slate-300"
                           title="Seek forward 5s (→)"
                         >
                           <SkipForward className="h-4 w-4" />
                         </Button>
                         <Button
                           variant="ghost"
                           size="sm"
                           onClick={handleJumpToEnd}
                           className="h-10 bg-slate-800/50 hover:bg-slate-700 border border-slate-600 text-slate-300"
                           title="Jump to end (End)"
                         >
                           <Square className="h-4 w-4" />
                         </Button>
                       </div>
                     </div>

                     <Separator className="bg-slate-700" />

                     {/* Trim Controls */}
                     <div className="space-y-3">
                       <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                         <Scissors className="h-4 w-4" />
                         Trim Points
                       </h3>
                       
                       <div className="space-y-2">
                         <div className="grid grid-cols-2 gap-2">
                           <Button
                             onClick={handleSetTrimStart}
                             className="h-12 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 shadow-lg shadow-emerald-500/25 border-0"
                             title="Set trim start (J)"
                           >
                             <div className="text-center">
                               <div className="text-lg font-bold">J</div>
                               <div className="text-xs opacity-90">Start</div>
                             </div>
                           </Button>
                           <Button
                             onClick={handleSetTrimEnd}
                             className="h-12 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 shadow-lg shadow-emerald-500/25 border-0"
                             title="Set trim end (K)"
                           >
                             <div className="text-center">
                               <div className="text-lg font-bold">K</div>
                               <div className="text-xs opacity-90">End</div>
                             </div>
                           </Button>
                         </div>
                         
                         <div className="grid grid-cols-2 gap-2">
                           <Button
                             onClick={handleJumpToTrimStart}
                             variant="outline"
                             className="h-10 bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20 text-blue-300"
                             title="Jump to trim start (I)"
                           >
                             <div className="flex items-center gap-1">
                               <span className="font-bold">I</span>
                               <span className="text-xs">→Start</span>
                             </div>
                           </Button>
                           <Button
                             onClick={handleJumpToTrimEnd}
                             variant="outline"
                             className="h-10 bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20 text-blue-300"
                             title="Jump to trim end (O)"
                           >
                             <div className="flex items-center gap-1">
                               <span className="font-bold">O</span>
                               <span className="text-xs">→End</span>
                             </div>
                           </Button>
                         </div>

                         <Button
                           onClick={handleResetTrim}
                           variant="outline"
                           className="w-full h-10 bg-slate-800/50 border-slate-600 hover:bg-slate-700 text-slate-300"
                           title="Reset trim (R)"
                         >
                           <RotateCcw className="h-4 w-4 mr-2" />
                           Reset Trim
                         </Button>
                       </div>
                     </div>

                     <Separator className="bg-slate-700" />

                     {/* Export Section */}
                     <div className="space-y-3">
                       <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                         <Download className="h-4 w-4" />
                         Export
                       </h3>
                       
                       <Button
                         onClick={handleTrimVideo}
                         disabled={isProcessing || isUploading || !currentVideo?.filePath}
                         className="w-full h-12 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 shadow-lg shadow-red-500/25 disabled:from-gray-600 disabled:to-gray-500 disabled:shadow-none"
                         title="Export video (Enter)"
                       >
                         {isProcessing ? (
                           <div className="flex items-center gap-2">
                             <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                             <span>Processing...</span>
                           </div>
                         ) : (
                           <div className="flex items-center gap-2">
                             <Download className="h-5 w-5" />
                             <span className="font-medium">Export Video</span>
                           </div>
                         )}
                       </Button>
                     </div>

                     <Separator className="bg-slate-700" />

                     {/* Status & Info */}
                     <div className="space-y-3">
                       <h3 className="text-sm font-medium text-slate-300">Status</h3>
                       
                       <div className="space-y-2 text-sm">
                         <div className="flex items-center justify-between">
                           <span className="text-slate-400">Shortcuts</span>
                           <div className="flex items-center gap-2">
                             <div className={`w-2 h-2 rounded-full ${
                               !!currentVideo && !isProcessing && !isUploading 
                                 ? 'bg-green-400 animate-pulse shadow-sm shadow-green-400' 
                                 : 'bg-slate-500'
                             }`} />
                             <span className={`text-xs ${
                               !!currentVideo && !isProcessing && !isUploading 
                                 ? 'text-green-400' 
                                 : 'text-slate-500'
                             }`}>
                               {!!currentVideo && !isProcessing && !isUploading ? 'Active' : 'Disabled'}
                             </span>
                           </div>
                         </div>
                         
                         <div className="flex items-center justify-between">
                           <span className="text-slate-400">Duration</span>
                           <span className="text-slate-300 font-mono text-xs">
                             {Math.floor(duration / 60)}:{(Math.floor(duration % 60)).toString().padStart(2, '0')}
                           </span>
                         </div>
                         
                         <div className="flex items-center justify-between">
                           <span className="text-slate-400">Selection</span>
                           <span className="text-emerald-400 font-mono text-xs">
                             {(trimEnd - trimStart).toFixed(1)}s
                           </span>
                         </div>

                         <div className="flex items-center justify-between">
                           <span className="text-slate-400">Progress</span>
                           <span className="text-blue-400 font-mono text-xs">
                             {Math.round(((trimEnd - trimStart) / duration) * 100) || 0}%
                           </span>
                         </div>
                       </div>
                     </div>

                     {/* Quick Reset */}
                     <Button
                       onClick={() => setCurrentVideo(null)}
                       variant="ghost"
                       className="w-full h-10 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-slate-700"
                     >
                       <Square className="h-4 w-4 mr-2" />
                       Load New Video
                     </Button>
                   </TabsContent>

                   <TabsContent value="analytics" className="p-4 m-0">
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
          <ResizablePanel defaultSize={80}>
            <div className="h-full flex flex-col overflow-hidden">
              {/* Video Player */}
              <div className="flex-1 bg-black flex items-center justify-center min-h-0">
                <div className="w-full h-full max-w-none">
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

              {/* Timeline - Adequate Height for Full Component */}
              <div className="h-80 bg-gradient-to-b from-slate-800 to-slate-900 border-t border-slate-600 flex-shrink-0 overflow-y-auto">
                <div className="p-6">
                  <VideoTimeline
                    duration={duration}
                    currentTime={deferredCurrentTime}
                    trimStart={trimStart}
                    trimEnd={trimEnd}
                    onTrimChange={handleTrimChange}
                    onSeek={handleSeek}
                  />
                </div>
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  )
} 