export interface VideoMetadata {
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

// Extended HTMLVideoElement interface for browser-specific properties
interface ExtendedHTMLVideoElement extends HTMLVideoElement {
  mozHasAudio?: boolean
  webkitAudioDecodedByteCount?: number
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
    
    const checkComplete = () => {
      if (videoLoaded && audioLoaded) {
        // Calculate additional properties
        if (metadata.width && metadata.height) {
          const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b)
          const divisor = gcd(metadata.width, metadata.height)
          metadata.aspectRatio = `${metadata.width / divisor}:${metadata.height / divisor}`
        }
        
        // Clean up
        URL.revokeObjectURL(url)
        resolve(metadata)
      }
    }
    
    video.onloadedmetadata = () => {
      metadata.width = video.videoWidth
      metadata.height = video.videoHeight
      metadata.bitrate = Math.round((file.size * 8) / video.duration)
      
      // Try to detect if video has audio track
      const extendedVideo = video as ExtendedHTMLVideoElement
      if (extendedVideo.mozHasAudio !== undefined) {
        metadata.hasAudio = extendedVideo.mozHasAudio
      } else if (extendedVideo.webkitAudioDecodedByteCount !== undefined) {
        metadata.hasAudio = extendedVideo.webkitAudioDecodedByteCount > 0
      }
      
      videoLoaded = true
      checkComplete()
    }
    
    audio.onloadedmetadata = () => {
      // Audio-specific metadata would be extracted here
      // Note: HTML5 audio element has limited metadata access
      // For more detailed audio info, we'd need a library like ffprobe
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
    
    // Set timeout to prevent hanging
    setTimeout(() => {
      if (!videoLoaded || !audioLoaded) {
        URL.revokeObjectURL(url)
        resolve(metadata)
      }
    }, 5000)
    
    video.src = url
    audio.src = url
  })
}

// Enhanced metadata extraction using MediaInfo-like approach
export async function extractDetailedVideoMetadata(file: File): Promise<VideoMetadata> {
  const basicMetadata = await extractVideoMetadata(file)
  
  // For more detailed metadata, we could integrate with:
  // - FFprobe (server-side)
  // - MediaInfo.js (client-side library)
  // - WebCodecs API (modern browsers)
  
  // Estimate audio bitrate more realistically
  let estimatedAudioBitrate: number | undefined
  if (basicMetadata.hasAudio && basicMetadata.bitrate) {
    // Assume audio takes 10-20% of total bitrate for typical videos
    // For a 1080p video, audio is usually 128-256 Kbps
    const totalBitrate = basicMetadata.bitrate
    const estimatedAudioPercentage = 0.15 // 15% of total bitrate
    const rawEstimate = totalBitrate * estimatedAudioPercentage
    
    // Clamp to realistic audio bitrate ranges (64 Kbps to 320 Kbps)
    estimatedAudioBitrate = Math.max(64000, Math.min(320000, rawEstimate))
  }
  
  return {
    ...basicMetadata,
    // Add estimated values based on file analysis
    audioChannels: basicMetadata.hasAudio ? 2 : 0, // Assume stereo if audio present
    audioSampleRate: basicMetadata.hasAudio ? 44100 : undefined, // Common sample rate
    audioBitrate: estimatedAudioBitrate,
  }
} 