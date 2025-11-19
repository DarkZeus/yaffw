import type { BulkDownloadSettings } from '../types/bulk-download.types'

export const DEFAULT_BULK_DOWNLOAD_SETTINGS: BulkDownloadSettings = {
  quality: 'best',
  format: 'mp4',
  outputPath: './downloads',
  concurrent: 3,
  retryFailedDownloads: true
}

export const URL_REGEX = /https?:\/\/[^\s]+/g

export const SMART_PASTE_MAX_HEIGHT = 'max-h-[300px]' 