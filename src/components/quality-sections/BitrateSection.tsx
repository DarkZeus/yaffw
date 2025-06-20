import type { SectionProps } from '../../types/quality-modal.types'
import { Badge } from '../ui/badge'
import { Input } from '../ui/input'
import { Slider } from '../ui/slider'

export function BitrateSection({ settings, videoMetadata, onSettingsChange }: SectionProps) {
  const handleBitrateSliderChange = (value: number[]) => {
    onSettingsChange({
      section: 'bitrate',
      field: 'bitrate',
      value
    })
  }

  const handleBitrateInputChange = (value: string) => {
    onSettingsChange({
      section: 'bitrate',
      field: 'bitrateInput',
      value
    })
  }

  return (
    <div className="space-y-3">
      <label htmlFor="bitrate-input" className="text-sm font-medium">Bitrate</label>
      <div className="space-y-4">
        <div className="px-3">
          <Slider
            value={settings.bitrate}
            onValueChange={handleBitrateSliderChange}
            max={100}
            min={1}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>1 Mbps</span>
            <span>100 Mbps</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            id="bitrate-input"
            type="number"
            value={settings.bitrateInput}
            onChange={(e) => handleBitrateInputChange(e.target.value)}
            min="1"
            max="100"
            className="w-20"
          />
          <span className="text-sm text-muted-foreground">Mbps</span>
          {videoMetadata?.bitrate && (
            <Badge variant="outline" className="ml-auto">
              Original: {Math.round(videoMetadata.bitrate / 1000000)}Mbps
            </Badge>
          )}
        </div>
      </div>
    </div>
  )
} 