import { TWITTER_ERROR_CODES } from '../constants/twitter.constants'
import type { 
  TwitterAuthConfig, 
  TwitterDownloadOptions, 
  TwitterDownloadResult, 
  TwitterMediaItem
} from '../types/twitter.types'
import { createAuthConfig, getGuestToken } from './twitter-auth'
import { requestTweetWithRetry } from './twitter-graphql'
import { extractMedia, getFileExtension, getMediaType, needsContainerFix } from './twitter-media-extractor'
import { selectMediaQuality } from './twitter-quality'
import { requestSyndicationWithRetry } from './twitter-syndication'
import { parseTwitterUrl } from './twitter-url-parser'

/**
 * Generates filename for Twitter media
 */
const generateFilename = (
  tweetId: string, 
  media: TwitterMediaItem, 
  index?: number,
  isGif = false
): string => {
  const mediaType = getMediaType(media)
  const extension = isGif ? 'gif' : getFileExtension(media.media_url_https)
  
  if (typeof index === 'number') {
    return `twitter_${tweetId}_${index + 1}.${extension}`
  }
  
  return `twitter_${tweetId}.${extension}`
}

/**
 * Creates proxy stream configuration
 */
const createProxyStream = (url: string, filename: string) => {
  // This would integrate with YAFFW's existing stream management
  // For now, return the direct URL - this will be integrated with backend
  return {
    service: 'twitter',
    type: 'proxy' as const,
    url,
    filename
  }
}

/**
 * Handles single media item download
 */
const handleSingleMedia = (
  media: TwitterMediaItem,
  tweetId: string,
  options: TwitterDownloadOptions
): TwitterDownloadResult => {
  const mediaType = getMediaType(media)
  
  if (mediaType === 'photo') {
    const imageUrl = selectMediaQuality(media, options.quality)
    const filename = generateFilename(tweetId, media)
    
    return {
      type: 'proxy',
      isPhoto: true,
      filename,
      urls: imageUrl
    }
  }
  
  // Handle video/gif
  if (!media.video_info?.variants) {
    throw new Error('No video variants available')
  }
  
  const videoUrl = selectMediaQuality(media, options.quality)
  const shouldConvertToGif = media.type === 'animated_gif' && options.toGif
  const needsRemux = needsContainerFix(media) || shouldConvertToGif
  
  const filename = generateFilename(tweetId, media, undefined, shouldConvertToGif)
  const audioFilename = `twitter_${tweetId}_audio`
  
  return {
    type: needsRemux ? 'remux' : 'proxy',
    urls: videoUrl,
    filename,
    audioFilename,
    isGif: media.type === 'animated_gif'
  }
}

/**
 * Handles multiple media items (picker interface)
 */
const handleMultipleMedia = (
  mediaItems: TwitterMediaItem[],
  tweetId: string,
  options: TwitterDownloadOptions
): TwitterDownloadResult => {
  const picker = mediaItems.map((media, index) => {
    const mediaType = getMediaType(media)
    
    if (mediaType === 'photo') {
      const imageUrl = selectMediaQuality(media, options.quality)
      const proxiedUrl = options.alwaysProxy 
        ? createProxyStream(imageUrl, generateFilename(tweetId, media, index)).url || imageUrl
        : imageUrl
      
      return {
        type: 'photo' as const,
        url: proxiedUrl,
        thumb: createProxyStream(imageUrl, generateFilename(tweetId, media, index)).url || imageUrl
      }
    }
    
    // Handle video/gif
    const videoUrl = selectMediaQuality(media, options.quality)
    const shouldConvertToGif = media.type === 'animated_gif' && options.toGif
    const needsRemux = needsContainerFix(media) || shouldConvertToGif
    const filename = generateFilename(tweetId, media, index, shouldConvertToGif)
    
         const finalUrl = needsRemux || options.alwaysProxy 
       ? createProxyStream(videoUrl, filename).url || videoUrl
       : videoUrl
     const type: 'video' | 'gif' = shouldConvertToGif ? 'gif' : 'video'
    
    return {
      type,
      url: finalUrl,
      thumb: createProxyStream(media.media_url_https, generateFilename(tweetId, media, index)).url || media.media_url_https
    }
  })
  
  return { type: 'picker', picker }
}

/**
 * Main Twitter media download function
 */
