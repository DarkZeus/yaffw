import type ReactPlayer from 'react-player'
import type { LocalVideoFile, WaveformPoint } from '../utils/localFileProcessor'
import type { VideoMetadata } from '../utils/videoMetadata'

// Core video state
export type VideoState = {
  currentVideo: LocalVideoFile | null
  isPlaying: boolean
  currentTime: number
  duration: number
  videoMetadata: VideoMetadata
}

// Trimming state
export type TrimState = {
  trimStart: number
  trimEnd: number
}

// Processing states
export type ProcessingState = {
  isUploading: boolean
  isDownloading: boolean
  isProcessing: boolean
  isDeleting: boolean
  uploadProgress: number
}

// UI state
export type UIState = {
  isFullscreen: boolean
  showQualityModal: boolean
  showLargeFileConfirmDialog: boolean
  largeFileSize: number
}

// Combined mediator state
export type VideoEditorState = VideoState & TrimState & ProcessingState & UIState

// Video operations
export type VideoOperations = {
  handlePlayPause: () => void
  handleSeek: (time: number) => void
  handleProgress: (state: { played: number; playedSeconds: number }) => void
  handleDuration: (duration: number) => void
  handleVolumeUpdate: (volume: number, isMuted: boolean) => void
  handleToggleFullscreen: () => Promise<void>
  handleToggleMute: () => void
  handleVolumeChange: (delta: number) => void
}

// File operations
export type FileOperations = {
  onFileDrop: (files: File[]) => Promise<void>
  onUrlDownload: (url: string) => Promise<void>
  handleLoadNewVideo: () => Promise<void>
}

// Trim operations
export type TrimOperations = {
  handleTrimChange: (start: number, end: number) => void
  handleSetTrimStart: () => void
  handleSetTrimEnd: () => void
  handleJumpToTrimStart: () => void
  handleJumpToTrimEnd: () => void
  handleResetTrim: () => void
}

// Export operations
export type ExportOperations = {
  handleTrimVideo: () => Promise<void>
  handleExportWithQuality: (qualitySettings: QualitySettings) => Promise<void>
  handleConfirmLargeFile: () => Promise<void>
}

// Quality settings type
export type QualitySettings = {
  resolution: string
  bitrate: number
  codec: string
  useGpuAcceleration?: boolean
  gpuVendor?: string
}

// UI operations
export type UIOperations = {
  handleCloseQualityModal: () => void
  handleToggleLargeFileDialog: (open: boolean) => void
}

// Mediator interface combining all operations
export type VideoEditorMediator = {
  state: VideoEditorState
  videoOps: VideoOperations
  fileOps: FileOperations
  trimOps: TrimOperations
  exportOps: ExportOperations
  uiOps: UIOperations
  playerRef: React.RefObject<ReactPlayer | null>
  containerRef: React.RefObject<HTMLDivElement | null>
  volumeControlRef: React.RefObject<{ updateState: (volume: number, isMuted: boolean) => void } | null>
}

// Manager function types
export type VideoManager = (
  state: VideoEditorState,
  setState: (updates: Partial<VideoEditorState>) => void,
  refs: {
    playerRef: React.RefObject<ReactPlayer | null>
    containerRef: React.RefObject<HTMLDivElement | null>
    volumeRef: React.MutableRefObject<number>
    isMutedRef: React.MutableRefObject<boolean>
    volumeControlRef: React.RefObject<{ updateState: (volume: number, isMuted: boolean) => void } | null>
  }
) => VideoOperations

export type FileManager = (
  state: VideoEditorState,
  setState: (updates: Partial<VideoEditorState>) => void,
  utils: {
    showError: (message: string, details?: string) => void
    resetAllVideoState: () => void
  }
) => FileOperations

export type TrimManager = (
  state: VideoEditorState,
  setState: (updates: Partial<VideoEditorState>) => void,
  playerRef: React.RefObject<ReactPlayer | null>
) => TrimOperations

export type ExportManager = (
  state: VideoEditorState,
  setState: (updates: Partial<VideoEditorState>) => void,
  utils: {
    showError: (message: string, details?: string) => void
    downloadVideo: (blob: Blob, fileName: string) => void
  }
) => ExportOperations 