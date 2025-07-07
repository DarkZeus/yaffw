import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { DEFAULT_BULK_DOWNLOAD_SETTINGS } from '../../constants/bulk-download.constants'
import type { BulkDownloadState, BulkDownloadUrl } from '../../types/bulk-download.types'
import { createNewUrl, extractUrlsFromText, isValidUrl, startBulkDownload } from '../../utils/bulk-download.utils'
import { createValidatingUrl, extractVideoMetadata, updateUrlWithMetadata } from '../../utils/metadata.utils'
import { SettingsDialog, SmartPasteDialog, ThumbnailModal } from './dialogs'
import { UrlInputSection, UrlListSection } from './sections'

// Reducer for managing the main bulk download state
type BulkDownloadAction =
  | { type: 'ADD_URL'; payload: BulkDownloadUrl }
  | { type: 'REMOVE_URL'; payload: { id: string } }
  | { type: 'UPDATE_URL'; payload: { id: string; updates: Partial<BulkDownloadUrl> } }
  | { type: 'SELECT_URL'; payload: { id: string; selected: boolean } }
  | { type: 'SELECT_ALL'; payload: { selected: boolean } }
  | { type: 'SET_DOWNLOADING'; payload: boolean }
  | { type: 'UPDATE_SETTINGS'; payload: { key: string; value: string } }
  | { type: 'RESET_DOWNLOADING_URLS' }

const initialState: BulkDownloadState = {
  urls: [],
  isDownloading: false,
  currentDownloads: 0,
  totalProgress: 0,
  completedCount: 0,
  failedCount: 0,
  settings: DEFAULT_BULK_DOWNLOAD_SETTINGS
}

function bulkDownloadReducer(state: BulkDownloadState, action: BulkDownloadAction): BulkDownloadState {
  switch (action.type) {
    case 'ADD_URL':
      return {
        ...state,
        urls: [...state.urls, action.payload]
      }
    
    case 'REMOVE_URL':
      return {
        ...state,
        urls: state.urls.filter(u => u.id !== action.payload.id)
      }
    
    case 'UPDATE_URL':
      return {
        ...state,
        urls: state.urls.map(u => 
          u.id === action.payload.id ? { ...u, ...action.payload.updates } : u
        )
      }
    
    case 'SELECT_URL':
      return {
        ...state,
        urls: state.urls.map(u => 
          u.id === action.payload.id ? { ...u, selected: action.payload.selected } : u
        )
      }
    
    case 'SELECT_ALL':
      return {
        ...state,
        urls: state.urls.map(u => ({ 
          ...u, 
          selected: u.status === 'failed' ? false : action.payload.selected 
        }))
      }
    
    case 'SET_DOWNLOADING':
      return {
        ...state,
        isDownloading: action.payload
      }
    
    case 'UPDATE_SETTINGS':
      return {
        ...state,
        settings: { ...state.settings, [action.payload.key]: action.payload.value }
      }
    
    case 'RESET_DOWNLOADING_URLS':
      return {
        ...state,
        isDownloading: false,
        urls: state.urls.map(u => 
          u.status === 'downloading' 
            ? { ...u, status: 'pending', progress: 0, message: undefined }
            : u
        )
      }
    
    default:
      return state
  }
}

