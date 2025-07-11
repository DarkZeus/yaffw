import { Scissors } from 'lucide-react'
import { useCallback, useDeferredValue, useState } from 'react'

import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useVideoEditorMediator } from '../hooks/useVideoEditorMediator'
import { getAspectRatioClass } from '../utils/aspect-ratio.utils'
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp'
import { UnifiedUploadZone } from './UnifiedUploadZone'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './ui/resizable'
import { Separator } from './ui/separator'
import { TooltipProvider } from './ui/tooltip'
import { ControlsSidebar } from './video-editor/ControlsSidebar'
import { ModalsSection } from './video-editor/ModalsSection'
import { TimelineSection } from './video-editor/TimelineSection'
import { VideoPlayerSection } from './video-editor/VideoPlayerSection'

export function VideoEditorLayout() {
  // Cookie management dialog state
  const [showCookieManagement, setShowCookieManagement] = useState(false)
  const [cookieUploadResolver, setCookieUploadResolver] = useState<((sessionId: string | null) => void) | null>(null)

  // Cookie restriction error handler
  const handleRestrictionError = useCallback(async (error: string): Promise<string | null> => {
    return new Promise((resolve) => {
      setCookieUploadResolver(() => resolve)
      setShowCookieManagement(true)
    })
  }, [])

  // Cookie management handlers
  const handleCloseCookieManagement = useCallback(() => {
    setShowCookieManagement(false)
    if (cookieUploadResolver) {
      cookieUploadResolver(null) // Resolve with null if dialog is closed without upload
      setCookieUploadResolver(null)
    }
  }, [cookieUploadResolver])

  const handleCookieUploaded = useCallback((sessionId: string) => {
    setShowCookieManagement(false)
    if (cookieUploadResolver) {
      cookieUploadResolver(sessionId)
      setCookieUploadResolver(null)
    }
  }, [cookieUploadResolver])

  const mediator = useVideoEditorMediator(handleRestrictionError)
  const { state, videoOps, fileOps, trimOps, exportOps, uiOps, playerRef, containerRef, volumeControlRef } = mediator

  // Performance optimization - defer non-urgent updates
  const deferredCurrentTime = useDeferredValue(state.currentTime)

  // Enhanced keyboard shortcuts with mediator operations
  const { shortcuts } = useKeyboardShortcuts({
    onPlayPause: videoOps.handlePlayPause,
    onSeek: videoOps.handleSeek,
    currentTime: state.currentTime,
    duration: state.duration,
    fps: state.fps,
    playerRef: playerRef,
    isPlaying: state.isPlaying,
    updateState: mediator.updateState, // Direct state updater for keyboard shortcuts
    onFrameSeek: videoOps.handleFrameSeek,
    onSetTrimStart: trimOps.handleSetTrimStart,
    onSetTrimEnd: trimOps.handleSetTrimEnd,
    onJumpToTrimStart: trimOps.handleJumpToTrimStart,
    onJumpToTrimEnd: trimOps.handleJumpToTrimEnd,
    trimStart: state.trimStart,
    trimEnd: state.trimEnd,
    onExport: exportOps.handleTrimVideo,
    onToggleMute: videoOps.handleToggleMute,
    onVolumeChange: videoOps.handleVolumeChange,
    onToggleFullscreen: videoOps.handleToggleFullscreen,
    onResetTrim: trimOps.handleResetTrim,
    enabled: !!state.currentVideo && !state.isProcessing && !state.isDeleting
  })

  // Early return for no video state
  if (!state.currentVideo) {
    return (
      <TooltipProvider>
        <div className="min-h-[calc(100dvh-1rem)] bg-background flex items-center justify-center px-6">
          <div className="w-full max-w-2xl">
            <UnifiedUploadZone 
              onFileDrop={fileOps.onFileDrop}
              onUrlDownload={fileOps.onUrlDownload}
              isUploading={state.isUploading}
              isDownloading={state.isDownloading}
              uploadProgress={state.uploadProgress}
            />
          </div>
        </div>

        {/* Cookie Management Dialog - needs to be available even when no video is loaded */}
        <ModalsSection
          uiState={{
            showQualityModal: false, // No quality modal when no video
            showLargeFileConfirmDialog: false, // No large file dialog when no video
            largeFileSize: 0,
            isFullscreen: false
          }}
          videoState={{
            videoMetadata: {}
          }}
          exportOps={exportOps}
          onCloseQualityModal={uiOps.handleCloseQualityModal}
          onToggleLargeFileDialog={uiOps.handleToggleLargeFileDialog}
          onConfirmLargeFile={exportOps.handleConfirmLargeFile}
          showCookieManagement={showCookieManagement}
          onCloseCookieManagement={handleCloseCookieManagement}
          onCookieUploaded={handleCookieUploaded}
        />
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      <div className={`${state.isFullscreen ? 'fixed inset-0 z-50' : 'min-h-[calc(100dvh-1rem)]'} bg-background flex flex-col`}>
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
                {state.currentVideo.file.name}
              </p>
            </div>
            <KeyboardShortcutsHelp shortcuts={shortcuts} />
          </div>
        </header>

        {/* Main Content with Resizable Panels */}
        <div className="flex-1 min-h-0">
          <ResizablePanelGroup direction="horizontal" className="!h-[calc(100dvh-64px)]">
            {/* Sidebar */}
            <ResizablePanel defaultSize={25} minSize={20} maxSize={35}>
              <ControlsSidebar 
                state={state}
                videoOps={videoOps}
                trimOps={trimOps}
                exportOps={exportOps}
                fileOps={fileOps}
              />
            </ResizablePanel>

            <ResizableHandle />

            {/* Main Video Area */}
            <ResizablePanel defaultSize={75}>
              <ResizablePanelGroup direction="vertical" className="min-h-[calc(100dvh-1rem)]">
                {/* Video Player Panel */}
                <ResizablePanel defaultSize={60} minSize={30}>
                  <VideoPlayerSection
                    ref={containerRef}
                    videoUrl={state.currentVideo.url}
                    isPlaying={state.isPlaying}
                    isFullscreen={state.isFullscreen}
                    aspectRatioClass={getAspectRatioClass(state.videoMetadata?.aspectRatio)}
                    playbackSpeed={state.playbackSpeed}
                    videoOps={videoOps}
                    playerRef={playerRef}
                    volumeControlRef={volumeControlRef}
                  />
                </ResizablePanel>

                <ResizableHandle />

                {/* Timeline Panel */}
                <ResizablePanel defaultSize={20} minSize={15}>
                  <TimelineSection
                    videoState={{
                      currentTime: state.currentTime,
                      duration: state.duration,
                      isPlaying: state.isPlaying,
                      playbackSpeed: state.playbackSpeed
                    }}
                    trimState={{
                      trimStart: state.trimStart,
                      trimEnd: state.trimEnd
                    }}
                    uiState={{
                      isFullscreen: state.isFullscreen
                    }}
                    currentVideo={state.currentVideo}
                    deferredCurrentTime={deferredCurrentTime}
                    videoOps={videoOps}
                    trimOps={trimOps}
                    playerRef={playerRef}
                  />
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

        {/* Modals */}
        <ModalsSection
          uiState={{
            showQualityModal: state.showQualityModal,
            showLargeFileConfirmDialog: state.showLargeFileConfirmDialog,
            largeFileSize: state.largeFileSize,
            isFullscreen: state.isFullscreen
          }}
          videoState={{
            videoMetadata: state.videoMetadata
          }}
          exportOps={exportOps}
          onCloseQualityModal={uiOps.handleCloseQualityModal}
          onToggleLargeFileDialog={uiOps.handleToggleLargeFileDialog}
          onConfirmLargeFile={exportOps.handleConfirmLargeFile}
          showCookieManagement={showCookieManagement}
          onCloseCookieManagement={handleCloseCookieManagement}
          onCookieUploaded={handleCookieUploaded}
        />
      </div>
    </TooltipProvider>
  )
} 