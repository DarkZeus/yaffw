import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios'
import { createSSEProgressTracker } from './sseClient'

// Base API configuration
const API_BASE_URL = 'http://localhost:3001/api'
const DEFAULT_TIMEOUT = 10000 // 10 seconds

// Response types for different endpoints
export type DeleteVideoResponse = {
  success: boolean
  message?: string
  error?: string
}

export type CleanupResponse = {
  success: boolean
  message?: string
  deletedCount?: number
  error?: string
}

export type WaveformResponse = {
  waveformImagePath?: string
  waveformImageDimensions?: { width: number; height: number }
  waveformData?: Array<{ time: number; amplitude: number }>
}

// Create axios instance with common configuration
const apiInstance: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: DEFAULT_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor for logging and common headers
apiInstance.interceptors.request.use(
  (config) => {
    console.log(`🌐 API Request: ${config.method?.toUpperCase()} ${config.url}`)
    return config
  },
  (error) => {
    console.error('❌ API Request Error:', error)
    return Promise.reject(error)
  }
)

// Response interceptor for logging and error handling
apiInstance.interceptors.response.use(
  (response: AxiosResponse) => {
    console.log(`✅ API Response: ${response.status} ${response.config.url}`)
    return response
  },
  (error) => {
    // Use detailed error message when available, fallback to generic error
    const errorMessage = error.response?.data?.details || error.response?.data?.error || error.message || 'API request failed'
    console.error(`❌ API Error: ${error.response?.status || 'Network'} ${error.config?.url}`, errorMessage)
    return Promise.reject(new Error(errorMessage))
  }
)

// Quality settings type for video operations
type QualitySettings = {
  resolution?: string
  bitrate?: number
  codec?: string
  useGpuAcceleration?: boolean
  gpuVendor?: string
}

// API client methods
export const apiClient = {
  // GET request
  get: async <T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    const response = await apiInstance.get<T>(url, config)
    return response.data
  },

  // POST request
  post: async <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> => {
    const response = await apiInstance.post<T>(url, data, config)
    return response.data
  },

  // PUT request
  put: async <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> => {
    const response = await apiInstance.put<T>(url, data, config)
    return response.data
  },

  // DELETE request
  delete: async <T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    const response = await apiInstance.delete<T>(url, config)
    return response.data
  },

  // PATCH request
  patch: async <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> => {
    const response = await apiInstance.patch<T>(url, data, config)
    return response.data
  },

  // Raw axios instance for advanced usage
  instance: apiInstance,

  // SSE progress tracking with polling fallback
  trackProgress: async <T = unknown>(
    progressId: string, 
    onProgress?: (progress: number, message: string, speed?: number) => void
  ): Promise<T> => {
    try {
      // Try SSE first
      const result = await createSSEProgressTracker(progressId, onProgress)
      return result as T
    } catch (sseError) {
      console.warn('⚠️ SSE failed, falling back to polling:', sseError)
      
      // Fallback to polling
      return new Promise((resolve, reject) => {
        const pollInterval = setInterval(async () => {
          try {
            const progressResponse = await apiInstance.get<{
              progress: number
              message: string
              speed?: number
              timestamp: number
              completed?: boolean
              result?: T
              error?: string
            }>(`/download/progress/${progressId}`, { timeout: 5000 })

            const progressData = progressResponse.data
            console.log(`📊 Polling progress: ${progressData.progress}% - ${progressData.message}`)

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
                console.log('✅ Polling completed successfully!')
                resolve(progressData.result)
              } else {
                reject(new Error('Download completed but no result available'))
              }
            }
          } catch (pollError) {
            if (axios.isAxiosError(pollError)) {
              if (pollError.response?.status === 404) {
                clearInterval(pollInterval)
                reject(new Error('Download progress lost or expired'))
              } else {
                console.warn('⚠️ Progress polling error:', pollError.message)
              }
            } else {
              console.warn('⚠️ Unexpected polling error:', pollError)
            }
          }
        }, 1000) // Poll every second

        // Set maximum polling time (5 minutes)
        setTimeout(() => {
          clearInterval(pollInterval)
          reject(new Error('Progress tracking timeout - no updates received'))
        }, 5 * 60 * 1000)
      })
    }
  }
}

// Specialized API methods for common YAFFW operations
export const yaffwApi = {
  // Video operations
  trimVideo: async (payload: {
    filePath: string
    start: number
    end: number
    fileName?: string
    qualitySettings?: QualitySettings
  }) => {
    // Map to server-expected parameter names and add fileName
    const serverPayload = {
      filePath: payload.filePath,
      startTime: payload.start,
      endTime: payload.end,
      fileName: payload.fileName || 'video.mp4' // Default filename if not provided
    }
    
    // Server returns streaming video file, not JSON
    return apiInstance.post('/trim-video', serverPayload, {
      timeout: 5 * 60 * 1000, // 5 minutes for video processing
      responseType: 'blob', // Handle as blob response
    })
  },

  deleteVideo: async (filePath: string): Promise<DeleteVideoResponse> => {
    return apiClient.delete<DeleteVideoResponse>('/delete-video', {
      data: { filePath }
    })
  },

  // File operations
  cleanupOldFiles: async (): Promise<CleanupResponse> => {
    return apiClient.post<CleanupResponse>('/cleanup-old-files', { action: 'cleanup' }, {
      timeout: 30000, // 30 seconds for cleanup
    })
  },

  generateWaveform: async (file: File): Promise<WaveformResponse> => {
    return apiClient.post<WaveformResponse>('/generate-waveform', file, {
      headers: {
        'x-filename': file.name,
        'Content-Type': 'application/octet-stream',
      },
      timeout: 2 * 60 * 1000, // 2 minutes for waveform generation
    })
  },

  // Stream operations
  getVideoStream: async (fileName: string) => {
    // Return the full response for streaming
    return apiInstance.get(`/stream/${fileName}`, {
      responseType: 'blob', // For video streaming
    })
  },
}

// Export types for TypeScript support
export type ApiResponse<T = unknown> = T
export type ApiError = Error

// Utility function to check if error is from API
export const isApiError = (error: unknown): error is ApiError => {
  return error instanceof Error
} 