import { AlertCircle, CheckCircle2, Download, Loader2, RefreshCw, Settings, Trash2, X, XCircle } from 'lucide-react'
import { useCallback } from 'react'
import type { UrlListSectionProps } from '../../../types/bulk-download-components.types'
import type { BulkDownloadUrl } from '../../../types/bulk-download.types'
import { getStatusBadgeVariant } from '../../../utils/bulk-download.utils'
import { Alert, AlertDescription } from '../../ui/alert'
import { Badge } from '../../ui/badge'
import { Button } from '../../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card'
import { Checkbox } from '../../ui/checkbox'
import { Progress } from '../../ui/progress'
import { ScrollArea } from '../../ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs'

export function UrlListSection({
  urls,
  allSelected,
  selectedCount,
  canStartDownload,
  isDownloading,
  completedUrls,
  failedUrls,
  onSelectUrl,
  onSelectAll,
  onRemoveUrl,
  onStartDownloads,
  onCancelDownloads,
  onShowThumbnail,
  onShowSettings
}: UrlListSectionProps) {
  const getStatusIcon = useCallback((status: BulkDownloadUrl['status']) => {
    const iconMap = {
      validating: <Loader2 className="h-4 w-4 animate-spin text-orange-500" />,
      downloading: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
      completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
      failed: <XCircle className="h-4 w-4 text-red-500" />,
      pending: <AlertCircle className="h-4 w-4 text-gray-400" />
    }
    return iconMap[status]
  }, [])

  const getStatusBadge = useCallback((status: BulkDownloadUrl['status']) => (
    <Badge variant={getStatusBadgeVariant(status)} className="capitalize">
      {status}
    </Badge>
  ), [])

  const handleSelectAll = (checked: boolean) => {
    onSelectAll(checked)
  }

  const handleUrlSelect = (id: string, checked: boolean) => {
    onSelectUrl(id, checked)
  }

  const handleRemoveUrl = (id: string) => {
    onRemoveUrl(id)
  }

  const handleStartDownload = () => {
    const selectedIds = urls.filter(u => u.selected).map(u => u.id)
    onStartDownloads(selectedIds)
  }

  const handleCancelDownloads = () => {
    onCancelDownloads()
  }

  if (urls.length === 0) return null

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle>URLs ({urls.length})</CardTitle>
            <div className="flex items-center gap-2">
              <Checkbox id="select-all" checked={allSelected} onCheckedChange={handleSelectAll} />
              <label htmlFor="select-all" className="text-sm text-muted-foreground cursor-pointer">
                Select All
              </label>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onShowSettings}>
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
            {isDownloading ? (
              <Button variant="destructive" onClick={handleCancelDownloads} className="gap-2">
                <X className="h-4 w-4" />
                Cancel Downloads
              </Button>
            ) : (
              <Button onClick={handleStartDownload} disabled={!canStartDownload} className="gap-2">
                <Download className="h-4 w-4" />
                Download Selected ({selectedCount})
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0">
        <Tabs defaultValue="all" className="flex flex-col h-full">
          <TabsList className="flex-shrink-0">
            <TabsTrigger value="all">
              All URLs ({urls.length})
            </TabsTrigger>
            <TabsTrigger value="completed">
              Completed ({completedUrls.length})
            </TabsTrigger>
            <TabsTrigger value="failed">
              Failed ({failedUrls.length})
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="all" className="flex-1 min-h-0">
            <ScrollArea className="h-full w-full">
              <div className="space-y-3">
                {urls.map((url) => (
                  <div key={url.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Checkbox
                          checked={url.selected || false}
                          disabled={url.status === 'failed'}
                          onCheckedChange={(checked) => handleUrlSelect(url.id, Boolean(checked))}
                        />
                        {getStatusIcon(url.status)}
                        {url.thumbnail && (
                          <button
                            type="button"
                            onClick={() => onShowThumbnail(url.thumbnail || '', url.title)}
                            className="p-0 border-0 bg-transparent cursor-pointer hover:opacity-80 transition-opacity"
                          >
                            <img 
                              src={url.thumbnail} 
                              alt="Video thumbnail"
                              className="w-16 h-12 object-cover rounded border"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none'
                              }}
                            />
                          </button>
                        )}
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
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            {url.duration && (
                              <span>Duration: {url.duration}</span>
                            )}
                            {url.uploader && (
                              <span>by {url.uploader}</span>
                            )}
                            {url.viewCount && (
                              <span>{url.viewCount.toLocaleString()} views</span>
                            )}
                          </div>
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
                          <span>{url.message || 'Downloading...'}</span>
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
          </TabsContent>
          
          <TabsContent value="completed" className="flex-1 min-h-0">
            <ScrollArea className="h-full w-full">
              <div className="space-y-3">
                {completedUrls.map((url) => (
                  <div key={url.id} className="flex items-center justify-between p-3 border rounded">
                    <div className="flex items-center gap-3">
                      {url.thumbnail && (
                        <button
                          type="button"
                          onClick={() => onShowThumbnail(url.thumbnail || '', url.title)}
                          className="p-0 border-0 bg-transparent cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          <img 
                            src={url.thumbnail} 
                            alt="Video thumbnail"
                            className="w-12 h-9 object-cover rounded border"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none'
                            }}
                          />
                        </button>
                      )}
                      <div>
                        <p className="font-medium">{url.title}</p>
                        <p className="text-sm text-muted-foreground">{url.fileName}</p>
                      </div>
                    </div>
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="failed" className="flex-1 min-h-0">
            <ScrollArea className="h-full w-full">
              <div className="space-y-3">
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
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
} 