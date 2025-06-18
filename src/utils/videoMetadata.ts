export type VideoMetadata = {
  width?: number
  height?: number
  bitrate?: number
  codec?: string
  fps?: number
  audioCodec?: string
  audioBitrate?: number
  audioChannels?: number
  audioSampleRate?: number
  hasAudio?: boolean
  aspectRatio?: string
  pixelFormat?: string
  profile?: string
}

// Extended HTMLVideoElement type for browser-specific properties
type ExtendedHTMLVideoElement = HTMLVideoElement & {
  mozHasAudio?: boolean
  webkitAudioDecodedByteCount?: number
}

const calculateAspectRatio = (width: number, height: number): string => {
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b)
  const divisor = gcd(width, height)
  return `${width / divisor}:${height / divisor}`
}

const detectVideoAudio = (video: ExtendedHTMLVideoElement): boolean => {
  if (video.mozHasAudio !== undefined) return video.mozHasAudio
  if (video.webkitAudioDecodedByteCount !== undefined) return video.webkitAudioDecodedByteCount > 0
  return false
}

export async function extractVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const audio = document.createElement('audio')
    const url = URL.createObjectURL(file)
    
    video.preload = 'metadata'
    video.muted = true
    audio.preload = 'metadata'
    
    let videoLoaded = false
    let audioLoaded = false
    const metadata: VideoMetadata = {}
    
    const cleanup = () => {
      URL.revokeObjectURL(url)
    }
    
    const checkComplete = () => {
      if (!videoLoaded || !audioLoaded) return
      
      // Calculate additional properties
      if (metadata.width && metadata.height) {
        metadata.aspectRatio = calculateAspectRatio(metadata.width, metadata.height)
      }
      
      cleanup()
      resolve(metadata)
    }
    
    video.onloadedmetadata = () => {
      metadata.width = video.videoWidth
      metadata.height = video.videoHeight
      metadata.bitrate = Math.round((file.size * 8) / video.duration)
      metadata.hasAudio = detectVideoAudio(video as ExtendedHTMLVideoElement)
      
      videoLoaded = true
      checkComplete()
    }
    
    audio.onloadedmetadata = () => {
      metadata.hasAudio = true
      audioLoaded = true
      checkComplete()
    }
    
    video.onerror = () => {
      videoLoaded = true
      checkComplete()
    }
    
    audio.onerror = () => {
      audioLoaded = true
      checkComplete()
    }
    
    // Timeout fallback
    setTimeout(() => {
      if (videoLoaded && audioLoaded) return
      cleanup()
      resolve(metadata)
    }, 5000)
    
    video.src = url
    audio.src = url
  })
}

const estimateAudioBitrate = (totalBitrate: number): number => {
  const estimatedAudioPercentage = 0.15 // 15% of total bitrate
  const rawEstimate = totalBitrate * estimatedAudioPercentage
  
  // Clamp to realistic audio bitrate ranges (64 Kbps to 320 Kbps)
  return Math.max(64000, Math.min(320000, rawEstimate))
}

// Enhanced metadata extraction using MediaInfo-like approach
export async function extractDetailedVideoMetadata(file: File): Promise<VideoMetadata> {
  const basicMetadata = await extractVideoMetadata(file)
  
  // For more detailed metadata, we could integrate with:
  // - FFprobe (server-side)
  // - MediaInfo.js (client-side library)
  // - WebCodecs API (modern browsers)
  
  // Early return if no audio
  if (!basicMetadata.hasAudio) {
    return {
      ...basicMetadata,
      audioChannels: 0,
    }
  }
  
  // Calculate audio bitrate estimation
  const audioBitrate = basicMetadata.bitrate 
    ? estimateAudioBitrate(basicMetadata.bitrate) 
    : undefined
  
  return {
    ...basicMetadata,
    audioChannels: 2, // Assume stereo if audio present
    audioSampleRate: 44100, // Common sample rate
    audioBitrate,
  }
} 