import type { ComponentEventHandler } from './bulk-download-mediator.types'
import type { BulkDownloadSettings, BulkDownloadUrl } from './bulk-download.types'

// Section component prop types
export type UrlInputSectionProps = {
  currentUrl: string
  setCurrentUrl: (url: string) => void
  handlePaste: (e: React.ClipboardEvent) => void
  onEvent: ComponentEventHandler
  totalUrls: number
  selectedCount: number
  completedCount: number
  failedCount: number
}

export type UrlListSectionProps = {
  urls: BulkDownloadUrl[]
  allSelected: boolean
  selectedCount: number
  canStartDownload: boolean
  isDownloading: boolean
  onEvent: ComponentEventHandler
  onShowSettings: () => void
}

export type ResultsSectionProps = {
  completedUrls: BulkDownloadUrl[]
  failedUrls: BulkDownloadUrl[]
  onEvent: ComponentEventHandler
}

// Dialog component prop types
export type SmartPasteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  detectedUrls: string[]
  selectedUrls: Set<string>
  onUrlToggle: (url: string, checked: boolean) => void
  onEvent: ComponentEventHandler
}

export type SettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: BulkDownloadSettings
  onEvent: ComponentEventHandler
}

export type ThumbnailModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  thumbnailUrl: string | null
  title?: string
} 