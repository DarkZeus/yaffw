import { TWITTER_ERROR_CODES } from '../constants/twitter.constants'
import type { 
  TwitterAuthConfig,
  TwitterGraphQLResponse, 
  TwitterMediaItem, 
  TwitterSyndicationResponse, 
  TwitterTweetLegacy,
  TwitterTweetResult
} from '../types/twitter.types'
import { requestTweetWithRetry } from './twitter-graphql'

/**
 * Extracts media from GraphQL tweet response
 */
export const extractGraphqlMedia = async (
  response: TwitterGraphQLResponse,
  tweetId: string,
  authConfig: TwitterAuthConfig
): Promise<TwitterMediaItem[] | null> => {
  const tweetResult = response.data?.tweetResult?.result
  
  if (!tweetResult) {
    console.warn('⚠️ No tweet result in GraphQL response')
    return null
  }
  
  const typename = tweetResult.__typename
  
  if (typename === 'TweetUnavailable') {
    const reason = tweetResult.reason
    
    switch (reason) {
      case 'Protected':
        throw new Error(TWITTER_ERROR_CODES.CONTENT_POST_PRIVATE)
      case 'NsfwLoggedOut':
        // Try to retry with cookie authentication if available
        if (authConfig.cookie) {
          console.log('🔄 NSFW content detected, retrying with cookie authentication...')
          try {
            const retryResult = await requestTweetWithRetry(tweetId, authConfig)
            return extractGraphqlMedia(retryResult.response, tweetId, authConfig)
          } catch {
            throw new Error(TWITTER_ERROR_CODES.CONTENT_POST_AGE)
          }
        } else {
          throw new Error(TWITTER_ERROR_CODES.CONTENT_POST_AGE)
        }
      default:
        throw new Error(TWITTER_ERROR_CODES.CONTENT_POST_UNAVAILABLE)
    }
  }
  
  if (!['Tweet', 'TweetWithVisibilityResults'].includes(typename)) {
    throw new Error(TWITTER_ERROR_CODES.CONTENT_POST_UNAVAILABLE)
  }
  
  let baseTweet: TwitterTweetLegacy | undefined
  let repostedTweet: TwitterMediaItem[] | undefined
  
  if (typename === 'TweetWithVisibilityResults') {
    baseTweet = tweetResult.tweet?.legacy
    repostedTweet = baseTweet?.retweeted_status_result?.result?.tweet?.legacy?.extended_entities?.media
  } else {
    baseTweet = tweetResult.legacy
    repostedTweet = baseTweet?.retweeted_status_result?.result?.legacy?.extended_entities?.media
  }
  
  // Check for card-based media (website embeds)
  if (tweetResult.card?.legacy?.binding_values?.length) {
    try {
      const cardData = JSON.parse(tweetResult.card.legacy.binding_values[0].value?.string_value || '{}')
      
      if (['video_website', 'image_website'].includes(cardData.type) &&
          cardData.media_entities &&
          cardData.component_objects?.media_1?.type === 'media') {
        
        const mediaId = cardData.component_objects.media_1.data?.id
        if (mediaId && cardData.media_entities[mediaId]) {
          return [cardData.media_entities[mediaId]]
        }
      }
    } catch (error) {
      console.warn('⚠️ Failed to parse card data:', error)
    }
  }
  
  // Return reposted tweet media or base tweet media
  return repostedTweet || baseTweet?.extended_entities?.media || null
}

/**
 * Extracts media from syndication response
 */
export const extractSyndicationMedia = (response: TwitterSyndicationResponse): TwitterMediaItem[] | null => {
  return response.mediaDetails || null
}

/**
 * Validates media item
 */
export const validateMediaItem = (media: TwitterMediaItem): boolean => {
  if (!media.id_str || !media.type || !media.media_url_https) {
    return false
  }
  
  // Validate media type
  if (!['photo', 'video', 'animated_gif'].includes(media.type)) {
    return false
  }
  
  // Validate video info for video/gif types
  if ((media.type === 'video' || media.type === 'animated_gif') && !media.video_info) {
    return false
  }
  
  return true
}

