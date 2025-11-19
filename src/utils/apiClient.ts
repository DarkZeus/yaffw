import axios, {type AxiosInstance, type AxiosRequestConfig, type AxiosResponse} from 'axios'
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  MovOutputFormat,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat
} from 'mediabunny'
import {STANDARD_RESOLUTIONS} from '../constants/quality-modal.constants'
import {createSSEProgressTracker} from './sseClient'

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
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for logging and error handling
apiInstance.interceptors.response.use(
  (response: AxiosResponse) => {
    return response
  },
  (error) => {
    // Use detailed error message when available, fallback to generic error
    const errorMessage = error.response?.data?.details || error.response?.data?.error || error.message || 'API request failed'
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

// Utility to get file extension from codec
export const getFileExtensionFromCodec = (codec: string): string => {
  if (codec.includes('_webm')) return '.webm'
  if (codec.includes('_mov')) return '.mov'
  return '.mp4' // Default for h264_mp4, h265_mp4, av1
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
      
      // Check if this is a restriction error - if so, preserve it instead of falling back to polling
      const isRestrictionError = sseError instanceof Error && 'isRestrictionError' in sseError 
        ? (sseError as Error & { isRestrictionError?: boolean }).isRestrictionError 
        : false
      
      
      if (isRestrictionError) {
        // Don't fall back to polling for restriction errors - preserve the error with its flag
        throw sseError
      }
      
      
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
              }
            } else {
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
  // Video operations - client-side trimming using Mediabunny
  trimVideo: async (payload: {
    file: File
    start: number
    end: number
    fileName?: string
    qualitySettings?: QualitySettings
  }) => {
    const input = new Input({
      source: new BlobSource(payload.file),
      formats: ALL_FORMATS
    })
    
    const bufferTarget = new BufferTarget()
    
    // Map codec to output format and container
    const getOutputFormat = () => {
      if (!payload.qualitySettings?.codec) return new Mp4OutputFormat()
      
      const codec = payload.qualitySettings.codec
      if (codec.includes('_webm')) return new WebMOutputFormat()
      if (codec.includes('_mov')) return new MovOutputFormat()
      return new Mp4OutputFormat()
    }
    
    // Get MIME type based on codec
    const getMimeType = () => {
      if (!payload.qualitySettings?.codec) return 'video/mp4'
      
      const codec = payload.qualitySettings.codec
      if (codec.includes('_webm')) return 'video/webm'
      if (codec.includes('_mov')) return 'video/quicktime'
      return 'video/mp4'
    }
    
    const output = new Output({
      format: getOutputFormat(),
      target: bufferTarget
    })
    
    // Build video track configuration
    const videoConfig: Record<string, unknown> = {}
    
    // Apply resolution if specified and not 'original'
    if (payload.qualitySettings?.resolution && payload.qualitySettings.resolution !== 'original') {
      const resolutionOption = STANDARD_RESOLUTIONS.find(r => r.value === payload.qualitySettings.resolution)
      if (resolutionOption && resolutionOption.width > 0) {
        videoConfig.width = resolutionOption.width
        videoConfig.height = resolutionOption.height
        videoConfig.fit = 'contain'
      }
    }
    
    // Apply codec if specified (or default when bitrate is set)
    const codecMap: Record<string, string> = {
      'h264_mp4': 'avc',
      'h265_mp4': 'hevc',
      'vp8_webm': 'vp8',
      'vp9_webm': 'vp9',
      'h264_mov': 'avc',
      'h265_mov': 'hevc',
      'prores_mov': 'prores',
      'av1': 'av1'
    }
    
    if (payload.qualitySettings?.codec) {
      const mappedCodec = codecMap[payload.qualitySettings.codec]
      if (mappedCodec) {
        videoConfig.codec = mappedCodec
      }
    } else if (payload.qualitySettings?.bitrate) {
      videoConfig.codec = 'avc'
    }
    
    // Apply bitrate if specified - convert Mbps to bits per second (bps)
    if (payload.qualitySettings?.bitrate) {
      const BITRATE_MULTIPLIER = 2.2
      videoConfig.bitrate = (payload.qualitySettings.bitrate / BITRATE_MULTIPLIER) * 1_000_000
      videoConfig.bitrateMode = 'constant'
    }
    
    // GPU acceleration via hardwareAcceleration hint
    if (payload.qualitySettings?.useGpuAcceleration) {
      videoConfig.hardwareAcceleration = 'prefer-hardware'
    }
    
    // Force transcoding when quality settings are applied
    if (Object.keys(videoConfig).length > 0) {
      videoConfig.forceTranscode = true
    }
    

    const conversionConfig: any = {
      input,
      output,
      trim: {
        start: payload.start,
        end: payload.end
      }
    }
    
    if (Object.keys(videoConfig).length > 0) {
      conversionConfig.video = videoConfig
    }
    
    // Explicitly pass through audio without modification
    conversionConfig.audio = {}
    
    const conversion = await Conversion.init(conversionConfig)
    
    await conversion.execute()
    
    const buffer = bufferTarget.buffer
    const blob = new Blob([buffer], { type: getMimeType() })
    
    return {
      status: 200,
      statusText: 'OK',
      data: blob
    }
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