import type { ThumbnailModalProps } from '../../../types/bulk-download-components.types'
import { Dialog, DialogContent } from '../../ui/dialog'

export function ThumbnailModal({ open, onOpenChange, thumbnailUrl, title }: ThumbnailModalProps) {
  if (!thumbnailUrl) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full p-6">
        <div className="space-y-4 flex justify-center">
            <img 
                src={thumbnailUrl} 
                alt={title || "Video thumbnail"}
                className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-lg"
                onError={(e) => {
                    console.error('Failed to load full-size thumbnail:', thumbnailUrl)
                    onOpenChange(false)
                }}
            />
        </div>
      </DialogContent>
    </Dialog>
  )
} 