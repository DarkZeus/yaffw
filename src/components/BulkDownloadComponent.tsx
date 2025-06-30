import { AlertCircle, CheckCircle2, Download, Loader2, Plus, RefreshCw, Settings, Trash2, XCircle } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import type { BulkDownloadSettings, BulkDownloadState, BulkDownloadUrl } from '../types/bulk-download.types'
import { Alert, AlertDescription } from './ui/alert'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Checkbox } from './ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Progress } from './ui/progress'
import { ScrollArea } from './ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Separator } from './ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'

const defaultSettings: BulkDownloadSettings = {
  quality: 'best',
  format: 'mp4',
  outputPath: './downloads',
  concurrent: 3,
  retryFailedDownloads: true
}

export function BulkDownloadComponent() {
  const [state, setState] = useState<BulkDownloadState>({
    urls: [],
    isDownloading: false,
    currentDownloads: 0,
    totalProgress: 0,
    completedCount: 0,
    failedCount: 0,
    settings: defaultSettings
  })
  
  const [currentUrl, setCurrentUrl] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [showSmartPasteDialog, setShowSmartPasteDialog] = useState(false)
  const [detectedUrls, setDetectedUrls] = useState<string[]>([])
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  // Smart paste detection
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const pastedText = e.clipboardData.getData('text')
    const urlPattern = /https?:\/\/[^\s]+/g
    const urls = pastedText.match(urlPattern) || []
    
    if (urls.length > 1) {
      e.preventDefault()
      setDetectedUrls(urls)
      setSelectedUrls(new Set(urls))
      setShowSmartPasteDialog(true)
    }
  }, [])

  const handleAddUrl = useCallback((url: string) => {
    if (!url.trim()) return
    
    const id = crypto.randomUUID()
    const newUrl: BulkDownloadUrl = {
      id,
      url: url.trim(),
      status: 'validating'
    }
    
    setState(prev => ({
      ...prev,
      urls: [...prev.urls, newUrl]
    }))
    
    // Simulate validation
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        urls: prev.urls.map(u => 
          u.id === id 
            ? { ...u, status: 'valid', title: 'Sample Video Title', duration: '5:30' }
            : u
        )
      }))
    }, 1000)
    
    setCurrentUrl('')
  }, [])

  const handleBulkAddUrls = useCallback(() => {
    const urlsToAdd = Array.from(selectedUrls)
    urlsToAdd.forEach(url => handleAddUrl(url))
    setShowSmartPasteDialog(false)
    setDetectedUrls([])
    setSelectedUrls(new Set())
  }, [selectedUrls, handleAddUrl])

  const handleRemoveUrl = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      urls: prev.urls.filter(u => u.id !== id)
    }))
  }, [])

  const handleSelectAll = useCallback((checked: boolean) => {
    const validUrls = state.urls.filter(u => u.status === 'valid')
    setState(prev => ({
      ...prev,
      urls: prev.urls.map(u => ({ 
        ...u, 
        selected: u.status === 'valid' ? checked : false 
      }))
    }))
  }, [state.urls])

  const handleStartDownload = useCallback(() => {
    const selectedValidUrls = state.urls.filter(u => u.status === 'valid')
    if (selectedValidUrls.length === 0) return
    
    setState(prev => ({ ...prev, isDownloading: true }))
    
    // Simulate download process
    selectedValidUrls.forEach((url, index) => {
      setTimeout(() => {
        setState(prev => ({
          ...prev,
          urls: prev.urls.map(u => 
            u.id === url.id 
              ? { ...u, status: 'downloading', progress: 0 }
              : u
          )
        }))
        
        // Simulate progress
        const progressInterval = setInterval(() => {
          setState(prev => {
            const currentUrl = prev.urls.find(u => u.id === url.id)
            if (!currentUrl || currentUrl.progress >= 100) {
              clearInterval(progressInterval)
              return prev
            }
            
            return {
              ...prev,
              urls: prev.urls.map(u => 
                u.id === url.id 
                  ? { 
                      ...u, 
                      progress: Math.min((currentUrl.progress || 0) + Math.random() * 20, 100),
                      status: (currentUrl.progress || 0) >= 95 ? 'completed' : 'downloading'
                    }
                  : u
              )
            }
          })
        }, 500)
      }, index * 1000)
    })
  }, [state.urls])

  const getStatusIcon = (status: BulkDownloadUrl['status']) => {
    switch (status) {
      case 'validating':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      case 'valid':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case 'invalid':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'downloading':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />
    }
  }

  const getStatusBadge = (status: BulkDownloadUrl['status']) => {
    const variants = {
      pending: 'secondary',
      validating: 'secondary',
      valid: 'default',
      invalid: 'destructive',
      downloading: 'default',
      completed: 'default',
      failed: 'destructive'
    } as const
    
    return (
      <Badge variant={variants[status]} className="capitalize">
        {status}
      </Badge>
    )
  }

  const validUrls = state.urls.filter(u => u.status === 'valid')
  const completedUrls = state.urls.filter(u => u.status === 'completed')
  const failedUrls = state.urls.filter(u => u.status === 'failed')
  const downloadingUrls = state.urls.filter(u => u.status === 'downloading')

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Bulk Download</h1>
        <p className="text-muted-foreground">
          Download multiple videos at once from various platforms
        </p>
      </div>

      {/* URL Input Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add URLs
          </CardTitle>
          <CardDescription>
            Paste a URL or multiple URLs at once for smart detection
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              placeholder="Paste video URL here..."
              value={currentUrl}
              onChange={(e) => setCurrentUrl(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={(e) => e.key === 'Enter' && handleAddUrl(currentUrl)}
              className="flex-1"
            />
            <Button 
              onClick={() => handleAddUrl(currentUrl)}
              disabled={!currentUrl.trim()}
            >
              Add URL
            </Button>
          </div>
          
          {state.urls.length > 0 && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>{state.urls.length} URLs added</span>
              <span>•</span>
              <span>{validUrls.length} valid</span>
              <span>•</span>
              <span>{completedUrls.length} completed</span>
              {failedUrls.length > 0 && (
                <>
                  <span>•</span>
                  <span className="text-red-500">{failedUrls.length} failed</span>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* URL List */}
      {state.urls.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>URLs ({state.urls.length})</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSettings(true)}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Button>
                <Button
                  onClick={handleStartDownload}
                  disabled={validUrls.length === 0 || state.isDownloading}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Download All ({validUrls.length})
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] w-full">
              <div className="space-y-3">
                {state.urls.map((url) => (
                  <div key={url.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {getStatusIcon(url.status)}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium truncate">
                              {url.title || 'Validating...'}
                            </p>
                            {getStatusBadge(url.status)}
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            {url.url}
                          </p>
                          {url.duration && (
                            <p className="text-xs text-muted-foreground">
                              Duration: {url.duration}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemoveUrl(url.id)}
                        disabled={url.status === 'downloading'}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    {url.status === 'downloading' && url.progress !== undefined && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Downloading...</span>
                          <span>{Math.round(url.progress)}%</span>
                        </div>
                        <Progress value={url.progress} className="w-full" />
                      </div>
                    )}
                    
                    {url.error && (
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{url.error}</AlertDescription>
                      </Alert>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {(completedUrls.length > 0 || failedUrls.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Download Results</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="completed">
              <TabsList>
                <TabsTrigger value="completed">
                  Completed ({completedUrls.length})
                </TabsTrigger>
                <TabsTrigger value="failed">
                  Failed ({failedUrls.length})
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="completed" className="space-y-3">
                {completedUrls.map((url) => (
                  <div key={url.id} className="flex items-center justify-between p-3 border rounded">
                    <div>
                      <p className="font-medium">{url.title}</p>
                      <p className="text-sm text-muted-foreground">{url.fileName}</p>
                    </div>
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  </div>
                ))}
              </TabsContent>
              
              <TabsContent value="failed" className="space-y-3">
                {failedUrls.map((url) => (
                  <div key={url.id} className="p-3 border rounded space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{url.title || url.url}</p>
                        <p className="text-sm text-red-500">{url.error}</p>
                      </div>
                      <Button variant="outline" size="sm">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Retry
                      </Button>
                    </div>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Smart Paste Dialog */}
      <Dialog open={showSmartPasteDialog} onOpenChange={setShowSmartPasteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Multiple URLs Detected</DialogTitle>
            <DialogDescription>
              We detected {detectedUrls.length} URLs in your clipboard. Select which ones to add:
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-2">
              {detectedUrls.map((url, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <Checkbox
                    id={`url-${index}`}
                    checked={selectedUrls.has(url)}
                    onCheckedChange={(checked) => {
                      const newSelected = new Set(selectedUrls)
                      if (checked) {
                        newSelected.add(url)
                      } else {
                        newSelected.delete(url)
                      }
                      setSelectedUrls(newSelected)
                    }}
                  />
                  <label
                    htmlFor={`url-${index}`}
                    className="text-sm truncate cursor-pointer flex-1"
                  >
                    {url}
                  </label>
                </div>
              ))}
            </div>
          </ScrollArea>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSmartPasteDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleBulkAddUrls} disabled={selectedUrls.size === 0}>
              Add {selectedUrls.size} URLs
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Download Settings</DialogTitle>
            <DialogDescription>
              Configure your bulk download preferences
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Quality</label>
              <Select
                value={state.settings.quality}
                onValueChange={(value) => 
                  setState(prev => ({
                    ...prev,
                    settings: { ...prev.settings, quality: value }
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="best">Best Quality</SelectItem>
                  <SelectItem value="720p">720p</SelectItem>
                  <SelectItem value="480p">480p</SelectItem>
                  <SelectItem value="360p">360p</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Format</label>
              <Select
                value={state.settings.format}
                onValueChange={(value) => 
                  setState(prev => ({
                    ...prev,
                    settings: { ...prev.settings, format: value }
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mp4">MP4</SelectItem>
                  <SelectItem value="webm">WebM</SelectItem>
                  <SelectItem value="mkv">MKV</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter>
            <Button onClick={() => setShowSettings(false)}>
              Save Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
} 