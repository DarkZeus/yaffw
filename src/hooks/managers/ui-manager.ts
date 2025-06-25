import type { VideoEditorState } from '../../types/video-editor-mediator.types'

export type UIOperations = {
  handleCloseQualityModal: () => void
  handleToggleLargeFileDialog: (open: boolean) => void
}

export type UIManager = (
  state: VideoEditorState,
  setState: (updates: Partial<VideoEditorState>) => void
) => UIOperations

export const createUIManager: UIManager = (state, setState) => {
  const handleCloseQualityModal = () => {
    setState({ showQualityModal: false })
  }

  const handleToggleLargeFileDialog = (open: boolean) => {
    setState({ showLargeFileConfirmDialog: open })
  }

  return {
    handleCloseQualityModal,
    handleToggleLargeFileDialog
  }
} 