import type { AIUpscalingModel, CodecInfo, FrameInterpolationModel, HardwareSupport, QualitySettings, StandardResolution } from '../types/quality-modal.types'

// Standard resolution options
export const STANDARD_RESOLUTIONS: readonly StandardResolution[] = [
  { label: 'Original', value: 'original', width: 0, height: 0 },
  { label: '4K (3840×2160)', value: '4k', width: 3840, height: 2160 },
  { label: '1440p (2560×1440)', value: '1440p', width: 2560, height: 1440 },
  { label: '1080p (1920×1080)', value: '1080p', width: 1920, height: 1080 },
  { label: '720p (1280×720)', value: '720p', width: 1280, height: 720 },
  { label: '480p (854×480)', value: '480p', width: 854, height: 480 },
  { label: '360p (640×360)', value: '360p', width: 640, height: 360 },
] as const

// AI Upscaling models
export const AI_UPSCALING_MODELS: readonly AIUpscalingModel[] = [
  { 
    label: 'ESRGAN', 
    value: 'esrgan', 
    multiplier: 4, 
    description: 'Enhanced Super-Resolution GAN - Best for photos and realistic content'
  },
  { 
    label: 'Real-ESRGAN', 
    value: 'real_esrgan', 
    multiplier: 4, 
    description: 'Practical Super-Resolution - Improved ESRGAN for real-world images'
  },
  { 
    label: 'EDSR', 
    value: 'edsr', 
    multiplier: 2, 
    description: 'Enhanced Deep Super-Resolution - Fast and efficient'
  },
  { 
    label: 'SRCNN', 
    value: 'srcnn', 
    multiplier: 2, 
    description: 'Super-Resolution CNN - Lightweight model'
  },
  { 
    label: 'WAIFU2X', 
    value: 'waifu2x', 
    multiplier: 2, 
    description: 'Specialized for anime and artwork'
  },
  { 
    label: 'SwinIR', 
    value: 'swinir', 
    multiplier: 4, 
    description: 'Vision Transformer based - State-of-the-art quality'
  },
] as const

// Frame interpolation models
export const FRAME_INTERPOLATION_MODELS: readonly FrameInterpolationModel[] = [
  {
    label: 'RIFE',
    value: 'rife',
    description: 'Real-Time Intermediate Flow Estimation - Balanced speed and quality',
    maxFps: 120,
    gpuRequired: true
  },
  {
    label: 'RIFE-NCNN',
    value: 'rife_ncnn',
    description: 'RIFE optimized for mobile/CPU inference',
    maxFps: 60,
    gpuRequired: false
  },
  {
    label: 'DAIN-NCNN',
    value: 'dain_ncnn',
    description: 'Depth-Aware Video Frame Interpolation - High quality',
    maxFps: 60,
    gpuRequired: false
  },
  {
    label: 'FLAVR',
    value: 'flavr',
    description: 'Flow-Agnostic Video Representation - Fast processing',
    maxFps: 120,
    gpuRequired: true
  },
  {
    label: 'XVFI',
    value: 'xvfi',
    description: 'eXtreme Video Frame Interpolation - Best quality',
    maxFps: 60,
    gpuRequired: true
  }
] as const

// Codec definitions with GPU support
export const CODECS: Record<string, CodecInfo> = {
  h264_mp4: {
    label: 'H.264',
    description: 'Most compatible, widely supported',
    container: 'MP4',
    gpu: { nvidia: 'h264_nvenc', amd: 'h264_amf', apple: 'h264_videotoolbox' }
  },
  h265_mp4: {
    label: 'H.265 (HEVC)',
    description: 'Better compression, smaller files',
    container: 'MP4',
    gpu: { nvidia: 'h265_nvenc', amd: 'h265_amf', apple: 'h265_videotoolbox' }
  },
  vp8_webm: {
    label: 'VP8',
    description: 'Older WebM codec, good compatibility',
    container: 'WebM',
    gpu: { nvidia: null, amd: null, apple: null }
  },
  vp9_webm: {
    label: 'VP9',
    description: 'Modern WebM codec, better compression',
    container: 'WebM',
    gpu: { nvidia: 'vp9_nvenc', amd: null, apple: null }
  },
  h264_mov: {
    label: 'H.264',
    description: 'Compatible H.264 in MOV container',
    container: 'MOV',
    gpu: { nvidia: 'h264_nvenc', amd: 'h264_amf', apple: 'h264_videotoolbox' }
  },
  h265_mov: {
    label: 'H.265 (HEVC)',
    description: 'High efficiency in MOV container',
    container: 'MOV',
    gpu: { nvidia: 'h265_nvenc', amd: 'h265_amf', apple: 'h265_videotoolbox' }
  },
  prores_mov: {
    label: 'ProRes',
    description: 'Professional video codec',
    container: 'MOV',
    gpu: { nvidia: null, amd: null, apple: 'prores_videotoolbox' }
  },
  av1: {
    label: 'AV1',
    description: 'Next-gen codec, best compression (Experimental)',
    container: 'MP4',
    experimental: true,
    gpu: { nvidia: 'av1_nvenc', amd: 'av1_amf', apple: null }
  }
} as const

export const DEFAULT_SETTINGS: QualitySettings = {
  resolution: 'original',
  bitrate: [10],
  bitrateInput: '10',
  codec: 'h264_mp4',
  useGpuAcceleration: false,
  useAIUpscaling: false,
  aiModel: 'esrgan',
  useFrameInterpolation: false,
  frameInterpolationModel: 'rife',
  targetFps: 60
}

// Mock hardware acceleration support detection
export const HARDWARE_SUPPORT: HardwareSupport = {
  nvidia: false, // NVENC support - detected via nvidia-ml-py or nvidia-smi
  amd: false,    // AMD VCE support - detected via AMD GPU drivers
  apple: true,   // VideoToolbox support - detected via macOS version + Apple Silicon
}

export const GPU_VENDOR_LABELS = {
  nvidia: 'NVENC',
  amd: 'VCE',
  apple: 'VideoToolbox'
} as const 