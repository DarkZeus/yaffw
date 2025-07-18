import { URL_REGEX } from '../constants/bulk-download.constants'
import type { BulkDownloadUrl } from '../types/bulk-download.types'

export const isValidUrl = (url: string): boolean => {
  if (!url.trim()) return false
  try {
    new URL(url.trim())
    return true
  } catch {
    return false
  }
}

export const createNewUrl = (url: string): BulkDownloadUrl => ({
  id: crypto.randomUUID(),
  url: url.trim(),
  status: 'pending',
  selected: true // Auto-check URLs when added
})

export const extractUrlsFromText = (text: string): string[] => {
  return text.match(URL_REGEX) || []
}

export const getStatusBadgeVariant = (status: BulkDownloadUrl['status']) => {
  const variantMap = {
    pending: 'secondary',
    validating: 'secondary',
    downloading: 'default', 
    completed: 'default',
    failed: 'destructive'
  } as const
  return variantMap[status]
}

export type BulkDownloadResponse = {
  success: boolean
  downloadUrl: string
  filename: string
}

// Simple bulk download function - fetch as blob and download (your approach!)
export const startBulkDownload = async (url: string, title?: string, cookieSessionId?: string): Promise<void> => {
  try {
    const { apiClient } = await import('../utils/apiClient')
    
    console.log('🚀 Getting download URL for:', title || url, cookieSessionId ? 'with cookies' : 'without cookies')
    
    // Get direct download URL from server (with optional cookie support)
    const requestBody: { url: string; title?: string; cookieSessionId?: string } = { url }
    if (title) requestBody.title = title
    if (cookieSessionId) requestBody.cookieSessionId = cookieSessionId
    
    const response = await apiClient.post<BulkDownloadResponse>('/download/bulk', requestBody)
    
    if (!response.success) {
      throw new Error('Failed to get download URL')
    }
    
    console.log('📥 Fetching video as blob...')
    
    // Use axios client to fetch as blob then download
    const videoResponse = await apiClient.instance.get(response.downloadUrl, { responseType: 'blob' })
    
    if (videoResponse.status !== 200) {
      throw new Error(`Failed to fetch video: ${videoResponse.status}`)
    }
    
    const blob = videoResponse.data
    
    // Create blob URL and trigger download
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.style.display = 'none'
    a.href = blobUrl
    a.download = response.filename
    
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    
    // Clean up blob URL
    URL.revokeObjectURL(blobUrl)
    
    console.log('✅ Download completed for:', response.filename)
    
  } catch (error) {
    console.error('❌ Bulk download failed:', error)
    throw new Error(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
} 