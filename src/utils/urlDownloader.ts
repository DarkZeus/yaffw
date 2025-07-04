import axios from 'axios'

export type DownloadResponse = {
  success: boolean
  filePath: string
  originalFileName: string
  uniqueFileName: string
  message: string
  metadata: unknown
  waveformData: Array<{time: number, amplitude: number}>
  waveformImagePath?: string
  waveformImageDimensions?: { width: number; height: number }
  hasAudio?: boolean
  source: string
}

export type DownloadError = {
  error: string
  details?: string
}

export type ProgressResponse = {
  progress: number
  message: string
  speed?: number
  timestamp: number
  completed?: boolean
  result?: DownloadResponse
  error?: string
}

export type ProgressStartResponse = {
  progressId: string
  message: string
}

export const downloadVideoFromUrl = async (
  url: string, 
  onProgress?: (progress: number, message: string, speed?: number) => void
): Promise<DownloadResponse> => {
  try {
    // Step 1: Start the download and get progress ID
    const startResponse = await axios.post<ProgressStartResponse>('http://localhost:3001/api/download/from-url', {
      url
    }, {
      timeout: 10000, // Short timeout for initial request
      headers: {
        'Content-Type': 'application/json'
      }
    })

    const { progressId } = startResponse.data
    console.log('🚀 Download started with progress ID:', progressId)

    // Step 2: Poll for progress updates
    return new Promise((resolve, reject) => {
      const pollInterval = setInterval(async () => {
        try {
          const progressResponse = await axios.get<ProgressResponse>(
            `http://localhost:3001/api/download/progress/${progressId}`,
            { timeout: 5000 }
          )

          const progressData = progressResponse.data
          console.log(`📊 Progress update: ${progressData.progress}% - ${progressData.message}`)

          // Call progress callback if provided
          if (onProgress) {
            onProgress(progressData.progress, progressData.message, progressData.speed)
          }

          // Check if completed
          if (progressData.completed) {
            clearInterval(pollInterval)
            
            if (progressData.error) {
              reject(new Error(progressData.error))
            } else if (progressData.result) {
              console.log('✅ Download completed successfully!')
              resolve(progressData.result)
            } else {
              reject(new Error('Download completed but no result available'))
            }
          }
        } catch (pollError) {
          if (axios.isAxiosError(pollError)) {
            if (pollError.response?.status === 404) {
              // Progress not found - might be cleaned up or never existed
              clearInterval(pollInterval)
              reject(new Error('Download progress lost or expired'))
            } else {
              console.warn('⚠️ Progress polling error:', pollError.message)
              // Continue polling for transient errors
            }
          } else {
            console.warn('⚠️ Unexpected polling error:', pollError)
          }
        }
      }, 1000) // Poll every second

      // Set maximum polling time (2 minutes)
      setTimeout(() => {
        clearInterval(pollInterval)
        reject(new Error('Download timeout - no progress updates received'))
      }, 120000)
    })

  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorData = error.response?.data as DownloadError
      throw new Error(errorData?.details || errorData?.error || 'Failed to start download')
    }
    throw error
  }
} 