export const downloadTwitterMedia = async (
  url: string,
  options: TwitterDownloadOptions = {}
): Promise<TwitterDownloadResult> => {
  console.log('🐦 Starting Twitter media download for:', url)
  
  // Parse and validate URL
  const parsedUrl = parseTwitterUrl(url)
  if (!parsedUrl.isValid) {
    throw new Error(parsedUrl.error || TWITTER_ERROR_CODES.INVALID_URL)
  }
  
  const { tweetId, mediaIndex } = parsedUrl
  
  // Create authentication configuration
  let authConfig: TwitterAuthConfig = {}
  
  try {
    // Get guest token
    console.log('🔑 Obtaining Twitter guest token...')
    const guestToken = await getGuestToken()
    if (!guestToken) {
      throw new Error('Failed to obtain guest token')
    }
    
    authConfig = createAuthConfig({ guestToken })
    
    let graphqlResponse = null
    let syndicationResponse = null
    let usedSyndication = false
    
    // Try GraphQL API first
    try {
      console.log('🐦 Attempting GraphQL API...')
      const result = await requestTweetWithRetry(tweetId, authConfig)
      graphqlResponse = result.response
      
      // Update auth config if cookies were updated
      if (result.updatedAuth) {
        authConfig = result.updatedAuth
      }
      
      console.log('✅ GraphQL API successful')
    } catch (graphqlError) {
      console.warn('⚠️ GraphQL API failed, falling back to Syndication API:', graphqlError)
      usedSyndication = true
      
      // Fallback to Syndication API
      try {
        console.log('📡 Attempting Syndication API...')
        syndicationResponse = await requestSyndicationWithRetry(tweetId)
        console.log('✅ Syndication API successful')
      } catch (syndicationError) {
        console.error('❌ Both GraphQL and Syndication APIs failed')
        throw new Error(TWITTER_ERROR_CODES.FETCH_FAIL)
      }
    }
    
    // Extract media from responses
    console.log('🎬 Extracting media from API response...')
    const media = await extractMedia(
      graphqlResponse,
      syndicationResponse,
      tweetId,
      authConfig,
      mediaIndex
    )
    
    if (!media || media.length === 0) {
      throw new Error(TWITTER_ERROR_CODES.FETCH_EMPTY)
    }
    
    console.log(`📱 Found ${media.length} media item(s)`)
    
    // Handle single vs multiple media
    if (media.length === 1) {
      const result = handleSingleMedia(media[0], tweetId, options)
      console.log('✅ Twitter media download configured successfully')
      return result
    } else {
      const result = handleMultipleMedia(media, tweetId, options)
      console.log('✅ Twitter media picker configured successfully')
      return result
    }
    
  } catch (error) {
    console.error('❌ Twitter media download failed:', error)
    throw error
  }
}

/**
 * Gets Twitter media information without downloading
 */
export const getTwitterMediaInfo = async (url: string): Promise<{
  tweetId: string
  mediaCount: number
  mediaTypes: string[]
  hasVideo: boolean
  hasPhoto: boolean
  hasGif: boolean
}> => {
  const parsedUrl = parseTwitterUrl(url)
  if (!parsedUrl.isValid) {
    throw new Error(parsedUrl.error || TWITTER_ERROR_CODES.INVALID_URL)
  }
  
  const { tweetId } = parsedUrl
  
  // Get guest token and try to fetch media info
  const guestToken = await getGuestToken()
  if (!guestToken) {
    throw new Error('Failed to obtain guest token')
  }
  
  const authConfig = createAuthConfig({ guestToken })
  
  let graphqlResponse = null
  let syndicationResponse = null
  
  try {
    const result = await requestTweetWithRetry(tweetId, authConfig)
    graphqlResponse = result.response
  } catch {
    try {
      syndicationResponse = await requestSyndicationWithRetry(tweetId)
    } catch {
      throw new Error(TWITTER_ERROR_CODES.FETCH_FAIL)
    }
  }
  
  const media = await extractMedia(graphqlResponse, syndicationResponse, tweetId, authConfig)
  
  if (!media || media.length === 0) {
    throw new Error(TWITTER_ERROR_CODES.FETCH_EMPTY)
  }
  
  const mediaTypes = media.map(m => getMediaType(m))
  
  return {
    tweetId,
    mediaCount: media.length,
    mediaTypes,
    hasVideo: mediaTypes.includes('video'),
    hasPhoto: mediaTypes.includes('photo'),
    hasGif: mediaTypes.includes('gif')
  }
}

/**
 * Validates if URL is a supported Twitter URL
 */
export const isTwitterMediaUrl = (url: string): boolean => {
  const parsedUrl = parseTwitterUrl(url)
  return parsedUrl.isValid
} 