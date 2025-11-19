import { Monitor } from 'lucide-react'
import type { QualityMediator, SectionProps, StandardResolution } from '../../types/quality-modal.types'
import { Badge } from '../ui/badge'

type ResolutionSectionProps = SectionProps & {
  mediator: QualityMediator
}

export function ResolutionSection({ settings, videoMetadata, mediator, onSettingsChange }: ResolutionSectionProps) {
  const { original, downscale, upscale } = mediator.getCategorizedResolutions()

  const handleResolutionChange = (resolution: string) => {
    onSettingsChange({
      section: 'resolution',
      field: 'resolution',
      value: resolution
    })
  }

  const renderOriginalResolution = () => {
    if (!original) return null
    
    return (
      <div className="space-y-2">
        <span className="text-xs font-medium text-muted-foreground">Original</span>
        <button
          type="button"
          onClick={() => handleResolutionChange(original.value)}
          className={`p-3 rounded-lg border text-left transition-colors w-full ${
            settings.resolution === original.value
              ? 'border-primary bg-primary/5 ring-1 ring-primary' 
              : 'border-muted hover:border-border hover:bg-muted/50'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium text-sm">{original.label}</span>
            {settings.resolution === original.value && (
              <div className="w-2 h-2 rounded-full bg-primary" />
            )}
          </div>
          {videoMetadata && (
            <p className="text-xs text-muted-foreground">
              {videoMetadata.width}×{videoMetadata.height}
            </p>
          )}
        </button>
      </div>
    )
  }

  const renderResolutionGrid = (resolutions: StandardResolution[], title: string, showBicubicBadge = false) => {
    if (resolutions.length === 0) return null
    
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{title}</span>
          {showBicubicBadge && <Badge variant="outline" className="text-xs">Bicubic</Badge>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {resolutions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleResolutionChange(option.value)}
              className={`p-3 rounded-lg border text-left transition-colors ${
                settings.resolution === option.value
                  ? 'border-primary bg-primary/5 ring-1 ring-primary' 
                  : 'border-muted hover:border-border hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm">{option.label}</span>
                {settings.resolution === option.value && (
                  <div className="w-2 h-2 rounded-full bg-primary" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {option.width}×{option.height}
              </p>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Monitor className="h-4 w-4" />
        <span className="text-sm font-medium">Resolution</span>
      </div>
      
      <div className="space-y-4">
        {/* Original Resolution */}
        {renderOriginalResolution()}

        {/* Downscale Resolutions */}
        {renderResolutionGrid(downscale, 'Downscale')}

        {/* Bicubic Upscale Resolutions */}
        {renderResolutionGrid(upscale, 'Upscale', true)}
      </div>
    </div>
  )
} 