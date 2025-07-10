import type { BulkDownloadUrl } from '../types/bulk-download.types'
import { apiClient } from './apiClient'

type VideoFormat = {
  id: string
  ext: string
  resolution: string
  raw: string
}

type URLMetadata = {
  id: string
  title: string
  duration: string | null
  thumbnail: string | null
  description: string | null
  viewCount: number | null
  uploadDate: string | null
  uploader: string | null
  url: string
}

type MetadataExtractError = Error & { 
  isRestrictionError?: boolean
  originalError?: string
}

/**
 * Checks if error message indicates a Twitter restriction that could be solved with cookies
 */
const isTwitterRestrictionError = (errorMessage: string): boolean => {
  const lowerMessage = errorMessage.toLowerCase()
  return lowerMessage.includes('private') ||
         lowerMessage.includes('restricted') ||
         lowerMessage.includes('unavailable') ||
         lowerMessage.includes('403') ||
         lowerMessage.includes('unauthorized') ||
         lowerMessage.includes('age-restricted') ||
         lowerMessage.includes('login required') ||
         lowerMessage.includes('requires authentication') ||
         lowerMessage.includes('nsfw tweet') ||
         lowerMessage.includes('use --cookies') ||
         lowerMessage.includes('sign in to view') ||
         lowerMessage.includes('not authorized')
}

export const extractVideoMetadata = async (url: string, cookieSessionId?: string): Promise<URLMetadata> => {
  const requestBody: { url: string; cookieSessionId?: string } = { url }
  if (cookieSessionId) {
    requestBody.cookieSessionId = cookieSessionId
  }

  try {
    const response = await apiClient.post<{ 
      success: boolean
      metadata: URLMetadata
      error?: string
      details?: string 
    }>('/metadata/extract', requestBody)
    
    if (!response.success) {
      const errorMessage = response.details || response.error || 'Failed to extract metadata'
      
      // Check if this is a Twitter URL and the error indicates restriction
      const isTwitterUrl = url.includes('twitter.com') || url.includes('x.com')
      
      if (isTwitterUrl) {
        const isRestriction = isTwitterRestrictionError(errorMessage)
        
        if (isRestriction) {
          const restrictionError: MetadataExtractError = new Error(errorMessage)
          restrictionError.isRestrictionError = true
          restrictionError.originalError = errorMessage
          throw restrictionError
        }
      }
      
      throw new Error(errorMessage)
    }

    return response.metadata
    
  } catch (error) {
    // Handle errors thrown by apiClient (like 400 responses)
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    // Check if this is a Twitter URL and the error indicates restriction
    const isTwitterUrl = url.includes('twitter.com') || url.includes('x.com')
    
    if (isTwitterUrl) {
      const isRestriction = isTwitterRestrictionError(errorMessage)
      
      if (isRestriction) {
        const restrictionError: MetadataExtractError = new Error(errorMessage)
        restrictionError.isRestrictionError = true
        restrictionError.originalError = errorMessage
        throw restrictionError
      }
    }
    
    throw error
  }
}

export const extractVideoFormats = async (url: string): Promise<VideoFormat[]> => {
  const response = await apiClient.post<{ success: boolean; formats: VideoFormat[]; error?: string; details?: string }>('/metadata/formats', { url })
  
  if (!response.success) {
    // Use the detailed error message when available, fallback to generic error
    const errorMessage = response.details || response.error || 'Failed to extract formats'
    throw new Error(errorMessage)
  }

  return response.formats
}

export const updateUrlWithMetadata = (url: BulkDownloadUrl, metadata: URLMetadata): BulkDownloadUrl => {
  return {
    ...url,
    title: metadata.title,
    duration: metadata.duration ?? undefined,
    thumbnail: metadata.thumbnail ?? undefined,
    description: metadata.description ?? undefined,
    viewCount: metadata.viewCount ?? undefined,
    uploadDate: metadata.uploadDate ?? undefined,
    uploader: metadata.uploader ?? undefined,
    status: 'pending'
  }
}

export const createValidatingUrl = (url: string): BulkDownloadUrl => {
  return {
    id: crypto.randomUUID(),
    url: url.trim(),
    status: 'validating',
    title: 'Validating...'
  }
}

/**
 * Batch metadata extraction with restriction error handling
 * Returns results and any restriction errors that need cookie handling
 */
export const extractBatchMetadata = async (
  urls: string[], 
  cookieSessionId?: string
): Promise<{
  results: { url: string; metadata?: URLMetadata; error?: string }[]
  restrictionErrors: string[]
  hasRestrictionErrors: boolean
}> => {
  const results: { url: string; metadata?: URLMetadata; error?: string }[] = []
  const restrictionErrors: string[] = []
  
  // Process each URL
  for (const url of urls) {
    try {
      const metadata = await extractVideoMetadata(url, cookieSessionId)
      results.push({ url, metadata })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const isRestriction = error instanceof Error && 'isRestrictionError' in error && 
                           (error as MetadataExtractError).isRestrictionError
      
      if (isRestriction) {
        restrictionErrors.push(errorMessage)
      }
      
      results.push({ url, error: errorMessage })
    }
  }
  
  return {
    results,
    restrictionErrors,
    hasRestrictionErrors: restrictionErrors.length > 0
  }
} 