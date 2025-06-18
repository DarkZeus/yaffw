import axios from 'axios'

export type DownloadResponse = {
  success: boolean
  filePath: string
  originalFileName: string
  uniqueFileName: string
  message: string
  metadata: any
  waveformData: Array<{time: number, amplitude: number}>
  waveformImagePath?: string
  waveformImageDimensions?: { width: number; height: number }
  source: string
}

export type DownloadError = {
  error: string
  details?: string
}

export const downloadVideoFromUrl = async (url: string): Promise<DownloadResponse> => {
  try {
    const response = await axios.post<DownloadResponse>('http://localhost:3001/api/download/from-url', {
      url
    }, {
      timeout: 120000, // 2 minutes timeout for downloads
      headers: {
        'Content-Type': 'application/json'
      }
    })

    return response.data
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorData = error.response?.data as DownloadError
      throw new Error(errorData?.details || errorData?.error || 'Failed to download video')
    }
    throw error
  }
} 