import { startTransition } from 'react'
import { toast } from 'sonner'

import type { FileManager } from '../../types/video-editor-mediator.types'
import { cleanupLocalFile, commitFileToServer, generateServerWaveform, processVideoLocally } from '../../utils/localFileProcessor'
import { downloadVideoFromUrl } from '../../utils/urlDownloader'
import { extractDetailedVideoMetadata } from '../../utils/videoMetadata'

export const createFileManager: FileManager = (state, setState, utils) => {
  const { showError, resetAllVideoState } = utils

  const onFileDrop = async (acceptedFiles: File[]) => {
    const videoFile = acceptedFiles[0]
    if (!videoFile?.type.startsWith('video/')) return

    setState({ isUploading: true, uploadProgress: 0 })
    
    try {
      // Process file locally for immediate preview
      const localVideo = await processVideoLocally(videoFile)
      
      startTransition(() => {
        setState({ currentVideo: localVideo })
      })
      
      // Generate server-side waveform in the background for better quality
      generateServerWaveform(videoFile).then((serverWaveform) => {
        if (serverWaveform.waveformImagePath) {
          startTransition(() => {
            setState({ 
              currentVideo: state.currentVideo ? {
                ...state.currentVideo,
                waveformImagePath: serverWaveform.waveformImagePath,
                waveformImageDimensions: serverWaveform.waveformImageDimensions,
                waveformData: serverWaveform.waveformData || state.currentVideo.waveformData
              } : null
            })
          })
        }
      }).catch(err => {
        console.warn('Server waveform generation failed:', err)
      })
      
      // Extract detailed metadata for analytics
      extractDetailedVideoMetadata(videoFile).then((metadata) => {
        startTransition(() => {
          setState({ videoMetadata: metadata })
        })
      })
      
      setState({ isUploading: false, uploadProgress: 100 })
      
      // Reset progress after a short delay for UX
      setTimeout(() => {
        setState({ uploadProgress: 0 })
      }, 1000)
      
      // Show success toast
      toast.success("File uploaded successfully!", {
        description: `Loaded ${videoFile.name}`,
      })
      
    } catch (error) {
      showError('File Processing Failed', error instanceof Error ? error.message : 'Unknown error')
      resetAllVideoState()
      setState({ isUploading: false, uploadProgress: 0 })
    }
  }

  const onUrlDownload = async (url: string) => {
    setState({ isDownloading: true, uploadProgress: 0 })

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
        
        const serverWaveformData = (response.waveformData || [])
        
        // Add server file path and use server-generated waveform (it's better quality)
        const localVideoWithServerPath = {
          ...localVideo,
          waveformData: serverWaveformData.length > 0 ? serverWaveformData : localVideo.waveformData,
          serverFilePath: response.filePath,
          waveformImagePath: response.waveformImagePath,
          waveformImageDimensions: response.waveformImageDimensions
        }

        startTransition(() => {
          setState({ currentVideo: localVideoWithServerPath })
        })
        
        // Extract detailed metadata for analytics (like we do for uploads)
        extractDetailedVideoMetadata(videoFile).then((metadata) => {
          startTransition(() => {
            setState({ videoMetadata: metadata })
          })
        }).catch(err => {
          console.warn('Failed to extract detailed metadata:', err)
          // Fallback to server metadata if detailed extraction fails
          startTransition(() => {
            setState({ videoMetadata: response.metadata || {} })
          })
        })

        setState({ uploadProgress: 100 })
        
        // Reset progress after a short delay for UX
        setTimeout(() => {
          setState({ uploadProgress: 0 })
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
      setState({ uploadProgress: 0 })
    } finally {
      setState({ isDownloading: false })
    }
  }

  const handleLoadNewVideo = async () => {
    // Early return if no current video
    if (!state.currentVideo) {
      return
    }
    
    setState({ isDeleting: true })

    // Clean up local resources
    cleanupLocalFile(state.currentVideo)

    // Delete server file if it exists
    if (state.currentVideo.serverFilePath) {
      try {
        const response = await fetch('http://localhost:3001/api/delete-video', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filePath: state.currentVideo.serverFilePath,
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
    setState({ isDeleting: false })
  }

  return {
    onFileDrop,
    onUrlDownload,
    handleLoadNewVideo
  }
} 