export function BulkDownloadComponent() {
  const [state, dispatch] = useReducer(bulkDownloadReducer, initialState)
  
  // Dialog states
  const [showSettings, setShowSettings] = useState(false)
  const [showSmartPasteDialog, setShowSmartPasteDialog] = useState(false)
  const [showThumbnailModal, setShowThumbnailModal] = useState(false)
  const [thumbnailModalUrl, setThumbnailModalUrl] = useState<string | null>(null)
  const [thumbnailModalTitle, setThumbnailModalTitle] = useState<string | undefined>(undefined)
  
  // Form state
  const [currentUrl, setCurrentUrl] = useState('')
  
  // Smart paste state
  const [detectedUrls, setDetectedUrls] = useState<string[]>([])
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set())
  
  // Track active downloads for cleanup
  const activeDownloads = useRef<Map<string, () => void>>(new Map())

  // Helper functions
  const updateUrl = useCallback((id: string, updates: Partial<BulkDownloadUrl>) => {
    dispatch({ type: 'UPDATE_URL', payload: { id, updates } })
  }, [])

  const startSimpleBulkDownload = useCallback(async (url: BulkDownloadUrl) => {
    try {
      console.log('🚀 Starting bulk download for:', url.title || url.url)
      updateUrl(url.id, { 
        status: 'downloading', 
        progress: 50,
        message: 'Getting download URL...'
      })

      // Simple bulk download - get URL and trigger browser download
      await startBulkDownload(url.url, url.title)
      
      // Mark as completed
      updateUrl(url.id, { 
        status: 'completed', 
        progress: 100,
        message: 'Download started in browser!'
      })
      
      console.log('✅ Bulk download triggered for:', url.title || url.url)

    } catch (error) {
      console.error('❌ Bulk download failed for:', url.title, error)
      updateUrl(url.id, { 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Download failed',
        progress: 0 
      })
    }
    
    // Remove from active downloads
    activeDownloads.current.delete(url.id)
    
    // Check if all downloads are finished
    if (activeDownloads.current.size === 0) {
      dispatch({ type: 'SET_DOWNLOADING', payload: false })
      console.log('🎉 All bulk downloads triggered!')
    }
  }, [updateUrl])

  // URL management functions
  const addUrl = useCallback(async (url: string) => {
    if (!isValidUrl(url)) return
    
    // Create a validating URL first
    const validatingUrl = createValidatingUrl(url)
    dispatch({ type: 'ADD_URL', payload: validatingUrl })
    setCurrentUrl('')
    
    // Extract metadata asynchronously
    try {
      const metadata = await extractVideoMetadata(url)
      const updatedUrl = updateUrlWithMetadata(validatingUrl, metadata)
      dispatch({ type: 'UPDATE_URL', payload: { id: validatingUrl.id, updates: updatedUrl } })
    } catch (error) {
      console.error('Failed to extract metadata:', error)
      updateUrl(validatingUrl.id, { 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Validation failed', 
        title: 'Failed to validate' 
      })
    }
  }, [updateUrl])

  const removeUrl = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_URL', payload: { id } })
  }, [])

  const selectUrl = useCallback((id: string, selected: boolean) => {
    dispatch({ type: 'SELECT_URL', payload: { id, selected } })
  }, [])

  const selectAll = useCallback((selected: boolean) => {
    dispatch({ type: 'SELECT_ALL', payload: { selected } })
  }, [])

  const startDownloads = useCallback((urlIds: string[]) => {
    const urlsToDownload = state.urls.filter(u => urlIds.includes(u.id))
    
    if (urlsToDownload.length === 0) return
    
    dispatch({ type: 'SET_DOWNLOADING', payload: true })
    
    console.log('🚀 Starting downloads for', urlsToDownload.length, 'URLs')
    
    // Start all downloads with a small delay between each
    for (const [index, url] of urlsToDownload.entries()) {
      setTimeout(() => startSimpleBulkDownload(url), index * 500) // 500ms delay between starts
    }
  }, [state.urls, startSimpleBulkDownload])

  const cancelDownloads = useCallback(() => {
    console.log('🛑 Cancelling all downloads...')
    
    // Cancel all active downloads
    for (const cleanup of activeDownloads.current.values()) {
      cleanup()
    }
    activeDownloads.current.clear()
    
    // Reset downloading URLs to pending
    dispatch({ type: 'RESET_DOWNLOADING_URLS' })
  }, [])

  const updateSettings = useCallback((key: string, value: string) => {
    dispatch({ type: 'UPDATE_SETTINGS', payload: { key, value } })
  }, [])

  // Smart paste functionality
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const pastedText = e.clipboardData.getData('text')
    const urls = extractUrlsFromText(pastedText)
    
    if (urls.length <= 1) return
    
    e.preventDefault()
    setDetectedUrls(urls)
    setSelectedUrls(new Set(urls))
    setShowSmartPasteDialog(true)
  }, [])

  const handleSmartPasteUrlToggle = useCallback((url: string, checked: boolean) => {
    const newSelected = new Set(selectedUrls)
    checked ? newSelected.add(url) : newSelected.delete(url)
    setSelectedUrls(newSelected)
  }, [selectedUrls])

  const confirmSmartPaste = useCallback(() => {
    const urlsToAdd = Array.from(selectedUrls)
    for (const url of urlsToAdd) {
      addUrl(url)
    }
    setShowSmartPasteDialog(false)
    setDetectedUrls([])
    setSelectedUrls(new Set())
  }, [selectedUrls, addUrl])

  // Thumbnail modal
  const showThumbnail = useCallback((thumbnailUrl: string, title?: string) => {
    setThumbnailModalUrl(thumbnailUrl)
    setThumbnailModalTitle(title)
    setShowThumbnailModal(true)
  }, [])

  // Derived state
  const selectedForDownload = state.urls.filter(u => u.selected)
  const completedUrls = state.urls.filter(u => u.status === 'completed')
  const failedUrls = state.urls.filter(u => u.status === 'failed')
  const selectableUrls = state.urls.filter(u => u.status !== 'failed')
  const allSelected = selectableUrls.length > 0 && selectableUrls.every(u => u.selected)
  const canStartDownload = selectedForDownload.length > 0 && !state.isDownloading

  // Cleanup active downloads on unmount
  useEffect(() => {
    return () => {
      console.log('🧹 Cleaning up active downloads...')
      for (const cleanup of activeDownloads.current.values()) {
        cleanup()
      }
      activeDownloads.current.clear()
    }
  }, [])

  return (
    <div className="container mx-auto p-6 h-[calc(100dvh-1rem)] flex flex-col gap-6">
      {/* Header */}
      <div className="space-y-2 flex-shrink-0">
        <h1 className="text-3xl font-bold">Bulk Download</h1>
        <p className="text-muted-foreground">
          Download multiple videos at once from various platforms directly to your computer
        </p>
      </div>

      {/* URL Input Section */}
      <div className="flex-shrink-0">
        <UrlInputSection
          currentUrl={currentUrl}
          setCurrentUrl={setCurrentUrl}
          onAddUrl={addUrl}
          handlePaste={handlePaste}
          totalUrls={state.urls.length}
          selectedCount={selectedForDownload.length}
          completedCount={completedUrls.length}
          failedCount={failedUrls.length}
        />
      </div>

      {/* URL List Section */}
      <div className="flex-1 min-h-0">
        <UrlListSection
          urls={state.urls}
          allSelected={allSelected}
          selectedCount={selectedForDownload.length}
          canStartDownload={canStartDownload}
          isDownloading={state.isDownloading}
          completedUrls={completedUrls}
          failedUrls={failedUrls}
          onSelectUrl={selectUrl}
          onSelectAll={selectAll}
          onRemoveUrl={removeUrl}
          onStartDownloads={startDownloads}
          onCancelDownloads={cancelDownloads}
          onShowThumbnail={showThumbnail}
          onShowSettings={() => setShowSettings(true)}
        />
      </div>

      {/* Smart Paste Dialog */}
      <SmartPasteDialog
        open={showSmartPasteDialog}
        onOpenChange={setShowSmartPasteDialog}
        detectedUrls={detectedUrls}
        selectedUrls={selectedUrls}
        onUrlToggle={handleSmartPasteUrlToggle}
        onConfirm={confirmSmartPaste}
      />

      {/* Settings Dialog */}
      <SettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        settings={state.settings}
        onUpdateSettings={updateSettings}
      />

      {/* Thumbnail Modal */}
      <ThumbnailModal
        open={showThumbnailModal}
        onOpenChange={setShowThumbnailModal}
        thumbnailUrl={thumbnailModalUrl}
        title={thumbnailModalTitle}
      />
    </div>
  )
} 