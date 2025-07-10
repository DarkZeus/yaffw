import axios from 'axios'
import { apiClient } from './apiClient'

// Helper function to detect Twitter URLs
const isTwitterUrl = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url)
    const hostname = parsedUrl.hostname.toLowerCase()
    
    // Check primary domain
    if (hostname === 'twitter.com') return true
    
    // Check alternative domains
    if (['x.com', 'vxtwitter.com', 'fixvx.com'].includes(hostname)) return true
    
    // Check subdomains
    if (hostname.includes('twitter.com')) return true
    
    return false
  } catch {
    return false
  }
}

type ProgressStartResponse = {
  progressId: string
  message: string
}

type DownloadResponse = {
  success: boolean
  filePath: string
  originalFileName: string
  uniqueFileName: string
  message: string
  metadata?: {
    duration?: number
    width?: number
    height?: number
    hasAudio?: boolean
    format?: string
  }
  waveformData?: number[]
  waveformImagePath?: string | null
  waveformImageDimensions?: {
    width: number
    height: number
  }
  hasAudio?: boolean
  source: string
}

type DownloadError = {
  error: string
  details?: string
}

type CookieUploadResponse = {
  success: boolean
  sessionId: string
  message: string
}

type TwitterDownloadOptions = {
  cookieSessionId?: string
}

// Upload cookie file for restricted Twitter content
export const uploadTwitterCookieFile = async (cookieFile: File): Promise<CookieUploadResponse> => {
  try {
    const formData = new FormData()
    formData.append('cookieFile', cookieFile)
    
    const response = await axios.post<CookieUploadResponse>('http://localhost:3001/api/twitter/upload-cookies', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    
    return response.data
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorData = error.response?.data as DownloadError
      throw new Error(errorData?.details || errorData?.error || 'Failed to upload cookie file')
    }
    throw error
  }
}

// Clean up cookie file session
export const cleanupCookieSession = async (sessionId: string): Promise<void> => {
  try {
    await axios.delete(`http://localhost:3001/api/twitter/cleanup-cookies/${sessionId}`)
  } catch (error) {
    console.warn('Failed to cleanup cookie session:', error)
  }
}

export const downloadVideoFromUrl = async (
  url: string, 
  onProgress?: (progress: number, message: string, speed?: number) => void,
  options?: TwitterDownloadOptions
): Promise<DownloadResponse> => {
  
  try {
    // Determine the correct endpoint based on URL type
    const isTwitter = isTwitterUrl(url)
    const endpoint = isTwitter 
      ? 'http://localhost:3001/api/twitter/from-twitter'
      : 'http://localhost:3001/api/download/from-url'
    
    // Prepare request body
    const requestBody: { url: string; cookieSessionId?: string } = { url }
    if (isTwitter && options?.cookieSessionId) {
      requestBody.cookieSessionId = options.cookieSessionId
    }
    
    // Step 1: Start the download and get progress ID
    const startResponse = await axios.post<ProgressStartResponse>(endpoint, requestBody, {
      timeout: 10000, // Short timeout for initial request
      headers: {
        'Content-Type': 'application/json'
      }
    })

    const { progressId } = startResponse.data

    // Step 2: Use SSE with polling fallback for real-time progress updates
    const result = await apiClient.trackProgress<DownloadResponse>(progressId, onProgress)
    return result

  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorData = error.response?.data as DownloadError
      throw new Error(errorData?.details || errorData?.error || 'Failed to start download')
    }
    throw error
  }
}

// Enhanced function specifically for Twitter downloads with restriction handling
export const downloadTwitterVideo = async (
  url: string,
  onProgress?: (progress: number, message: string, speed?: number) => void,
  onRestrictionError?: (error: string) => Promise<string | null> // Returns cookie session ID or null
): Promise<DownloadResponse> => {
  
  try {
    // First attempt without cookies
    return await downloadVideoFromUrl(url, onProgress)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    // Check if the error has the isRestrictionError flag from SSE
    const errorIsRestrictionError = error instanceof Error && 'isRestrictionError' in error 
      ? (error as Error & { isRestrictionError?: boolean }).isRestrictionError 
      : false
    
    // Also check the error message patterns as fallback
    const messageIsRestrictionError = errorMessage.toLowerCase().includes('private') ||
                                    errorMessage.toLowerCase().includes('restricted') ||
                                    errorMessage.toLowerCase().includes('unavailable') ||
                                    errorMessage.toLowerCase().includes('403') ||
                                    errorMessage.toLowerCase().includes('unauthorized') ||
                                    errorMessage.toLowerCase().includes('age-restricted') ||
                                    errorMessage.toLowerCase().includes('login required') ||
                                    errorMessage.toLowerCase().includes('requires authentication') ||
                                    errorMessage.toLowerCase().includes('nsfw tweet') ||
                                    errorMessage.toLowerCase().includes('use --cookies')
    
    const isRestrictionError = errorIsRestrictionError || messageIsRestrictionError
    
    if (isRestrictionError && onRestrictionError) {
      // Ask the user for a cookie file
      const cookieSessionId = await onRestrictionError(errorMessage)
      
      if (cookieSessionId) {
        try {
          // Retry with cookies
          const result = await downloadVideoFromUrl(url, onProgress, { cookieSessionId })
          
          // Clean up cookie session after successful download
          await cleanupCookieSession(cookieSessionId)
          
          return result
        } catch (retryError) {
          // Clean up cookie session after failed retry
          await cleanupCookieSession(cookieSessionId)
          throw retryError
        }
      }
    }
    
    // Re-throw the original error if not a restriction error or user didn't provide cookies
    throw error
  }
} 