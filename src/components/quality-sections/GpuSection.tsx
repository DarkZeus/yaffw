import { Info } from 'lucide-react'
import type { QualityMediator, SectionProps } from '../../types/quality-modal.types'
import { Badge } from '../ui/badge'
import { Checkbox } from '../ui/checkbox'

type GpuSectionProps = SectionProps & {
  mediator: QualityMediator
}

export function GpuSection({ settings, mediator, onSettingsChange }: GpuSectionProps) {
  const handleGpuToggle = (checked: boolean) => {
    onSettingsChange({
      section: 'gpu',
      field: 'useGpuAcceleration',
      value: checked
    })
  }

  const isGpuAvailable = mediator.isGpuAccelerationAvailable()
  const acceleration = mediator.getAvailableGpuAcceleration()

  const getGpuVendorLabel = (vendor: string) => {
    const vendorLabels = {
      nvidia: 'NVENC',
      amd: 'VCE',
      apple: 'VideoToolbox'
    }
    return vendorLabels[vendor as keyof typeof vendorLabels] ?? vendor
  }

  return (
    <div className="flex items-center space-x-2 pt-2">
      <Checkbox 
        id="gpu-acceleration" 
        checked={settings.useGpuAcceleration}
        onCheckedChange={handleGpuToggle}
        disabled={!isGpuAvailable}
      />
      <div className="flex items-center gap-2">
        <label htmlFor="gpu-acceleration" className="text-sm font-medium">
          GPU Acceleration
        </label>
        {!isGpuAvailable && (
          <Badge variant="secondary" className="text-xs">
            Not Available
          </Badge>
        )}
        {settings.useGpuAcceleration && acceleration && (
          <Badge variant="outline" className="text-xs">
            {getGpuVendorLabel(acceleration.vendor)}
          </Badge>
        )}
        <Info className="h-4 w-4 mt-0.5 text-muted-foreground" />
      </div>
    </div>
  )
} 