import { SMART_PASTE_MAX_HEIGHT } from '../../../constants/bulk-download.constants'
import type { SmartPasteDialogProps } from '../../../types/bulk-download-components.types'
import { Button } from '../../ui/button'
import { Checkbox } from '../../ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog'
import { ScrollArea } from '../../ui/scroll-area'

export function SmartPasteDialog({
  open,
  onOpenChange,
  detectedUrls,
  selectedUrls,
  onUrlToggle,
  onEvent
}: SmartPasteDialogProps) {
  const handleConfirm = () => {
    const urls = Array.from(selectedUrls)
    onEvent({ type: 'SMART_PASTE_CONFIRMED', payload: { urls } })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Multiple URLs Detected</DialogTitle>
          <DialogDescription>
            We detected {detectedUrls.length} URLs in your clipboard. Select which ones to add:
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className={SMART_PASTE_MAX_HEIGHT}>
          <div className="space-y-2">
            {detectedUrls.map((url, index) => (
              <div key={url} className="flex items-center space-x-2">
                <Checkbox
                  id={`url-${index}`}
                  checked={selectedUrls.has(url)}
                  onCheckedChange={(checked) => onUrlToggle(url, Boolean(checked))}
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={selectedUrls.size === 0}>
            Add {selectedUrls.size} URLs
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 