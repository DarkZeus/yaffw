import type { VideoEditorState } from '../../types/video-editor-mediator.types'

export type UIOperations = {
  handleOpenQualityModal: () => void
  handleCloseQualityModal: () => void
  handleToggleLargeFileDialog: (open: boolean) => void
  handleZoomChange: (zoomLevel: number) => void
}

export type UIManager = (
  state: VideoEditorState,
  setState: (updates: Partial<VideoEditorState>) => void,
  refs: {
    zoomLevelRef: React.MutableRefObject<number>
  }
) => UIOperations

export const createUIManager: UIManager = (state, setState, refs) => {
  const handleOpenQualityModal = () => {
    setState({ showQualityModal: true })
  }

  const handleCloseQualityModal = () => {
    setState({ showQualityModal: false })
  }

  const handleToggleLargeFileDialog = (open: boolean) => {
    setState({ showLargeFileConfirmDialog: open })
  }

  const handleZoomChange = (zoomLevel: number) => {
    refs.zoomLevelRef.current = zoomLevel
    setState({ zoomLevel })
  }

  return {
    handleOpenQualityModal,
    handleCloseQualityModal,
    handleToggleLargeFileDialog,
    handleZoomChange
  }
}