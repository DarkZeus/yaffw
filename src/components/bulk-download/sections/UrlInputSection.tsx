import { Plus } from 'lucide-react'
import { useRef } from 'react'
import type { UrlInputSectionProps } from '../../../types/bulk-download-components.types'
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

  const handleAddUrl = () => {
    onAddUrl(currentUrl)
  }

  return (
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