import { Loader2, Square } from 'lucide-react'

import type { FileOperations, ProcessingState } from '../../types/video-editor-mediator.types'
import { Alert, AlertDescription } from '../ui/alert'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'

type FileManagementSectionProps = {
  processingState: Pick<ProcessingState, 'isDeleting' | 'isProcessing' | 'isUploading'>
  fileOps: FileOperations
}

export const FileManagementSection = ({ processingState, fileOps }: FileManagementSectionProps) => {
  const { isDeleting, isProcessing, isUploading } = processingState

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Square className="h-4 w-4" />
          File Management
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Alert className="mb-3">
          <AlertDescription className="text-xs">
            💡 "Load New Video" will clear the current video from memory. 
            Make sure you've exported any trims you need first!
          </AlertDescription>
        </Alert>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={fileOps.handleLoadNewVideo}
              disabled={isDeleting || isProcessing || isUploading}
              variant="secondary"
              className="w-full"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Clearing...
                </>
              ) : (
                <>
                  <Square className="h-4 w-4 mr-2" />
                  Load New Video
                </>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent><p>Clear current video and load a new one</p></TooltipContent>
        </Tooltip>
      </CardContent>
    </Card>
  )
} 