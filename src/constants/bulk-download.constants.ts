import type { BulkDownloadSettings } from '../types/bulk-download.types'

export const DEFAULT_BULK_DOWNLOAD_SETTINGS: BulkDownloadSettings = {
  quality: 'best',
  format: 'mp4',
  outputPath: './downloads',
  concurrent: 3,
  retryFailedDownloads: true
}

export const URL_REGEX = /https?:\/\/[^\s]+/g

export const DOWNLOAD_SIMULATION_CONFIG = {
  PROGRESS_INTERVAL: 500,
  MAX_PROGRESS_INCREMENT: 20,
  COMPLETION_THRESHOLD: 95,
  DOWNLOAD_DELAY_MULTIPLIER: 1000
} as const



export const SCROLL_AREA_HEIGHT = 'h-[400px]'
export const SMART_PASTE_MAX_HEIGHT = 'max-h-[300px]' 