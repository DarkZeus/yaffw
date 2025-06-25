import { Download, Loader2 } from 'lucide-react'

import type { ExportOperations, ProcessingState } from '../../types/video-editor-mediator.types'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'

type ExportControlsProps = {
  processingState: Pick<ProcessingState, 'isProcessing' | 'isUploading'>
  hasCurrentVideo: boolean
  exportOps: ExportOperations
}

export const ExportControls = ({ processingState, hasCurrentVideo, exportOps }: ExportControlsProps) => {
  const { isProcessing, isUploading } = processingState

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Download className="h-4 w-4" />
          Export
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={exportOps.handleTrimVideo}
              disabled={isProcessing || isUploading || !hasCurrentVideo}
              className="w-full h-12"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Export Video
                </>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent><p>Export video (Enter)</p></TooltipContent>
        </Tooltip>
      </CardContent>
    </Card>
  )
} 