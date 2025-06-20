import { Monitor } from 'lucide-react'
import { AI_UPSCALING_MODELS } from '../../constants/quality-modal.constants'
import type { QualityMediator, SectionProps, StandardResolution } from '../../types/quality-modal.types'
import { Badge } from '../ui/badge'
import { Checkbox } from '../ui/checkbox'

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

  const handleAIToggle = (checked: boolean) => {
    onSettingsChange({
      section: 'resolution',
      field: 'useAIUpscaling',
      value: checked
    })
  }

  const handleAIModelChange = (model: string) => {
    onSettingsChange({
      section: 'resolution',
      field: 'aiModel',
      value: model
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
            settings.resolution === original.value && !settings.useAIUpscaling
              ? 'border-primary bg-primary/5 ring-1 ring-primary' 
              : 'border-muted hover:border-border hover:bg-muted/50'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium text-sm">{original.label}</span>
            {settings.resolution === original.value && !settings.useAIUpscaling && (
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
                settings.resolution === option.value && !settings.useAIUpscaling
                  ? 'border-primary bg-primary/5 ring-1 ring-primary' 
                  : 'border-muted hover:border-border hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm">{option.label}</span>
                {settings.resolution === option.value && !settings.useAIUpscaling && (
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

  const renderAIModels = () => (
    <div className="space-y-2 pl-6 border-l-2 border-purple-200">
      <span className="text-sm font-medium text-muted-foreground">AI Model</span>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {AI_UPSCALING_MODELS.map((model) => (
          <button
            key={model.value}
            type="button"
            onClick={() => handleAIModelChange(model.value)}
            className={`p-3 rounded-lg border text-left transition-colors ${
              settings.aiModel === model.value
                ? 'border-purple-300 bg-purple-50 ring-1 ring-purple-300' 
                : 'border-muted hover:border-border hover:bg-muted/50'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{model.label}</span>
                <Badge variant="secondary" className="text-xs">
                  {model.multiplier}x
                </Badge>
              </div>
              {settings.aiModel === model.value && (
                <div className="w-2 h-2 rounded-full bg-purple-500" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">{model.description}</p>
            {videoMetadata?.width && videoMetadata?.height && (
              <p className="text-xs text-purple-600 mt-1">
                Output: {videoMetadata.width * model.multiplier}×{videoMetadata.height * model.multiplier}
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
  )

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
        
        {/* AI Upscaling Toggle */}
        <div className="flex items-center space-x-2 pt-2">
          <Checkbox 
            id="ai-upscaling" 
            checked={settings.useAIUpscaling}
            onCheckedChange={handleAIToggle}
          />
          <label htmlFor="ai-upscaling" className="text-sm font-medium">
            AI Upscaling
          </label>
          <Badge variant="outline" className="text-xs bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-300">
            ✨ AI
          </Badge>
        </div>
        
        {/* AI Models */}
        {settings.useAIUpscaling && renderAIModels()}
      </div>
    </div>
  )
} 