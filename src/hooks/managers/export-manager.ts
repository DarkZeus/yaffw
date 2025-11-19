import { toast } from 'sonner'

import type { ExportManager, QualitySettings } from '../../types/video-editor-mediator.types'
import { yaffwApi, getFileExtensionFromCodec } from '../../utils/apiClient'

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
          resolve()
          return
        }
        
        // Check if commit failed (no longer committing but also not complete)
        if (!state.isCommittingToServer && !state.isCommitComplete) {
          reject(new Error('Background commit failed'))
          return
        }
        
        // Check timeout
        if (Date.now() - startTime > maxWaitTime) {
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
      // Client-side trimming using Mediabunny
      const response = await yaffwApi.trimVideo({
        file: currentVideo.file,
        start: trimStart,
        end: trimEnd,
        fileName: currentVideo.file.name
      })
      
      if (response.status !== 200) {
        throw new Error(`Trimming error: ${response.status} ${response.statusText}`)
      }

      // Create download blob from response data
      const videoBlob = response.data
      
      // Download the trimmed video
      downloadVideo(videoBlob, currentVideo.file.name)
      
    } catch (error) {
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
      // Client-side trimming using Mediabunny with quality settings
      const response = await yaffwApi.trimVideo({
        file: currentVideo.file,
        start: trimStart,
        end: trimEnd,
        fileName: currentVideo.file.name,
        qualitySettings
      })
      
      if (response.status !== 200) {
        throw new Error(`Export error: ${response.status} ${response.statusText}`)
      }

      const videoBlob = response.data
      
      // Update filename extension based on codec
      let fileName = currentVideo.file.name
      if (qualitySettings.codec) {
        const newExtension = getFileExtensionFromCodec(qualitySettings.codec)
        const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.'))
        fileName = nameWithoutExt + newExtension
      }
      
      downloadVideo(videoBlob, fileName)
      
    } catch (error) {
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