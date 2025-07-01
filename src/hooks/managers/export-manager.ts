import { toast } from 'sonner'

import type { ExportManager, QualitySettings } from '../../types/video-editor-mediator.types'
import { yaffwApi } from '../../utils/apiClient'

export const createExportManager: ExportManager = (state, setState, utils) => {
  const { showError, downloadVideo } = utils

  // Wait for background commit to complete
  const waitForBackgroundCommit = async (): Promise<void> => {
    return new Promise((resolve, reject) => {
      const maxWaitTime = 300000 // 5 minutes timeout
      const startTime = Date.now()
      
      const checkCommitStatus = () => {
        // Check if commit completed successfully
        if (state.isCommitComplete && state.currentVideo?.serverFilePath) {
          console.log('✅ Background commit completed while waiting')
          resolve()
          return
        }
        
        // Check if commit failed (no longer committing but also not complete)
        if (!state.isCommittingToServer && !state.isCommitComplete) {
          console.log('❌ Background commit failed while waiting')
          reject(new Error('Background commit failed'))
          return
        }
        
        // Check timeout
        if (Date.now() - startTime > maxWaitTime) {
          console.log('⏰ Background commit timeout')
          reject(new Error('Background commit timeout'))
          return
        }
        
        // Still in progress, check again in 500ms
        setTimeout(checkCommitStatus, 500)
      }
      
      checkCommitStatus()
    })
  }

  const handleTrimVideo = async () => {
    const { currentVideo, trimStart, trimEnd } = state
    
    if (!currentVideo) {
      showError('No video loaded')
      return
    }
    
    setState({ isProcessing: true })
    
    try {
      // Use server file path if available, otherwise we'll need to upload first
      const filePath = currentVideo.serverFilePath
      
      if (!filePath) {
        // This shouldn't happen in normal flow since we commit to server on load
        // But if it does, we need to handle it
        throw new Error('Video not yet committed to server. Please wait for upload to complete.')
      }

      console.log('🔄 Trimming video:', filePath)
      console.log(`📐 Trim range: ${trimStart}s - ${trimEnd}s`)
      
      const response = await yaffwApi.trimVideo({
        filePath,
        start: trimStart,
        end: trimEnd,
        fileName: currentVideo.file.name
      })
      
      // Server returns blob response directly, not JSON
      if (response.status !== 200) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`)
      }

      // Create download blob from response data
      const videoBlob = response.data
      
      // Download the trimmed video
      downloadVideo(videoBlob, currentVideo.file.name)
      
      console.log('✅ Video trimmed and downloaded successfully')
      
    } catch (error) {
      console.error('❌ Trim operation failed:', error)
      showError('Video trimming failed', error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setState({ isProcessing: false })
    }
  }

  const handleExportWithQuality = async (qualitySettings: QualitySettings) => {
    const { currentVideo, trimStart, trimEnd } = state
    
    if (!currentVideo) {
      showError('No video loaded')
      return
    }
    
    setState({ isProcessing: true })
    
    try {
      const filePath = currentVideo.serverFilePath
      
      if (!filePath) {
        throw new Error('Video not yet committed to server. Please wait for upload to complete.')
      }

      console.log('🎬 Exporting video with quality settings:', qualitySettings)
      console.log(`📐 Trim range: ${trimStart}s - ${trimEnd}s`)
      
      const response = await yaffwApi.trimVideo({
        filePath,
        start: trimStart,
        end: trimEnd,
        fileName: currentVideo.file.name,
        qualitySettings
      })
      
      // Server returns blob response directly, not JSON
      if (response.status !== 200) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`)
      }

      const videoBlob = response.data
      downloadVideo(videoBlob, currentVideo.file.name)
      
      console.log('✅ Video exported with quality settings successfully')
      
    } catch (error) {
      console.error('❌ Export operation failed:', error)
      showError('Video export failed', error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setState({ isProcessing: false })
    }
  }

  const handleConfirmLargeFile = async () => {
    // Same as handleTrimVideo but for large files
    await handleTrimVideo()
  }

  return {
    handleTrimVideo,
    handleExportWithQuality,
    handleConfirmLargeFile
  }
} 