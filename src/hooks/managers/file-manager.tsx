import { startTransition } from 'react'
import { toast } from 'sonner'

import { ProgressToast } from '../../components/ui/progress-toast'
import type { FileManager } from '../../types/video-editor-mediator.types'
import { yaffwApi } from '../../utils/apiClient'
import { type LocalVideoFile, cleanupLocalFile, commitFileToServer, generateServerWaveform, processVideoLocally } from '../../utils/localFileProcessor'
import { downloadVideoFromUrl } from '../../utils/urlDownloader'
import { type VideoMetadata, extractDetailedVideoMetadata } from '../../utils/videoMetadata'

export const createFileManager: FileManager = (state, setState, utils) => {
  const { showError, resetAllVideoState } = utils

  // Background commit function for local files
  const startBackgroundCommit = async (videoFile: File, localVideo: LocalVideoFile) => {
    console.log('🚀 Starting background commit to server...')
    setState({ 
      isCommittingToServer: true, 
      commitProgress: 0,
      isCommitComplete: false 
    })

    const toastId = 'background-commit-progress' // Fixed ID for consistent updates
    let lastUpdateTime = Date.now()
    let uploadSpeed = 0
    let lastProgress = 0
    
    console.log('🚀 Background commit progress tracking initialized')
    
    try {
      // Start with initial progress toast
      toast(
        <ProgressToast progress={0} message="Preparing file for export" />,
        {
          duration: Number.POSITIVE_INFINITY, // Don't auto-dismiss
          id: toastId
        }
      )

      const serverResult = await commitFileToServer(localVideo, (progress) => {
        console.log(`📊 Progress callback: ${progress.toFixed(1)}%`)
        setState({ commitProgress: progress })
        
        // Calculate upload speed (throttle calculation to avoid spam)
        const now = Date.now()
        if (now - lastUpdateTime > 200) { // Calculate speed every 200ms for smoother updates
          const timeDelta = (now - lastUpdateTime) / 1000
          const progressDelta = progress - lastProgress
          const fileSizeBytes = videoFile.size
          const bytesUploaded = (progressDelta / 100) * fileSizeBytes
          uploadSpeed = (bytesUploaded / (1024 * 1024)) / timeDelta // MB/s
          
          console.log(`⚡ Speed calculated: ${uploadSpeed.toFixed(1)} MB/s (${progressDelta.toFixed(1)}% in ${timeDelta.toFixed(1)}s)`)
          
          lastUpdateTime = now
          lastProgress = progress
        }
        
        // Update progress toast (update immediately, don't throttle)
        console.log(`🔄 Updating toast: ${progress.toFixed(1)}% (speed: ${uploadSpeed.toFixed(1)} MB/s)`)
        toast(
          <ProgressToast 
            progress={progress} 
            message="Preparing file for export" 
            speed={uploadSpeed > 0 ? uploadSpeed : undefined}
          />,
          {
            duration: Number.POSITIVE_INFINITY,
            id: toastId
          }
        )
      })
      
      console.log('✅ Background commit completed successfully')
      
      // Update current video with server file path and any improved data
      startTransition(() => {
        setState({ 
          currentVideo: localVideo ? {
            ...localVideo,
            serverFilePath: serverResult.filePath,
            // Use server waveform if available and better than current
            waveformImagePath: serverResult.waveformImagePath || localVideo.waveformImagePath,
            waveformImageDimensions: serverResult.waveformImageDimensions || localVideo.waveformImageDimensions,
            waveformData: serverResult.waveformData || localVideo.waveformData,
            hasAudio: serverResult.hasAudio ?? localVideo.hasAudio
          } : null,
          isCommittingToServer: false,
          commitProgress: 100,
          isCommitComplete: true
        })
      })
      
      // Show completion toast
      toast(
        <ProgressToast 
          progress={100} 
          message="File ready for export!" 
          isComplete={true}
        />,
        {
          duration: 3000, // Auto-dismiss after 3 seconds
          id: toastId
        }
      )
      
      // Reset commit progress after delay
      setTimeout(() => {
        setState({ commitProgress: 0 })
      }, 3000)
      
    } catch (error) {
      console.error('❌ Background commit failed:', error)
      setState({ 
        isCommittingToServer: false,
        commitProgress: 0,
        isCommitComplete: false
      })
      
      // Show error toast
      toast.error("Background commit failed", {
        description: "Will retry during export",
        id: toastId,
        duration: 4000
      })
      
      // Don't interrupt user flow, will fallback during export
      console.warn('Background commit failed, will retry during export:', error)
    }
  }

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
      
      // Store the local video reference to avoid stale closure
      const localVideoRef = localVideo
      
      // Generate server-side waveform in the background for better quality
      generateServerWaveform(videoFile).then((serverWaveform) => {
        if (serverWaveform.waveformImagePath) {
          startTransition(() => {
            setState({ 
              currentVideo: {
                ...localVideoRef,
                waveformImagePath: serverWaveform.waveformImagePath,
                waveformImageDimensions: serverWaveform.waveformImageDimensions,
                waveformData: serverWaveform.waveformData || localVideoRef.waveformData
              }
            })
          })
        }
      }).catch(err => {
        console.warn('Server waveform generation failed:', err)
      })
      
      // Extract detailed metadata for analytics
      extractDetailedVideoMetadata(videoFile).then((metadata) => {
        startTransition(() => {
          setState({ 
            videoMetadata: metadata,
            fps: metadata.fps || 30 // Use metadata FPS or fallback to 30
          })
        })
      })
      
      // Start background commit to server immediately after local processing
      startBackgroundCommit(videoFile, localVideoRef)
      
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
    if (!url.trim()) {
      showError('Please enter a valid URL')
      return
    }

    setState({ isDownloading: true, uploadProgress: 0 })

    const toastId = 'url-download-progress' // Fixed ID for consistent updates
    
    console.log('🌐 Starting URL download with progress tracking')

    try {
      // Start with initial progress toast
      toast(
        <ProgressToast progress={0} message="Starting download..." />,
        {
          duration: Number.POSITIVE_INFINITY, // Don't auto-dismiss
          id: toastId
        }
      )

      console.log('🌐 Starting download from URL:', url)
      
      // Download video from URL with progress tracking
      const response = await downloadVideoFromUrl(url, (progress, message, speed) => {
        console.log(`📊 Progress update: ${progress}% - ${message}`)
        setState({ uploadProgress: progress })
        
        // Update progress toast with real progress - using consistent ID
        toast(
          <ProgressToast 
            progress={progress} 
            message={message}
            speed={speed}
          />,
          {
            duration: Number.POSITIVE_INFINITY,
            id: toastId
          }
        )
      })
      
      if (response.success) {
        // Update progress - fetching video file
        toast(
          <ProgressToast 
            progress={96} 
            message="Fetching video file..." 
          />,
          {
            duration: Number.POSITIVE_INFINITY,
            id: toastId
          }
        )
        
        // Handle the streamed video response
        const videoResponse = await yaffwApi.getVideoStream(response.uniqueFileName)
        
        if (videoResponse.status !== 200) {
          throw new Error(`Failed to stream video: ${videoResponse.statusText}`)
        }

        // Update progress - creating file object
        toast(
          <ProgressToast 
            progress={98} 
            message="Creating file object..." 
          />,
          {
            duration: Number.POSITIVE_INFINITY,
            id: toastId
          }
        )

        // Create file from blob
        const videoBlob = videoResponse.data
        const videoFile = new File([videoBlob], response.originalFileName, {
          type: 'video/mp4' // Default content type for video files
        })

        // Process the video locally for immediate preview
        console.log('🔄 Processing downloaded video locally...')
        const localVideo = await processVideoLocally(videoFile)
        
        // Create enhanced local video with server data
        const enhancedLocalVideo: LocalVideoFile = {
          ...localVideo,
          waveformData: response.waveformData || localVideo.waveformData,
          waveformImagePath: response.waveformImagePath,
          waveformImageDimensions: response.waveformImageDimensions,
          serverFilePath: response.filePath,
          hasAudio: response.hasAudio ?? localVideo.hasAudio
        }
        
        // Set the processed video data with server enhancements
        startTransition(() => {
          setState({
            currentVideo: enhancedLocalVideo,
            trimEnd: enhancedLocalVideo.duration
          })
        })
        
        // Extract detailed metadata for analytics
        if (response.metadata) {
          startTransition(() => {
            setState({ videoMetadata: response.metadata as VideoMetadata })
          })
        } else {
          // Fallback to local metadata extraction
          extractDetailedVideoMetadata(videoFile).then((metadata) => {
            startTransition(() => {
              setState({ videoMetadata: metadata })
            })
          }).catch(err => {
            console.warn('Failed to extract detailed metadata:', err)
          })
        }

        setState({ uploadProgress: 100 })
        
        // Show completion toast
        toast(
          <ProgressToast 
            progress={100} 
            message="Video downloaded successfully!" 
            isComplete={true}
          />,
          {
            duration: 3000, // Auto-dismiss after 3 seconds
            id: toastId
          }
        )
        
        // Reset progress after a short delay for UX
        setTimeout(() => {
          setState({ uploadProgress: 0 })
        }, 3000)
        
      } else {
        throw new Error('Download failed')
      }
      
    } catch (error) {
      console.error('❌ URL download failed:', error)
      
      // Show error toast
      toast.error("Download failed", {
        description: error instanceof Error ? error.message : 'Unknown error',
        id: toastId,
        duration: 4000
      })
      
      showError('Download Failed', error instanceof Error ? error.message : 'Unknown error')
      setState({ uploadProgress: 0 })
    } finally {
      setState({ isDownloading: false })
    }
  }

  const handleLoadNewVideo = async () => {
    if (!state.currentVideo) return
    
    setState({ isDeleting: true })
    
    try {
      // Cleanup local resources
      cleanupLocalFile(state.currentVideo)
      
      // If we have a server file, delete it
      if (state.currentVideo.serverFilePath) {
        await yaffwApi.deleteVideo(state.currentVideo.serverFilePath)
        console.log('🗑️ Server file deleted successfully')
      }
      
      // Reset state
      resetAllVideoState()
      
      console.log('✅ Successfully cleaned up and reset for new video')
      
    } catch (error) {
      console.error('❌ Cleanup failed:', error)
      showError('Cleanup failed', error instanceof Error ? error.message : 'Unknown error')
    } finally {
      setState({ isDeleting: false })
    }
  }

  return {
    onFileDrop,
    onUrlDownload,
    handleLoadNewVideo
  }
} 