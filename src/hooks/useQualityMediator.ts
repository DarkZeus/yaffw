import { useCallback, useState } from 'react'
import { DEFAULT_SETTINGS } from '../constants/quality-modal.constants'
import type { QualityMediator, QualityModalProps, QualitySettings, SectionChangeEvent } from '../types/quality-modal.types'
import { 
  getAvailableGpuAcceleration, 
  getCategorizedResolutions, 
  isGpuAccelerationAvailable, 
  validateBitrateInput 
} from '../utils/quality-modal.utils'

export const useQualityMediator = (videoMetadata?: QualityModalProps['videoMetadata']): [QualitySettings, QualityMediator] => {
  const [settings, setSettings] = useState<QualitySettings>(DEFAULT_SETTINGS)

  const updateSettings = useCallback((event: SectionChangeEvent) => {
    const { section, field, value } = event

    setSettings(prev => {
      const newSettings = { ...prev }

      // Handle different section updates
      switch (section) {
        case 'resolution':
          if (field === 'resolution') {
            newSettings.resolution = value as string
          }
          if (field === 'useAIUpscaling') {
            newSettings.useAIUpscaling = value as boolean
          }
          if (field === 'aiModel') {
            newSettings.aiModel = value as string
          }
          break

        case 'bitrate':
          if (field === 'bitrate') {
            newSettings.bitrate = value as number[]
            newSettings.bitrateInput = (value as number[])[0].toString()
          }
          if (field === 'bitrateInput') {
            newSettings.bitrateInput = value as string
            if (validateBitrateInput(value as string)) {
              newSettings.bitrate = [Number.parseInt(value as string, 10)]
            }
          }
          break

        case 'codec':
          if (field === 'codec') {
            newSettings.codec = value as string
            // Auto-disable GPU acceleration if not supported for new codec
            if (newSettings.useGpuAcceleration && !isGpuAccelerationAvailable(value as string)) {
              newSettings.useGpuAcceleration = false
            }
          }
          break

        case 'gpu':
          if (field === 'useGpuAcceleration') {
            newSettings.useGpuAcceleration = value as boolean
          }
          break

        case 'frameInterpolation':
          if (field === 'useFrameInterpolation') {
            newSettings.useFrameInterpolation = value as boolean
          }
          if (field === 'frameInterpolationModel') {
            newSettings.frameInterpolationModel = value as string
          }
          if (field === 'targetFps') {
            newSettings.targetFps = value as number
          }
          break
      }

      return newSettings
    })
  }, [])

  const mediator: QualityMediator = {
    updateSettings,
    getSettings: () => settings,
    isGpuAccelerationAvailable: (codec) => isGpuAccelerationAvailable(codec ?? settings.codec),
    getAvailableGpuAcceleration: (codec) => getAvailableGpuAcceleration(codec ?? settings.codec),
    validateBitrateInput,
    getCategorizedResolutions: () => getCategorizedResolutions(videoMetadata)
  }

  return [settings, mediator]
} 