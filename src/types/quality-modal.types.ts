export type QualityModalProps = {
  isOpen: boolean
  onClose: () => void
  onExport: (settings: ExportSettings) => void
  videoMetadata?: {
    width?: number
    height?: number
    codec?: string
    bitrate?: number
    fps?: number
  }
}

export type ExportSettings = {
  resolution: string
  bitrate: number
  codec: string
  useGpuAcceleration?: boolean
  gpuVendor?: string
  useAIUpscaling?: boolean
  aiModel?: string
  useFrameInterpolation?: boolean
  frameInterpolationModel?: string
  targetFps?: number
}

export type StandardResolution = {
  label: string
  value: string
  width: number
  height: number
}

export type AIUpscalingModel = {
  label: string
  value: string
  multiplier: number
  description: string
}

export type FrameInterpolationModel = {
  label: string
  value: string
  description: string
  maxFps: number
  gpuRequired: boolean
}

export type QualitySettings = {
  resolution: string
  bitrate: number[]
  bitrateInput: string
  codec: string
  useGpuAcceleration: boolean
  useAIUpscaling: boolean
  aiModel: string
  useFrameInterpolation: boolean
  frameInterpolationModel: string
  targetFps: number
}

export type CodecInfo = {
  label: string
  description: string
  container: string
  experimental?: boolean
  gpu: {
    nvidia: string | null
    amd: string | null
    apple: string | null
  }
}

export type GpuAcceleration = {
  vendor: string
  encoder: string
}

export type HardwareSupport = {
  nvidia: boolean
  amd: boolean
  apple: boolean
}

// Mediator pattern types
export type SectionType = 'resolution' | 'bitrate' | 'codec' | 'gpu' | 'frameInterpolation'

export type SectionChangeEvent = {
  section: SectionType
  field: string
  value: unknown
  metadata?: Record<string, unknown>
}

export type SectionProps = {
  settings: QualitySettings
  videoMetadata?: QualityModalProps['videoMetadata']
  onSettingsChange: (event: SectionChangeEvent) => void
  isDisabled?: boolean
}

export type QualityMediator = {
  updateSettings: (event: SectionChangeEvent) => void
  getSettings: () => QualitySettings
  isGpuAccelerationAvailable: (codec?: string) => boolean
  getAvailableGpuAcceleration: (codec?: string) => GpuAcceleration | null
  validateBitrateInput: (value: string) => boolean
  getCategorizedResolutions: () => {
    original: StandardResolution | undefined
    downscale: StandardResolution[]
    upscale: StandardResolution[]
  }
} 