import { useCallback, useRef } from 'react'
import type { VideoEditorState } from '../types/video-editor-mediator.types'
import { yaffwApi } from '../utils/apiClient'
import { cleanupLocalFile } from '../utils/localFileProcessor'

type UseBeforeUnloadOptions = {
  state: VideoEditorState
  onCleanup?: () => void
}

export const useBeforeUnload = ({ state, onCleanup }: UseBeforeUnloadOptions) => {
  const hasBeforeUnloadListener = useRef(false)

  // Determine if user has work in progress
  const hasWorkInProgress = useCallback(() => {
    const { 
      currentVideo, 
      isUploading, 
      isDownloading, 
      isProcessing, 
      isCommittingToServer,
      trimStart,
      trimEnd 
    } = state

    // No work if no video is loaded
    if (!currentVideo) return false

    // Has work if any processing is happening
    if (isUploading || isDownloading || isProcessing || isCommittingToServer) {
      return true
    }

    // Has work if user has set custom trim points
    const hasCustomTrim = trimStart > 0 || (trimEnd > 0 && trimEnd < currentVideo.duration)
    if (hasCustomTrim) return true

    // Otherwise, user just has a video loaded (minimal work)
    return true
  }, [state])

  // Trigger server cleanup using centralized API client
  const triggerServerCleanup = useCallback(async () => {
    try {
      await yaffwApi.cleanupOldFiles()
      console.log('🧹 Triggered server cleanup')
    } catch (error) {
      console.warn('Server cleanup failed:', error)
    }
  }, [])

  // Handle beforeunload event
  const handleBeforeUnload = useCallback((event: BeforeUnloadEvent) => {
    if (!hasWorkInProgress()) return

    // Modern browsers ignore custom messages and show their own
    const message = 'You have a video loaded with potential unsaved work. Are you sure you want to leave?'
    
    event.preventDefault()
    event.returnValue = message
    return message
  }, [hasWorkInProgress])

  // Handle page unload (when user confirms they want to leave)
  const handleUnload = useCallback(() => {
    const { currentVideo } = state
    
    if (currentVideo) {
      // Cleanup local file resources
      cleanupLocalFile(currentVideo)
      
      // Trigger server cleanup (best effort, may not complete due to page unload)
      if (currentVideo.serverFilePath) {
        // Use sendBeacon for better reliability on page unload
        const cleanupData = JSON.stringify({ action: 'cleanup' })
        if (navigator.sendBeacon) {
          navigator.sendBeacon('http://localhost:3001/api/cleanup-old-files', cleanupData)
        } else {
          // Fallback using API client (though may not complete due to page unload)
          triggerServerCleanup()
        }
      }
      
      // Trigger additional cleanup if provided
      onCleanup?.()
      
      console.log('🧹 Cleaned up resources before page unload')
    }
  }, [state, onCleanup, triggerServerCleanup])

  // Set up or remove event listeners based on work status
  const updateEventListeners = useCallback(() => {
    const shouldHaveListener = hasWorkInProgress()
    
    if (shouldHaveListener && !hasBeforeUnloadListener.current) {
      // Add listeners
      window.addEventListener('beforeunload', handleBeforeUnload)
      window.addEventListener('unload', handleUnload)
      hasBeforeUnloadListener.current = true
      console.log('🔒 Added beforeunload protection')
    } else if (!shouldHaveListener && hasBeforeUnloadListener.current) {
      // Remove listeners
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('unload', handleUnload)
      hasBeforeUnloadListener.current = false
      console.log('🔓 Removed beforeunload protection')
    }
  }, [hasWorkInProgress, handleBeforeUnload, handleUnload])

  // Cleanup function to remove listeners
  const cleanup = useCallback(() => {
    if (hasBeforeUnloadListener.current) {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('unload', handleUnload)
      hasBeforeUnloadListener.current = false
      console.log('🧹 Cleaned up beforeunload listeners')
    }
  }, [handleBeforeUnload, handleUnload])

  return {
    updateEventListeners,
    cleanup,
    hasWorkInProgress: hasWorkInProgress()
  }
} 