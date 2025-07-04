import type { BulkDownloadUrl } from '../types/bulk-download.types'
import { apiClient } from './apiClient'

export type VideoMetadata = {
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

export type VideoFormat = {
  id: string
  ext: string
  resolution: string
  raw: string
}

export const extractVideoMetadata = async (url: string): Promise<VideoMetadata> => {
  const response = await apiClient.post<{ success: boolean; metadata: VideoMetadata; error?: string; details?: string }>('/metadata/extract', { url })
  
  if (!response.success) {
    // Use the detailed error message when available, fallback to generic error
    const errorMessage = response.details || response.error || 'Failed to extract metadata'
    throw new Error(errorMessage)
  }

  return response.metadata
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

export const updateUrlWithMetadata = (url: BulkDownloadUrl, metadata: VideoMetadata): BulkDownloadUrl => {
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