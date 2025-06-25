import { Clock } from 'lucide-react'

import type { ExportOperations, UIState, VideoState } from '../../types/video-editor-mediator.types'
import { QualityModal } from '../QualityModal'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'

type ModalsSectionProps = {
  uiState: UIState
  videoState: Pick<VideoState, 'videoMetadata'>
  exportOps: ExportOperations
  onCloseQualityModal: () => void
  onToggleLargeFileDialog: (open: boolean) => void
  onConfirmLargeFile: () => void
}

export const ModalsSection = ({
  uiState,
  videoState,
  exportOps,
  onCloseQualityModal,
  onToggleLargeFileDialog,
  onConfirmLargeFile
}: ModalsSectionProps) => {
  const { showQualityModal, showLargeFileConfirmDialog, largeFileSize } = uiState
  const { videoMetadata } = videoState

  return (
    <>
      {/* Quality Modal */}
      <QualityModal
        isOpen={showQualityModal}
        onClose={onCloseQualityModal}
        onExport={exportOps.handleExportWithQuality}
        videoMetadata={videoMetadata}
      />

      {/* Large File Confirmation Dialog */}
      <Dialog open={showLargeFileConfirmDialog} onOpenChange={onToggleLargeFileDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <Clock className="h-5 w-5" />
              Large File Processing
            </DialogTitle>
            <DialogDescription className="space-y-3 text-left">
              <p>This is a large file ({largeFileSize.toFixed(2)} GB).</p>
              <p>Processing may take several minutes depending on your system and the complexity of the trim.</p>
              <p>The application may appear unresponsive during processing. Please be patient.</p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => onToggleLargeFileDialog(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={onConfirmLargeFile}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Continue Processing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
} 