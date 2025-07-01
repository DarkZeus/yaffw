import { Download, Loader2 } from 'lucide-react'

import type { ExportOperations, ProcessingState } from '../../types/video-editor-mediator.types'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'

type ExportControlsProps = {
  processingState: Pick<ProcessingState, 'isProcessing' | 'isUploading' | 'isCommittingToServer'>
  hasCurrentVideo: boolean
  exportOps: ExportOperations
}

export const ExportControls = ({ processingState, hasCurrentVideo, exportOps }: ExportControlsProps) => {
  const { isProcessing, isUploading, isCommittingToServer } = processingState

  const isDisabled = isProcessing || isUploading || isCommittingToServer || !hasCurrentVideo

  const getButtonContent = () => {
    if (isProcessing) {
      return (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Processing...
        </>
      )
    }
    
    if (isCommittingToServer) {
      return (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Preparing...
        </>
      )
    }
    
    if (isUploading) {
      return (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Uploading...
        </>
      )
    }
    
    return (
      <>
        <Download className="h-4 w-4 mr-2" />
        Export Video
      </>
    )
  }

  const getTooltipText = () => {
    if (isCommittingToServer) {
      return 'Please wait while file is being prepared for export'
    }
    if (isUploading) {
      return 'Please wait while file is uploading'
    }
    if (isProcessing) {
      return 'Video is currently being processed'
    }
    if (!hasCurrentVideo) {
      return 'Please upload a video first'
    }
    return 'Export video (Enter)'
  }

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
              disabled={isDisabled}
              className="w-full h-12"
            >
              {getButtonContent()}
            </Button>
          </TooltipTrigger>
          <TooltipContent><p>{getTooltipText()}</p></TooltipContent>
        </Tooltip>
      </CardContent>
    </Card>
  )
} 