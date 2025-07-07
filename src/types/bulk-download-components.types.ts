import type { BulkDownloadSettings, BulkDownloadUrl } from './bulk-download.types'

// Section component prop types
export type UrlInputSectionProps = {
  currentUrl: string
  setCurrentUrl: (url: string) => void
  handlePaste: (e: React.ClipboardEvent) => void
  onAddUrl: (url: string) => void
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
  completedUrls: BulkDownloadUrl[]
  failedUrls: BulkDownloadUrl[]
  onSelectUrl: (id: string, selected: boolean) => void
  onSelectAll: (selected: boolean) => void
  onRemoveUrl: (id: string) => void
  onStartDownloads: (urlIds: string[]) => void
  onCancelDownloads: () => void
  onShowThumbnail: (thumbnailUrl: string, title?: string) => void
  onShowSettings: () => void
}

// Dialog component prop types
export type SmartPasteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  detectedUrls: string[]
  selectedUrls: Set<string>
  onUrlToggle: (url: string, checked: boolean) => void
  onConfirm: () => void
}

export type SettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: BulkDownloadSettings
  onUpdateSettings: (key: string, value: string) => void
}

export type ThumbnailModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  thumbnailUrl: string | null
  title?: string
} 