import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { toast } from 'sonner'
import { DEFAULT_BULK_DOWNLOAD_SETTINGS } from '../../constants/bulk-download.constants'
import type { BulkDownloadState, BulkDownloadUrl } from '../../types/bulk-download.types'
import { createNewUrl, extractUrlsFromText, isValidUrl, startBulkDownload } from '../../utils/bulk-download.utils'
import { 
  createValidatingUrl, 
  extractBatchMetadata,
  extractVideoMetadata, 
  updateUrlWithMetadata 
} from '../../utils/metadata.utils'
import { downloadTwitterVideo, downloadVideoFromUrl, uploadTwitterCookieFile } from '../../utils/urlDownloader'
import { Button } from '../ui/button'
import { CookieManagementDialog, SettingsDialog, SmartPasteDialog, ThumbnailModal } from './dialogs'
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
  // Local state for the component
  const [state, dispatch] = useReducer(bulkDownloadReducer, initialState)
  const [currentUrl, setCurrentUrl] = useState('')

  // Dialog states
  const [showSettings, setShowSettings] = useState(false)
  const [showSmartPasteDialog, setShowSmartPasteDialog] = useState(false)
  const [showThumbnailModal, setShowThumbnailModal] = useState(false)
  const [showCookieManagement, setShowCookieManagement] = useState(false)

  // Smart paste state
  const [detectedUrls, setDetectedUrls] = useState<string[]>([])
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set())

  // Thumbnail modal state
  const [thumbnailModalUrl, setThumbnailModalUrl] = useState('')
  const [thumbnailModalTitle, setThumbnailModalTitle] = useState('')

  // Cookie management state
  const [restrictionError, setRestrictionError] = useState('')
  const [cookieUploadResolver, setCookieUploadResolver] = useState<((value: string | null) => void) | null>(null)
  
  // Store the current cookie session ID for use in downloads
  const [currentCookieSessionId, setCurrentCookieSessionId] = useState<string | null>(null)

  // Active downloads tracking
  const activeDownloads = useRef<Map<string, () => void>>(new Map())
  
  // Helper functions
  const updateUrl = useCallback((id: string, updates: Partial<BulkDownloadUrl>) => {
    dispatch({ type: 'UPDATE_URL', payload: { id, updates } })
  }, [])



  // Enhanced function to start downloads with restriction handling
  const startSimpleBulkDownload = useCallback(async (urlObj: BulkDownloadUrl) => {
    if (urlObj.status !== 'pending') return
    
    updateUrl(urlObj.id, { status: 'downloading', progress: 0 })
    
    try {
      // Use bulk download for all URLs (including Twitter) with optional cookies
      // This ensures all downloads go to the user's folder instead of the server
      await startBulkDownload(urlObj.url, urlObj.title, currentCookieSessionId || undefined)
      
      // Handle successful download
      updateUrl(urlObj.id, { 
        status: 'completed',
        progress: 100
      })
      
    } catch (error) {
      updateUrl(urlObj.id, { 
        status: 'failed',
        error: error instanceof Error ? error.message : 'Download failed',
        progress: 0
      })
    }
    
    // Remove from active downloads
    activeDownloads.current.delete(urlObj.id)
    
    // Check if all downloads are finished
    if (activeDownloads.current.size === 0) {
      dispatch({ type: 'SET_DOWNLOADING', payload: false })
    }
  }, [updateUrl, currentCookieSessionId])

  // URL management functions
  const addUrl = useCallback(async (url: string) => {
    if (!isValidUrl(url)) return
    
    // Create a validating URL first
    const validatingUrl = createValidatingUrl(url)
    dispatch({ type: 'ADD_URL', payload: validatingUrl })
    setCurrentUrl('')
    
    // Extract metadata asynchronously (for display purposes)
    try {
      const metadata = await extractVideoMetadata(url)
      const updatedUrl = updateUrlWithMetadata(validatingUrl, metadata)
      dispatch({ type: 'UPDATE_URL', payload: { id: validatingUrl.id, updates: updatedUrl } })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const isRestriction = error instanceof Error && 'isRestrictionError' in error && 
                           (error as Error & { isRestrictionError?: boolean }).isRestrictionError
      
      if (isRestriction) {
        // For restriction errors, show the cookie dialog
        setRestrictionError(errorMessage)
        setShowCookieManagement(true)
        
        // Set URL to pending with restriction info
        updateUrl(validatingUrl.id, { 
          status: 'pending', 
          title: `🔒 Restricted Content - ${url}`,
          error: undefined 
        })
      } else {
        // For other errors, set to pending with warning
        updateUrl(validatingUrl.id, { 
          status: 'pending', 
          title: `⚠️ Metadata extraction failed - ${url}`,
          error: undefined 
        })
      }
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
    
    // Start all downloads with a small delay between each
    for (const [index, url] of urlsToDownload.entries()) {
      setTimeout(() => startSimpleBulkDownload(url), index * 500) // 500ms delay between starts
    }
  }, [state.urls, startSimpleBulkDownload])

  const cancelDownloads = useCallback(() => {
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

  // Retry metadata extraction for failed URLs with cookies
  const retryMetadataWithCookies = useCallback(async (
    validatingUrls: BulkDownloadUrl[], 
    originalUrls: string[], 
    cookieSessionId: string
  ) => {
    // Store the cookie session ID for future downloads
    setCurrentCookieSessionId(cookieSessionId)
    
    console.log(`🔄 Batch retrying metadata extraction for ${originalUrls.length} URLs with cookies...`)
    
    try {
      // Update all URLs to show we're retrying with cookies
      for (const validatingUrl of validatingUrls) {
        updateUrl(validatingUrl.id, { 
          status: 'validating', 
          title: '🔄 Retrying with cookies...',
          error: undefined 
        })
      }
      
      const batchResult = await extractBatchMetadata(originalUrls, cookieSessionId)
      
      // Update URLs with new metadata results
      for (let i = 0; i < batchResult.results.length; i++) {
        const result = batchResult.results[i]
        const validatingUrl = validatingUrls[i]
        
        if (result.metadata) {
          const updatedUrl = updateUrlWithMetadata(validatingUrl, result.metadata)
          dispatch({ type: 'UPDATE_URL', payload: { id: validatingUrl.id, updates: updatedUrl } })
          console.log('✅ Batch metadata retry successful for:', result.metadata.title)
        } else if (result.error) {
          // Still failed even with cookies
          updateUrl(validatingUrl.id, { 
            status: 'pending', 
            title: `❌ Failed even with cookies - ${result.url}`,
            error: undefined 
          })
          console.log('❌ Batch metadata retry failed for:', result.url, result.error)
        }
      }
    } catch (error) {
      console.error('Batch metadata retry with cookies failed:', error)
      
      // Reset URLs back to error state if batch retry completely fails
      for (let i = 0; i < validatingUrls.length; i++) {
        const validatingUrl = validatingUrls[i]
        const originalUrl = originalUrls[i]
        updateUrl(validatingUrl.id, { 
          status: 'pending', 
          title: `❌ Batch retry failed - ${originalUrl}`,
          error: undefined 
        })
      }
    }
  }, [updateUrl])

  const confirmSmartPaste = useCallback(async () => {
    const urlsToAdd = Array.from(selectedUrls)
    
    // Close the smart paste dialog immediately
    setShowSmartPasteDialog(false)
    setDetectedUrls([])
    setSelectedUrls(new Set())
    
    // Add all URLs as validating first
    const validatingUrls = urlsToAdd.map(url => {
      const validatingUrl = createValidatingUrl(url)
      dispatch({ type: 'ADD_URL', payload: validatingUrl })
      return validatingUrl
    })
    
    // Batch process metadata extraction
    try {
      const batchResult = await extractBatchMetadata(urlsToAdd)
      
      // Update URLs with successful metadata
      for (let i = 0; i < batchResult.results.length; i++) {
        const result = batchResult.results[i]
        const validatingUrl = validatingUrls[i]
        
        if (result.metadata) {
          const updatedUrl = updateUrlWithMetadata(validatingUrl, result.metadata)
          dispatch({ type: 'UPDATE_URL', payload: { id: validatingUrl.id, updates: updatedUrl } })
        } else if (result.error) {
          // Set to pending with error info
          updateUrl(validatingUrl.id, { 
            status: 'pending', 
            title: `⚠️ ${result.error} - ${result.url}`,
            error: undefined 
          })
        }
      }
      
      // If there are restriction errors, show cookie dialog
      if (batchResult.hasRestrictionErrors) {
        setRestrictionError(`Found ${batchResult.restrictionErrors.length} restricted videos that may need authentication`)
        setShowCookieManagement(true)
        setCookieUploadResolver((cookieSessionId: string | null) => {
          if (cookieSessionId) {
            // Retry metadata extraction for failed URLs with cookies
            retryMetadataWithCookies(validatingUrls, urlsToAdd, cookieSessionId)
          }
          return Promise.resolve(cookieSessionId)
        })
      }
      
    } catch (error) {
      console.error('Batch metadata extraction failed:', error)
    }
     }, [selectedUrls, updateUrl, retryMetadataWithCookies])

  // Thumbnail modal
  const showThumbnail = useCallback((thumbnailUrl: string, title?: string) => {
    setThumbnailModalUrl(thumbnailUrl)
    setThumbnailModalTitle(title || '')
    setShowThumbnailModal(true)
  }, [])

  // Cookie upload dialog handlers
  const handleCookieUploadCancel = useCallback(() => {
    if (cookieUploadResolver) {
      cookieUploadResolver(null)
    }
    
    setShowCookieManagement(false)
    setCookieUploadResolver(null)
    setRestrictionError('')
  }, [cookieUploadResolver])

  const handleCookieUpload = useCallback(async (sessionId: string) => {
    // Store the cookie session ID for use in downloads
    setCurrentCookieSessionId(sessionId)
    
    if (cookieUploadResolver) {
      cookieUploadResolver(sessionId)
    }
    
    // Retry metadata extraction for ALL URLs that have restriction/failure errors
    const urlsToRetry = state.urls.filter(url => 
      url.title?.includes('🔒 Restricted Content') || 
      url.title?.includes('⚠️ Metadata extraction failed') ||
      url.title?.includes('❌ Failed even with cookies') ||
      url.status === 'validating'
    )
    
    console.log(`🔄 Retrying metadata extraction for ${urlsToRetry.length} URLs with cookies...`)
    
    for (const url of urlsToRetry) {
      try {
        // Update to show we're retrying
        updateUrl(url.id, { 
          status: 'validating', 
          title: '🔄 Retrying with cookies...',
          error: undefined 
        })
        
        const metadata = await extractVideoMetadata(url.url, sessionId)
        const updatedUrl = updateUrlWithMetadata(url, metadata)
        dispatch({ type: 'UPDATE_URL', payload: { id: url.id, updates: updatedUrl } })
        
        console.log('✅ Metadata retry successful for:', metadata.title)
      } catch (error) {
        // Still failed even with cookies
        updateUrl(url.id, { 
          status: 'pending', 
          title: `❌ Failed even with cookies - ${url.url}`,
          error: undefined 
        })
        
        console.log('❌ Metadata retry failed for:', url.url, error)
      }
    }
    
    setShowCookieManagement(false)
    setCookieUploadResolver(null)
    setRestrictionError('')
  }, [cookieUploadResolver, state.urls, updateUrl])

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
          Effortlessly download multiple videos from various platforms
        </p>
        
        {/* Header Actions */}
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowCookieManagement(true)}
          >
            Manage Cookie Files
          </Button>
        </div>
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

      {/* Cookie Management Dialog */}
      <CookieManagementDialog 
        isOpen={showCookieManagement}
        onClose={handleCookieUploadCancel}
        onCookieUploaded={handleCookieUpload}
      />
    </div>
  )
} 