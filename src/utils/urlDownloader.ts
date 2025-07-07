import axios from 'axios'
import { apiClient } from './apiClient'

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

    // Step 2: Use SSE with polling fallback for real-time progress updates
    const result = await apiClient.trackProgress<DownloadResponse>(progressId, onProgress)
    console.log('✅ Download completed successfully!')
    return result

  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorData = error.response?.data as DownloadError
      throw new Error(errorData?.details || errorData?.error || 'Failed to start download')
    }
    throw error
  }
} 