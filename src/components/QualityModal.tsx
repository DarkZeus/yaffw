import { Settings } from 'lucide-react'

import { useQualityMediator } from '../hooks/useQualityMediator'
import type { ExportSettings, QualityModalProps } from '../types/quality-modal.types'
import { getFinalCodec } from '../utils/quality-modal.utils'
import { BitrateSection } from './quality-sections/BitrateSection'
import { CodecSection } from './quality-sections/CodecSection'
import { FrameInterpolationSection } from './quality-sections/FrameInterpolationSection'
import { GpuSection } from './quality-sections/GpuSection'
import { ResolutionSection } from './quality-sections/ResolutionSection'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { ScrollArea } from './ui/scroll-area'
import { Separator } from './ui/separator'


export function QualityModal({ isOpen, onClose, onExport, videoMetadata }: QualityModalProps) {
  const [settings, mediator] = useQualityMediator(videoMetadata)

  const handleExport = () => {
    const acceleration = mediator.getAvailableGpuAcceleration()
    
    onExport({
      resolution: settings.useAIUpscaling ? `ai_${settings.aiModel}` : settings.resolution,
      bitrate: settings.bitrate[0],
      codec: getFinalCodec(settings),
      useGpuAcceleration: settings.useGpuAcceleration,
      gpuVendor: settings.useGpuAcceleration ? acceleration?.vendor : undefined,
      useAIUpscaling: settings.useAIUpscaling,
      aiModel: settings.useAIUpscaling ? settings.aiModel : undefined,
      useFrameInterpolation: settings.useFrameInterpolation,
      frameInterpolationModel: settings.useFrameInterpolation ? settings.frameInterpolationModel : undefined,
      targetFps: settings.useFrameInterpolation ? settings.targetFps : undefined,
    })
    
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Export Quality Settings
          </DialogTitle>
          <DialogDescription>
            Configure the quality settings for your exported video
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60dvh] w-full pb-4">
          <div className="space-y-6 px-4">
            {/* Resolution Section */}
            <ResolutionSection 
              settings={settings}
              videoMetadata={videoMetadata}
              mediator={mediator}
              onSettingsChange={mediator.updateSettings}
            />

            <Separator />

            {/* Bitrate Section */}
            <BitrateSection 
              settings={settings}
              videoMetadata={videoMetadata}
              onSettingsChange={mediator.updateSettings}
            />

            <Separator />

            {/* Codec Section */}
            <CodecSection 
              settings={settings}
              videoMetadata={videoMetadata}
              onSettingsChange={mediator.updateSettings}
            />

            {/* GPU Section */}
            <GpuSection 
              settings={settings}
              videoMetadata={videoMetadata}
              mediator={mediator}
              onSettingsChange={mediator.updateSettings}
            />

            <Separator />

            {/* Frame Interpolation Section */}
            <FrameInterpolationSection 
              settings={settings}
              videoMetadata={videoMetadata}
              onSettingsChange={mediator.updateSettings}
            />
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleExport}>
            Export Video
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 