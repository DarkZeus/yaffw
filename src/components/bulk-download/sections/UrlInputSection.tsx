import { Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import type { UrlInputSectionProps } from '../../../types/bulk-download-components.types'
import { extractUrlsFromText } from '../../../utils/bulk-download.utils'
import { Button } from '../../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card'
import { Input } from '../../ui/input'

export function UrlInputSection({
  currentUrl,
  setCurrentUrl,
  handlePaste,
  onAddUrl,
  totalUrls,
  selectedCount,
  completedCount,
  failedCount
}: UrlInputSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragActive, setIsDragActive] = useState(false)

  const handleAddUrl = () => {
    onAddUrl(currentUrl)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragActive(false)
    const text = e.dataTransfer.getData('text')
    if (text) {
      const urls = extractUrlsFromText(text)
      if (urls.length > 0) {
        urls.forEach(onAddUrl)
      }
    }
}

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragActive(true)
  }

  const handleDragLeave = () => {
    setIsDragActive(false)
  }

  return (
    <Card
      className={`${isDragActive && 'border-2 border-dashed border-blue-400'}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-5 w-5" />
          Add URLs
        </CardTitle>
        <CardDescription>
          Add URLs to analyze and select for downloading. Restricted content will prompt for cookie authentication.
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
            onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
            className="flex-1"
          />
          <Button 
            onClick={handleAddUrl}
            disabled={!currentUrl.trim()}
          >
            Add URL
          </Button>
        </div>
        {isDragActive && (
          <div className="text-blue-600 text-xs text-center">Drop URLs here to add</div>
        )}
        {totalUrls > 0 && (
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{totalUrls} URLs added</span>
            <span>•</span>
            <span>{selectedCount} selected</span>
            <span>•</span>
            <span>{completedCount} completed</span>
            {failedCount > 0 && (
              <>
                <span>•</span>
                <span className="text-red-500">{failedCount} failed</span>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
} 