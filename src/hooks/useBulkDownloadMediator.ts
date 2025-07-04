import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_BULK_DOWNLOAD_SETTINGS } from '../constants/bulk-download.constants'
import type { BulkDownloadEvent, BulkDownloadMediator } from '../types/bulk-download-mediator.types'
import type { BulkDownloadState, BulkDownloadUrl } from '../types/bulk-download.types'
import { createNewUrl, extractUrlsFromText, isValidUrl, startBulkDownload } from '../utils/bulk-download.utils'
import { createValidatingUrl, extractVideoMetadata, updateUrlWithMetadata } from '../utils/metadata.utils'

export const useBulkDownloadMediator = (): BulkDownloadMediator => {
  const [state, setState] = useState<BulkDownloadState>({
    urls: [],
    isDownloading: false,
    currentDownloads: 0,
    totalProgress: 0,
    completedCount: 0,
    failedCount: 0,
    settings: DEFAULT_BULK_DOWNLOAD_SETTINGS
  })

  const [currentUrl, setCurrentUrl] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [showSmartPasteDialog, setShowSmartPasteDialog] = useState(false)
  const [showThumbnailModal, setShowThumbnailModal] = useState(false)
  const [thumbnailModalUrl, setThumbnailModalUrl] = useState<string | null>(null)
  const [thumbnailModalTitle, setThumbnailModalTitle] = useState<string | undefined>(undefined)
  const [detectedUrls, setDetectedUrls] = useState<string[]>([])
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set())

  // Track active downloads for cleanup
  const activeDownloads = useRef<Map<string, () => void>>(new Map())

  const updateUrlStatus = useCallback((id: string, updates: Partial<BulkDownloadUrl>) => {
    setState(prev => ({
      ...prev,
      urls: prev.urls.map(u => u.id === id ? { ...u, ...updates } : u)
    }))
  }, [])

  const startSimpleBulkDownload = useCallback(async (url: BulkDownloadUrl) => {
    try {
      console.log('🚀 Starting bulk download for:', url.title || url.url)
      updateUrlStatus(url.id, { 
        status: 'downloading', 
        progress: 50,
        message: 'Getting download URL...'
      })

      // Simple bulk download - get URL and trigger browser download
      await startBulkDownload(url.url, url.title)
      
      // Mark as completed
      updateUrlStatus(url.id, { 
        status: 'completed', 
        progress: 100,
        message: 'Download started in browser!'
      })
      
      console.log('✅ Bulk download triggered for:', url.title || url.url)

    } catch (error) {
      console.error('❌ Bulk download failed for:', url.title, error)
      updateUrlStatus(url.id, { 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Download failed',
        progress: 0 
      })
    }
    
    // Remove from active downloads
    activeDownloads.current.delete(url.id)
    
    // Check if all downloads are finished
    if (activeDownloads.current.size === 0) {
      setState(prev => ({ ...prev, isDownloading: false }))
      console.log('🎉 All bulk downloads triggered!')
    }
  }, [updateUrlStatus])

  const handleEvent = useCallback((event: BulkDownloadEvent) => {
    switch (event.type) {
      case 'URL_ADDED': {
        const { url } = event.payload
        if (!isValidUrl(url)) return
        
        // Create a validating URL first
        const validatingUrl = createValidatingUrl(url)
        setState(prev => ({
          ...prev,
          urls: [...prev.urls, validatingUrl]
        }))
        setCurrentUrl('')
        
        // Extract metadata asynchronously
        extractVideoMetadata(url)
          .then(metadata => {
            const updatedUrl = updateUrlWithMetadata(validatingUrl, metadata)
            setState(prev => ({
              ...prev,
              urls: prev.urls.map(u => 
                u.id === validatingUrl.id ? updatedUrl : u
              )
            }))
          })
          .catch(error => {
            console.error('Failed to extract metadata:', error)
            setState(prev => ({
              ...prev,
              urls: prev.urls.map(u => 
                u.id === validatingUrl.id 
                  ? { ...u, status: 'failed', error: error.message, title: 'Failed to validate' }
                  : u
              )
            }))
          })
          break
      }
      
      case 'URL_REMOVED': {
        const { id } = event.payload
        setState(prev => ({
          ...prev,
          urls: prev.urls.filter(u => u.id !== id)
        }))
        break
      }
      
      case 'URL_SELECTED': {
        const { id, selected } = event.payload
        setState(prev => ({
          ...prev,
          urls: prev.urls.map(u => 
            u.id === id ? { ...u, selected } : u
          )
        }))
        break
      }
      
      case 'ALL_SELECTED': {
        const { selected } = event.payload
        setState(prev => ({
          ...prev,
          urls: prev.urls.map(u => ({ 
            ...u, 
            selected: u.status === 'failed' ? false : selected 
          }))
        }))
        break
      }
      
      case 'DOWNLOAD_STARTED': {
        const { urlIds } = event.payload
        const urlsToDownload = state.urls.filter(u => urlIds.includes(u.id))
        
        if (urlsToDownload.length === 0) return
        
        setState(prev => ({ ...prev, isDownloading: true }))
        
        console.log('🚀 Starting downloads for', urlsToDownload.length, 'URLs')
        
        // Start all downloads with a small delay between each
        for (const [index, url] of urlsToDownload.entries()) {
          setTimeout(() => startSimpleBulkDownload(url), index * 500) // 500ms delay between starts
        }
        break
      }
      
      case 'SETTINGS_UPDATED': {
        const { key, value } = event.payload
        setState(prev => ({
          ...prev,
          settings: { ...prev.settings, [key]: value }
        }))
        break
      }
      
      case 'SMART_PASTE_DETECTED': {
        const { urls } = event.payload
        setDetectedUrls(urls)
        setSelectedUrls(new Set(urls))
        setShowSmartPasteDialog(true)
        break
      }
      
      case 'SMART_PASTE_CONFIRMED': {
        const { urls } = event.payload
        for (const url of urls) {
          handleEvent({ type: 'URL_ADDED', payload: { url } })
        }
        setShowSmartPasteDialog(false)
        setDetectedUrls([])
        setSelectedUrls(new Set())
        break
      }
      
      case 'THUMBNAIL_CLICKED': {
        const { thumbnailUrl, title } = event.payload
        setThumbnailModalUrl(thumbnailUrl)
        setThumbnailModalTitle(title)
        setShowThumbnailModal(true)
        break
      }
      
      case 'DOWNLOADS_CANCELLED': {
        console.log('🛑 Cancelling all downloads...')
        
        // Cancel all active downloads
        for (const cleanup of activeDownloads.current.values()) {
          cleanup()
        }
        activeDownloads.current.clear()
        
        // Reset downloading URLs to pending
        setState(prev => ({
          ...prev,
          isDownloading: false,
          urls: prev.urls.map(u => 
            u.status === 'downloading' 
              ? { ...u, status: 'pending', progress: 0, message: undefined }
              : u
          )
        }))
        break
      }
    }
  }, [state.urls, startSimpleBulkDownload])

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const pastedText = e.clipboardData.getData('text')
    const urls = extractUrlsFromText(pastedText)
    
    if (urls.length <= 1) return
    
    e.preventDefault()
    handleEvent({ type: 'SMART_PASTE_DETECTED', payload: { urls } })
  }, [handleEvent])

  const handleSmartPasteUrlToggle = useCallback((url: string, checked: boolean) => {
    const newSelected = new Set(selectedUrls)
    checked ? newSelected.add(url) : newSelected.delete(url)
    setSelectedUrls(newSelected)
  }, [selectedUrls])

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

  return {
    // State
    state,
    currentUrl,
    showSettings,
    showSmartPasteDialog,
    showThumbnailModal,
    thumbnailModalUrl,
    thumbnailModalTitle,
    detectedUrls,
    selectedUrls,
    
    // Derived state
    selectedForDownload,
    completedUrls,
    failedUrls,
    allSelected,
    canStartDownload,
    
    // Actions
    setCurrentUrl,
    setShowSettings,
    setShowSmartPasteDialog,
    setShowThumbnailModal,
    
    // Event handlers
    handleEvent,
    handlePaste,
    handleSmartPasteUrlToggle
  }
} 