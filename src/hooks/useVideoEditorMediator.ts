import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import type ReactPlayer from 'react-player'
import { toast } from 'sonner'

import { DEFAULT_PLAYBACK_SPEED } from '../constants/video-player.constants'
import type { QualitySettings, VideoEditorMediator, VideoEditorState } from '../types/video-editor-mediator.types'
import { createExportManager } from './managers/export-manager'
import { createFileManager } from './managers/file-manager.tsx'
import { createTrimManager } from './managers/trim-manager'
import { createUIManager } from './managers/ui-manager'
import { createVideoManager } from './managers/video-manager'
import { useBeforeUnload } from './useBeforeUnload'

const initialState: VideoEditorState = {
  // Video state
  currentVideo: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  videoMetadata: {},
  playbackSpeed: DEFAULT_PLAYBACK_SPEED,
  fps: 30, // Default FPS, will be updated with actual video metadata
  
  // Trim state
  trimStart: 0,
  trimEnd: 0,
  
  // Processing state
  isUploading: false,
  isDownloading: false,
  isProcessing: false,
  isDeleting: false,
  uploadProgress: 0,
  // Background commit states
  isCommittingToServer: false,
  commitProgress: 0,
  isCommitComplete: false,
  
  // UI state
  isFullscreen: false,
  showQualityModal: false,
  showLargeFileConfirmDialog: false,
  largeFileSize: 0
}

export const useVideoEditorMediator = (onRestrictionError?: (error: string) => Promise<string | null>): VideoEditorMediator => {
  const [state, setState] = useState<VideoEditorState>(initialState)
  const [isPending, startTransition] = useTransition()
  
  // Refs
  const playerRef = useRef<ReactPlayer>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const volumeControlRef = useRef<{ updateState: (volume: number, isMuted: boolean) => void }>(null)
  const volumeRef = useRef(1)
  const isMutedRef = useRef(false)
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Optimized state updater using transitions for non-urgent updates
  const updateState = useCallback((updates: Partial<VideoEditorState>) => {
    const isUrgentUpdate = 'currentTime' in updates || 'isPlaying' in updates
    
    if (isUrgentUpdate) {
      setState(prev => ({ ...prev, ...updates }))
    } else {
      startTransition(() => {
        setState(prev => ({ ...prev, ...updates }))
      })
    }
  }, [])

  // Utility functions
  const showError = useCallback((message: string, details = '') => {
    toast.error(message, {
      description: details || undefined,
    })
  }, [])

  const resetAllVideoState = useCallback(() => {
    console.log('🧹 Cleaning up all video state and data')
    
    updateState({
      ...initialState,
      // Preserve UI state that shouldn't be reset
      isFullscreen: state.isFullscreen
    })
    
    if (playerRef.current) {
      playerRef.current.seekTo(0, 'seconds')
    }
    
    // Cleanup timeout
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current)
      clickTimeoutRef.current = null
    }
    
    console.log('✅ Video state cleanup complete')
  }, [state.isFullscreen, updateState])

  const downloadVideo = useCallback((blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trimmed_${fileName}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    toast.success("Video exported successfully!", {
      description: `Downloaded as trimmed_${fileName}`,
    })
  }, [])

  // Before unload protection - call updateListeners when relevant state changes
  const beforeUnloadHook = useBeforeUnload({
    state,
    onCleanup: resetAllVideoState
  })

  // Update listeners only when work status might have changed
  const prevStateRef = useRef<{
    hasVideo: boolean
    isProcessing: boolean
    hasTrim: boolean
  }>({ hasVideo: false, isProcessing: false, hasTrim: false })

  // Track state changes that affect work status
  const currentStateSnapshot = {
    hasVideo: !!state.currentVideo,
    isProcessing: state.isUploading || state.isDownloading || state.isProcessing || state.isCommittingToServer,
    hasTrim: state.trimStart > 0 || (state.trimEnd > 0 && !!state.currentVideo && state.trimEnd < state.currentVideo.duration)
  }

  // Only update listeners if relevant state changed
  if (
    prevStateRef.current.hasVideo !== currentStateSnapshot.hasVideo ||
    prevStateRef.current.isProcessing !== currentStateSnapshot.isProcessing ||
    prevStateRef.current.hasTrim !== currentStateSnapshot.hasTrim
  ) {
    prevStateRef.current = currentStateSnapshot
    beforeUnloadHook.updateListeners()
  }

  // Create managers
  const videoOps = createVideoManager(state, updateState, {
    playerRef,
    containerRef,
    volumeRef,
    isMutedRef,
    volumeControlRef
  })

  const trimOps = createTrimManager(state, updateState, playerRef, videoOps.handleSeek)

  const fileOps = createFileManager(state, updateState, {
    showError,
    resetAllVideoState,
    onRestrictionError
  })

  const exportOps = createExportManager(state, updateState, {
    showError,
    downloadVideo
  })

  const uiOps = createUIManager(state, updateState)

  return {
    state,
    videoOps,
    fileOps,
    trimOps,
    exportOps,
    uiOps,
    updateState,
    playerRef,
    containerRef,
    volumeControlRef
  }
} 