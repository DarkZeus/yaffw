import { CODECS, GPU_VENDOR_LABELS, HARDWARE_SUPPORT, STANDARD_RESOLUTIONS } from '../constants/quality-modal.constants'
import type { GpuAcceleration, QualityModalProps, QualitySettings, StandardResolution } from '../types/quality-modal.types'

// Helper functions
export const getAvailableGpuAcceleration = (codecValue: string): GpuAcceleration | null => {
  const codecInfo = CODECS[codecValue]
  if (!codecInfo) return null
  
  const supportedVendor = Object.entries(HARDWARE_SUPPORT).find(
    ([vendor, isSupported]) => isSupported && codecInfo.gpu[vendor as keyof typeof codecInfo.gpu]
  )
  
  if (!supportedVendor) return null
  
  const [vendor] = supportedVendor
  const encoder = codecInfo.gpu[vendor as keyof typeof codecInfo.gpu]
  
  if (!encoder) return null
  
  return { vendor, encoder }
}

export const isGpuAccelerationAvailable = (codecValue: string): boolean => {
  return getAvailableGpuAcceleration(codecValue) !== null
}

export const getFinalCodec = (settings: QualitySettings): string => {
  if (!settings.useGpuAcceleration) return settings.codec
  
  const acceleration = getAvailableGpuAcceleration(settings.codec)
  return acceleration?.encoder ?? settings.codec
}

export const getCategorizedResolutions = (videoMetadata?: QualityModalProps['videoMetadata']) => {
  const original = STANDARD_RESOLUTIONS.find(r => r.value === 'original')
  
  if (!videoMetadata?.width || !videoMetadata?.height || !original) {
    return {
      original,
      downscale: STANDARD_RESOLUTIONS.filter(r => r.value !== 'original'),
      upscale: []
    }
  }

  const { width: sourceWidth, height: sourceHeight } = videoMetadata
  
  const downscale = STANDARD_RESOLUTIONS.filter(r => 
    r.value !== 'original' && r.width < sourceWidth && r.height < sourceHeight
  )
  
  const upscale = STANDARD_RESOLUTIONS.filter(r => 
    r.value !== 'original' && r.width > sourceWidth && r.height > sourceHeight
  )

  return { original, downscale, upscale }
}

export const validateBitrateInput = (value: string): boolean => {
  const numValue = Number.parseInt(value, 10)
  return !Number.isNaN(numValue) && numValue >= 1 && numValue <= 100
}

export const getGpuVendorLabel = (vendor: string): string => {
  return GPU_VENDOR_LABELS[vendor as keyof typeof GPU_VENDOR_LABELS] ?? vendor
} 