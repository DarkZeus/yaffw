import { toast } from 'sonner'

import type { ExportManager, QualitySettings } from '../../types/video-editor-mediator.types'
import { commitFileToServer } from '../../utils/localFileProcessor'

export const createExportManager: ExportManager = (state, setState, utils) => {
  const { showError, downloadVideo } = utils

  const handleTrimVideo = async () => {
    if (!state.currentVideo) {
      showError('No Video', 'Please select a video file first.')
      return
    }

    // Show quality modal instead of directly processing
    setState({ showQualityModal: true })
  }

  const handleExportWithQuality = async (qualitySettings: QualitySettings) => {
    if (!state.currentVideo) return
    
    // Close quality modal first
    setState({ showQualityModal: false })
    
    // If file hasn't been committed to server yet, commit it first
    if (!state.currentVideo.serverFilePath) {
      toast.info('Committing to Server', { description: 'Preparing file for processing...' })
      setState({ isUploading: true })
      
      try {
        const serverResult = await commitFileToServer(state.currentVideo, (progress) => {
          setState({ uploadProgress: progress })
        })
        
        // Update currentVideo with server file path and waveform data
        setState({
          currentVideo: state.currentVideo ? { 
            ...state.currentVideo, 
            serverFilePath: serverResult.filePath,
            waveformImagePath: serverResult.waveformImagePath,
            waveformImageDimensions: serverResult.waveformImageDimensions,
            // Use server waveform data if available, otherwise keep client-side data
            waveformData: serverResult.waveformData || state.currentVideo.waveformData
          } : null,
          isUploading: false,
          uploadProgress: 0
        })
        
        // Continue with trimming after commit
        await processVideoTrim(serverResult.filePath)
        return
        
      } catch (error) {
        showError('Commit Failed', error instanceof Error ? error.message : 'Unknown error')
        setState({ isUploading: false, uploadProgress: 0 })
        return
      }
    }
    
    const fileSizeGB = state.currentVideo.file.size / (1024 * 1024 * 1024)
    
    if (fileSizeGB > 1) {
      setState({ 
        largeFileSize: fileSizeGB,
        showLargeFileConfirmDialog: true 
      })
      return
    }
    
    await processVideoTrim(state.currentVideo.serverFilePath)
    
    // TODO: In the future, use qualitySettings to customize the export
    console.log('Quality settings selected:', qualitySettings)
  }

  const processVideoTrim = async (serverFilePath?: string) => {
    const filePath = serverFilePath || state.currentVideo?.serverFilePath
    if (!filePath || !state.currentVideo) return
    
    setState({ isProcessing: true })
    
    // Use functional approach without try/catch
    const response = await fetch('http://localhost:3001/api/trim-video', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filePath: filePath,
        startTime: state.trimStart,
        endTime: state.trimEnd,
        fileName: state.currentVideo.file.name,
      }),
    })
    
    // Handle error cases with early returns
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      const errorMessage = errorData?.error || `Server error: ${response.status}`
      const errorDetails = errorData?.details || 'Unknown error'
      showError(errorMessage, errorDetails)
      setState({ isProcessing: false })
      return
    }
    
    const blob = await response.blob()
    downloadVideo(blob, state.currentVideo.file.name)
    setState({ isProcessing: false })
  }

  const handleConfirmLargeFile = async () => {
    setState({ showLargeFileConfirmDialog: false })
    await processVideoTrim()
  }

  return {
    handleTrimVideo,
    handleExportWithQuality,
    handleConfirmLargeFile: handleConfirmLargeFile
  }
} 