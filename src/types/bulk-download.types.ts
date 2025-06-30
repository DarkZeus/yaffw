export type BulkDownloadUrl = {
  id: string
  url: string
  status: 'pending' | 'validating' | 'valid' | 'invalid' | 'downloading' | 'completed' | 'failed'
  title?: string
  thumbnail?: string
  duration?: string
  error?: string
  progress?: number
  downloadSpeed?: string
  eta?: string
  fileName?: string
  filePath?: string
}

export type BulkDownloadSettings = {
  quality: string
  format: string
  outputPath: string
  concurrent: number
  retryFailedDownloads: boolean
}

export type BulkDownloadState = {
  urls: BulkDownloadUrl[]
  isDownloading: boolean
  currentDownloads: number
  totalProgress: number
  completedCount: number
  failedCount: number
  settings: BulkDownloadSettings
}

export type UrlValidationResult = {
  url: string
  isValid: boolean
  title?: string
  thumbnail?: string
  duration?: string
  error?: string
}

export type BulkDownloadProgress = {
  urlId: string
  progress: number
  downloadSpeed?: string
  eta?: string
  status: BulkDownloadUrl['status']
}

export type BulkDownloadResult = {
  urlId: string
  success: boolean
  fileName?: string
  filePath?: string
  error?: string
} 