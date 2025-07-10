import { TWITTER_MEDIA_QUALITY } from '../constants/twitter.constants'
import type { TwitterMediaItem, TwitterVideoVariant } from '../types/twitter.types'

/**
 * Gets the best quality video variant based on bitrate
 */
export const getBestQuality = (variants: TwitterVideoVariant[]): string | null => {
  if (!variants || variants.length === 0) {
    return null
  }
  
  // Filter for MP4 variants first (preferred format)
  const mp4Variants = variants.filter(v => v.content_type === TWITTER_MEDIA_QUALITY.VIDEO_PREFERRED_FORMAT)
  
  // If we have MP4 variants, choose the one with highest bitrate
  if (mp4Variants.length > 0) {
    const bestMp4 = mp4Variants.reduce((best, current) => {
      const bestBitrate = Number(best.bitrate) || 0
      const currentBitrate = Number(current.bitrate) || 0
      return currentBitrate > bestBitrate ? current : best
    })
    
    return bestMp4.url
  }
  
  // Fallback to any variant with highest bitrate
  const bestVariant = variants.reduce((best, current) => {
    const bestBitrate = Number(best.bitrate) || 0
    const currentBitrate = Number(current.bitrate) || 0
    return currentBitrate > bestBitrate ? current : best
  })
  
  return bestVariant.url
}

/**
 * Gets the worst quality video variant (for bandwidth-limited situations)
 */
export const getWorstQuality = (variants: TwitterVideoVariant[]): string | null => {
  if (!variants || variants.length === 0) {
    return null
  }
  
  // Filter for MP4 variants first
  const mp4Variants = variants.filter(v => v.content_type === TWITTER_MEDIA_QUALITY.VIDEO_PREFERRED_FORMAT)
  
  // If we have MP4 variants, choose the one with lowest bitrate
  if (mp4Variants.length > 0) {
    const worstMp4 = mp4Variants.reduce((worst, current) => {
      const worstBitrate = Number(worst.bitrate) || Number.POSITIVE_INFINITY
      const currentBitrate = Number(current.bitrate) || Number.POSITIVE_INFINITY
      return currentBitrate < worstBitrate ? current : worst
    })
    
    return worstMp4.url
  }
  
  // Fallback to any variant with lowest bitrate
  const worstVariant = variants.reduce((worst, current) => {
    const worstBitrate = Number(worst.bitrate) || Number.POSITIVE_INFINITY
    const currentBitrate = Number(current.bitrate) || Number.POSITIVE_INFINITY
    return currentBitrate < worstBitrate ? current : worst
  })
  
  return worstVariant.url
}

/**
 * Gets video variant by specific quality preference
 */
export const getQualityByPreference = (
  variants: TwitterVideoVariant[], 
  quality: 'best' | 'worst' | string
): string | null => {
  switch (quality) {
    case 'best':
      return getBestQuality(variants)
    case 'worst':
      return getWorstQuality(variants)
    default: {
      // Try to find variant with specific bitrate or quality indicator
      const specificVariant = variants.find(v => 
        v.url.includes(quality) || 
        v.bitrate?.toString().includes(quality)
      )
      return specificVariant?.url || getBestQuality(variants)
    }
  }
}

/**
 * Gets HLS variant (for subtitle extraction)
 */
export const getHlsVariant = (variants: TwitterVideoVariant[]): TwitterVideoVariant | null => {
  return variants.find(v => v.content_type === TWITTER_MEDIA_QUALITY.FALLBACK_FORMAT) || null
}

/**
 * Gets all available quality options for a media item
 */
export const getAvailableQualities = (media: TwitterMediaItem): string[] => {
  if (!media.video_info?.variants) {
    return []
  }
  
  const qualities = new Set<string>()
  
  for (const variant of media.video_info.variants) {
    if (variant.bitrate) {
      qualities.add(`${variant.bitrate}kbps`)
    }
    
    // Add format-based quality indicators
    if (variant.content_type === TWITTER_MEDIA_QUALITY.VIDEO_PREFERRED_FORMAT) {
      qualities.add('mp4')
    } else if (variant.content_type === TWITTER_MEDIA_QUALITY.FALLBACK_FORMAT) {
      qualities.add('hls')
    }
  }
  
  return Array.from(qualities).sort()
}

/**
 * Gets the optimal image quality URL
 */
export const getImageQuality = (media: TwitterMediaItem): string => {
  if (media.type !== 'photo') {
    return media.media_url_https
  }
  
  // Add quality parameter for maximum resolution
  return `${media.media_url_https}${TWITTER_MEDIA_QUALITY.IMAGE_QUALITY}`
}

/**
 * Determines if media supports quality selection
 */
export const supportsQualitySelection = (media: TwitterMediaItem): boolean => {
  if (media.type === 'photo') {
    return true // Images always support quality selection via URL parameters
  }
  
  return !!(media.video_info?.variants && media.video_info.variants.length > 1)
}

/**
 * Gets video variants sorted by quality (highest to lowest)
 */
export const getSortedVariants = (variants: TwitterVideoVariant[]): TwitterVideoVariant[] => {
  return [...variants].sort((a, b) => {
    const bitrateA = Number(a.bitrate) || 0
    const bitrateB = Number(b.bitrate) || 0
    return bitrateB - bitrateA // Descending order
  })
}

/**
 * Gets format information for a variant
 */
export const getVariantFormat = (variant: TwitterVideoVariant): {
  format: string
  isPreferred: boolean
  isHls: boolean
} => {
  const isPreferred = variant.content_type === TWITTER_MEDIA_QUALITY.VIDEO_PREFERRED_FORMAT
  const isHls = variant.content_type === TWITTER_MEDIA_QUALITY.FALLBACK_FORMAT
  
  let format = 'unknown'
  if (isPreferred) {
    format = 'mp4'
  }
  if (isHls) {
    format = 'hls'
  }
  if (!isPreferred && !isHls) {
    format = variant.content_type.split('/')[1] || 'unknown'
  }
  
  return { format, isPreferred, isHls }
}

/**
 * Gets bitrate information in human-readable format
 */
export const formatBitrate = (bitrate: number | undefined): string => {
  if (!bitrate) return 'Unknown'
  
  if (bitrate >= 1000) {
    return `${(bitrate / 1000).toFixed(1)}Mbps`
  }
  
  return `${bitrate}kbps`
}

/**
 * Estimates file size based on bitrate and duration
 */
export const estimateFileSize = (
  bitrate: number | undefined, 
  durationMs: number | undefined
): string => {
  if (!bitrate || !durationMs) return 'Unknown'
  
  const durationSeconds = durationMs / 1000
  const sizeBytes = (bitrate * 1000 * durationSeconds) / 8 // Convert to bytes
  
  if (sizeBytes >= 1024 * 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(1)}GB`
  } else if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)}MB`
  } else if (sizeBytes >= 1024) {
    return `${(sizeBytes / 1024).toFixed(1)}KB`
  }
  
  return `${sizeBytes.toFixed(0)}B`
}

/**
 * Main quality selection function
 */
export const selectMediaQuality = (
  media: TwitterMediaItem,
  qualityPreference: 'best' | 'worst' | string = 'best'
): string => {
  if (media.type === 'photo') {
    return getImageQuality(media)
  }
  
  if (!media.video_info?.variants) {
    return media.media_url_https
  }
  
  const selectedUrl = getQualityByPreference(media.video_info.variants, qualityPreference)
  return selectedUrl || media.media_url_https
} 