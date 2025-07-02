import type { SettingsDialogProps } from '../../../types/bulk-download-components.types'
import type { BulkDownloadSettings } from '../../../types/bulk-download.types'
import { Button } from '../../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select'

export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onEvent
}: SettingsDialogProps) {
  const handleSettingChange = (key: keyof BulkDownloadSettings, value: string) => {
    onEvent({ type: 'SETTINGS_UPDATED', payload: { key, value } })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Download Settings</DialogTitle>
          <DialogDescription>
            Configure your bulk download preferences
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="quality-select" className="text-sm font-medium">Quality</label>
            <Select
              value={settings.quality}
              onValueChange={(value) => handleSettingChange('quality', value)}
            >
              <SelectTrigger id="quality-select">
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
            <label htmlFor="format-select" className="text-sm font-medium">Format</label>
            <Select
              value={settings.format}
              onValueChange={(value) => handleSettingChange('format', value)}
            >
              <SelectTrigger id="format-select">
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
          <Button onClick={() => onOpenChange(false)}>
            Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 