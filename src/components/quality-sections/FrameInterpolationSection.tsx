import { FRAME_INTERPOLATION_MODELS } from '../../constants/quality-modal.constants'
import type { SectionProps } from '../../types/quality-modal.types'
import { Badge } from '../ui/badge'
import { Checkbox } from '../ui/checkbox'
import { Slider } from '../ui/slider'

export function FrameInterpolationSection({ settings, videoMetadata, onSettingsChange }: SectionProps) {
  const selectedModel = FRAME_INTERPOLATION_MODELS.find(model => model.value === settings.frameInterpolationModel)
  const originalFps = videoMetadata?.fps || 30
  const maxFps = selectedModel?.maxFps || 120

  const handleFrameInterpolationToggle = (checked: boolean) => {
    onSettingsChange({
      section: 'frameInterpolation',
      field: 'useFrameInterpolation',
      value: checked
    })
  }

  const handleModelChange = (value: string) => {
    const model = FRAME_INTERPOLATION_MODELS.find(m => m.value === value)
    onSettingsChange({
      section: 'frameInterpolation',
      field: 'frameInterpolationModel',
      value
    })
    
    // Adjust target FPS if it exceeds the new model's max
    if (model && settings.targetFps > model.maxFps) {
      onSettingsChange({
        section: 'frameInterpolation',
        field: 'targetFps',
        value: model.maxFps
      })
    }
  }

  const renderModelCards = () => (
    <div className="space-y-2 pl-6 border-l-2 border-purple-200">
      <span className="text-sm font-medium text-muted-foreground">AI Model</span>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {FRAME_INTERPOLATION_MODELS.map((model) => (
          <button
            key={model.value}
            type="button"
            onClick={() => handleModelChange(model.value)}
            className={`p-3 rounded-lg border text-left transition-colors ${
              settings.frameInterpolationModel === model.value 
              ? 'border-purple-300 bg-purple-50 ring-1 ring-purple-300' 
              : 'border-muted hover:border-border hover:bg-muted/50'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{model.label}</span>
                {model.gpuRequired && (
                  <Badge variant="outline" className="text-xs">
                    GPU
                  </Badge>
                )}
              </div>
              {settings.frameInterpolationModel === model.value && (
                <div className="w-2 h-2 rounded-full bg-purple-500" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-1">{model.description}</p>
            <div className="flex gap-2 text-xs text-muted-foreground">
              <span>Max: {model.maxFps}fps</span>
            </div>
            {videoMetadata?.fps && (
              <p className="text-xs text-purple-600 mt-1">
                From: {videoMetadata.fps}fps → {settings.targetFps}fps
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
  )

  const handleFpsChange = (value: number[]) => {
    onSettingsChange({
      section: 'frameInterpolation',
      field: 'targetFps',
      value: value[0]
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Checkbox
          id="use-frame-interpolation"
          checked={settings.useFrameInterpolation}
          onCheckedChange={handleFrameInterpolationToggle}
        />
        <label htmlFor="use-frame-interpolation" className="text-sm font-medium">
          Enable Frame Interpolation
        </label>
        <Badge variant="outline" className="text-xs bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-300">
          ✨ AI
        </Badge>
        {videoMetadata?.fps && (
          <Badge variant="outline" className="ml-auto">
            Original: {originalFps}fps
          </Badge>
        )}
      </div>

      {settings.useFrameInterpolation && (
        <div className="space-y-4 pl-6">
          {renderModelCards()}

          <div className="space-y-3">
            <label htmlFor="target-fps-slider" className="text-sm font-medium">Target Frame Rate</label>
            <div className="px-3">
              <Slider
                id="target-fps-slider"
                value={[settings.targetFps]}
                onValueChange={handleFpsChange}
                max={maxFps}
                min={originalFps}
                step={10}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>{originalFps}fps</span>
                <span className="font-medium">{settings.targetFps}fps</span>
                <span>{maxFps}fps</span>
              </div>
            </div>
            {selectedModel?.gpuRequired && !settings.useGpuAcceleration && (
              <p className="text-xs text-amber-600">
                ⚠️ This model requires GPU acceleration for optimal performance
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
} 