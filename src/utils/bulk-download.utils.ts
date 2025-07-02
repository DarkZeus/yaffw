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
  status: 'pending'
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
  downloadId: string
  downloadUrl: string
  filename: string
  message: string
}

// Simple bulk download function - downloads directly to user
export const startBulkDownload = async (url: string, title?: string): Promise<void> => {
  try {
    const { apiClient } = await import('../utils/apiClient')
    
    console.log('🚀 Starting bulk download for:', title || url)
    
    // Get download URL from server
    const response = await apiClient.post<BulkDownloadResponse>('/download/bulk', { 
      url, 
      title 
    })
    
    if (!response.success) {
      throw new Error(response.message || 'Failed to prepare download')
    }
    
    console.log('📥 Got download URL, triggering browser download...')
    
    // Trigger direct download in browser
    const a = document.createElement('a')
    a.style.display = 'none'
    a.href = response.downloadUrl
    a.download = response.filename
    
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    
    console.log('✅ Download started for:', response.filename)
    
  } catch (error) {
    console.error('❌ Bulk download failed:', error)
    throw new Error(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
} 