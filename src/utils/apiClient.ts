import axios, {type AxiosInstance, type AxiosRequestConfig, type AxiosResponse} from 'axios'
import {createSSEProgressTracker} from './sseClient'

// Base API configuration
const API_BASE_URL = 'http://localhost:3001/api'
const DEFAULT_TIMEOUT = 10000 // 10 seconds

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

// Export types for TypeScript support
export type ApiResponse<T = unknown> = T
export type ApiError = Error

// Utility function to check if error is from API
export const isApiError = (error: unknown): error is ApiError => {
  return error instanceof Error
}
