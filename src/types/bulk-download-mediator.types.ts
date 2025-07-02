import type { BulkDownloadState, BulkDownloadUrl } from './bulk-download.types'

export type BulkDownloadEvent = 
  | { type: 'URL_ADDED'; payload: { url: string } }
  | { type: 'URL_REMOVED'; payload: { id: string } }
  | { type: 'URL_SELECTED'; payload: { id: string; selected: boolean } }
  | { type: 'ALL_SELECTED'; payload: { selected: boolean } }
  | { type: 'DOWNLOAD_STARTED'; payload: { urlIds: string[] } }
  | { type: 'DOWNLOAD_PROGRESS'; payload: { id: string; progress: number } }
  | { type: 'DOWNLOAD_COMPLETED'; payload: { id: string } }
  | { type: 'DOWNLOAD_FAILED'; payload: { id: string; error: string } }
  | { type: 'SETTINGS_UPDATED'; payload: { key: string; value: string } }
  | { type: 'SMART_PASTE_DETECTED'; payload: { urls: string[] } }
  | { type: 'SMART_PASTE_CONFIRMED'; payload: { urls: string[] } }
  | { type: 'THUMBNAIL_CLICKED'; payload: { thumbnailUrl: string; title?: string } }
  | { type: 'DOWNLOADS_CANCELLED' }

export type BulkDownloadMediator = {
  // State
  state: BulkDownloadState
  currentUrl: string
  showSettings: boolean
  showSmartPasteDialog: boolean
  showThumbnailModal: boolean
  thumbnailModalUrl: string | null
  thumbnailModalTitle: string | undefined
  detectedUrls: string[]
  selectedUrls: Set<string>
  
  // Derived state
  selectedForDownload: BulkDownloadUrl[]
  completedUrls: BulkDownloadUrl[]
  failedUrls: BulkDownloadUrl[]
  allSelected: boolean
  canStartDownload: boolean
  
  // Actions
  setCurrentUrl: (url: string) => void
  setShowSettings: (show: boolean) => void
  setShowSmartPasteDialog: (show: boolean) => void
  setShowThumbnailModal: (show: boolean) => void
  
  // Event handlers
  handleEvent: (event: BulkDownloadEvent) => void
  
  // Specific handlers for components
  handlePaste: (e: React.ClipboardEvent) => void
  handleSmartPasteUrlToggle: (url: string, checked: boolean) => void
}

export type ComponentEventHandler = (event: BulkDownloadEvent) => void 