/**
 * Filters and validates media items
 */
export const filterValidMedia = (media: TwitterMediaItem[]): TwitterMediaItem[] => {
  return media.filter(validateMediaItem)
}

/**
 * Extracts media by index (for specific media selection)
 */
export const extractMediaByIndex = (
  media: TwitterMediaItem[], 
  index: number
): TwitterMediaItem[] | null => {
  if (index < 0 || index >= media.length) {
    console.warn(`⚠️ Media index ${index} out of range (0-${media.length - 1})`)
    return null
  }
  
  return [media[index]]
}

/**
 * Gets file extension from media URL
 */
export const getFileExtension = (url: string): string => {
  try {
    const pathname = new URL(url).pathname
    const parts = pathname.split('.')
    return parts.length > 1 ? parts[parts.length - 1] : 'mp4'
  } catch {
    return 'mp4'
  }
}

/**
 * Determines if media needs container fixing (from Cobalt's bug detection)
 */
export const needsContainerFix = (media: TwitterMediaItem): boolean => {
  const representativeId = media.source_status_id_str || media.id_str
  
  if (!representativeId) return false
  
  try {
    // Twitter epoch and bug timeframe from Cobalt
    const TWITTER_EPOCH = 1288834974657n
    const bugStart = new Date(1701446400000) // Dec 1, 2023
    const bugEnd = new Date(1702605600000)   // Dec 15, 2023
    
    const mediaTimestamp = new Date(
      Number((BigInt(representativeId) >> 22n) + TWITTER_EPOCH)
    )
    
    return mediaTimestamp > bugStart && mediaTimestamp < bugEnd
  } catch {
    return false
  }
}

/**
 * Extracts media type from media item
 */
export const getMediaType = (media: TwitterMediaItem): 'photo' | 'video' | 'gif' => {
  if (media.type === 'animated_gif') return 'gif'
  return media.type
}

/**
 * Checks if media item has audio
 */
export const mediaHasAudio = (media: TwitterMediaItem): boolean => {
  if (media.type === 'photo') return false
  
  // Animated GIFs typically don't have audio
  if (media.type === 'animated_gif') return false
  
  // For videos, assume they have audio unless proven otherwise
  return media.type === 'video'
}

/**
 * Gets media dimensions
 */
export const getMediaDimensions = (media: TwitterMediaItem): { width: number; height: number } | null => {
  if (media.video_info?.aspect_ratio) {
    const [width, height] = media.video_info.aspect_ratio
    return { width, height }
  }
  
  return null
}

/**
 * Gets media duration (for videos)
 */
export const getMediaDuration = (media: TwitterMediaItem): number | null => {
  return media.video_info?.duration_millis || null
}

/**
 * Main media extraction function that handles both GraphQL and Syndication responses
 */
export const extractMedia = async (
  graphqlResponse: TwitterGraphQLResponse | null,
  syndicationResponse: TwitterSyndicationResponse | null,
  tweetId: string,
  authConfig: TwitterAuthConfig,
  mediaIndex?: number
): Promise<TwitterMediaItem[] | null> => {
  let media: TwitterMediaItem[] | null = null
  
  // Try GraphQL first
  if (graphqlResponse) {
    try {
      media = await extractGraphqlMedia(graphqlResponse, tweetId, authConfig)
    } catch (error) {
      console.warn('⚠️ GraphQL media extraction failed:', error)
    }
  }
  
  // Fallback to syndication
  if (!media && syndicationResponse) {
    media = extractSyndicationMedia(syndicationResponse)
  }
  
  if (!media || media.length === 0) {
    return null
  }
  
  // Filter and validate media
  const validMedia = filterValidMedia(media)
  if (validMedia.length === 0) {
    return null
  }
  
  // Extract specific media index if provided
  if (typeof mediaIndex === 'number') {
    return extractMediaByIndex(validMedia, mediaIndex)
  }
  
  return validMedia
} 