import { TWITTER_DOMAINS, TWITTER_ERROR_CODES, TWITTER_TWEET_ID_REGEX } from '../constants/twitter.constants'
import type { TwitterParsedUrl } from '../types/twitter.types'

/**
 * Checks if a URL is a Twitter/X URL
 */
export const isTwitterUrl = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url)
    const hostname = parsedUrl.hostname.toLowerCase()
    
    // Check primary domain
    if (hostname === TWITTER_DOMAINS.PRIMARY) return true
    
    // Check alternative domains
    if ((TWITTER_DOMAINS.ALTERNATIVE as readonly string[]).includes(hostname)) return true
    
    // Check subdomains
    const subdomain = hostname.split('.')[0]
    if ((TWITTER_DOMAINS.SUBDOMAINS as readonly string[]).includes(subdomain) && hostname.includes('twitter.com')) return true
    
    return false
  } catch {
    return false
  }
}

/**
 * Normalizes Twitter URL to standard format
 */
export const normalizeTwitterUrl = (url: string): string => {
  try {
    const parsedUrl = new URL(url)
    
    // Convert alternative domains to twitter.com
    if ((TWITTER_DOMAINS.ALTERNATIVE as readonly string[]).includes(parsedUrl.hostname)) {
      parsedUrl.hostname = TWITTER_DOMAINS.PRIMARY
    }
    
    // Remove mobile subdomain
    if (parsedUrl.hostname.startsWith('mobile.')) {
      parsedUrl.hostname = parsedUrl.hostname.replace('mobile.', '')
    }
    
    // Remove unnecessary query parameters except post_id
    const postId = parsedUrl.searchParams.get('post_id')
    parsedUrl.search = ''
    if (postId) {
      parsedUrl.searchParams.set('post_id', postId)
    }
    
    // Remove hash
    parsedUrl.hash = ''
    
    return parsedUrl.toString()
  } catch {
    return url
  }
}

/**
 * Extracts tweet ID from various Twitter URL formats
 */
export const extractTweetId = (url: string): string | null => {
  try {
    const normalizedUrl = normalizeTwitterUrl(url)
    const parsedUrl = new URL(normalizedUrl)
    
    // Handle bookmark URLs: i/bookmarks?post_id=123456789
    const postId = parsedUrl.searchParams.get('post_id')
    if (postId && TWITTER_TWEET_ID_REGEX.test(postId)) {
      return postId
    }
    
    // Handle standard status URLs: /user/status/123456789
    const pathParts = parsedUrl.pathname.split('/').filter(Boolean)
    
    if (pathParts.length >= 3 && pathParts[1] === 'status') {
      const tweetId = pathParts[2]
      if (TWITTER_TWEET_ID_REGEX.test(tweetId)) {
        return tweetId
      }
    }
    
    return null
  } catch {
    return null
  }
}

/**
 * Extracts media index from Twitter URL (for multi-media tweets)
 */
export const extractMediaIndex = (url: string): number | null => {
  try {
    const parsedUrl = new URL(url)
    const pathParts = parsedUrl.pathname.split('/').filter(Boolean)
    
    // Look for /video/N or /photo/N patterns
    for (let i = 0; i < pathParts.length - 1; i++) {
      if ((pathParts[i] === 'video' || pathParts[i] === 'photo') && pathParts[i + 1]) {
        const index = Number.parseInt(pathParts[i + 1], 10)
        if (!Number.isNaN(index) && index > 0) {
          return index - 1 // Convert to 0-based index
        }
      }
    }
    
    return null
  } catch {
    return null
  }
}

/**
 * Validates tweet ID format
 */
export const isValidTweetId = (tweetId: string): boolean => {
  return TWITTER_TWEET_ID_REGEX.test(tweetId)
}

/**
 * Parses Twitter URL and extracts all relevant information
 */
export const parseTwitterUrl = (url: string): TwitterParsedUrl => {
  if (!url || typeof url !== 'string') {
    return {
      tweetId: '',
      isValid: false,
      error: TWITTER_ERROR_CODES.INVALID_URL
    }
  }
  
  // Check if it's a Twitter URL
  if (!isTwitterUrl(url)) {
    return {
      tweetId: '',
      isValid: false,
      error: TWITTER_ERROR_CODES.INVALID_URL
    }
  }
  
  // Extract tweet ID
  const tweetId = extractTweetId(url)
  if (!tweetId) {
    return {
      tweetId: '',
      isValid: false,
      error: TWITTER_ERROR_CODES.INVALID_TWEET_ID
    }
  }
  
  // Extract media index (optional)
  const mediaIndex = extractMediaIndex(url)
  
  return {
    tweetId,
    mediaIndex: mediaIndex ?? undefined,
    isValid: true
  }
}

/**
 * Generates a standard Twitter URL from tweet ID
 */
export const generateTwitterUrl = (tweetId: string, username = 'twitter'): string => {
  if (!isValidTweetId(tweetId)) {
    throw new Error('Invalid tweet ID')
  }
  
  return `https://twitter.com/${username}/status/${tweetId}`
}

/**
 * Checks if URL points to a specific media item in a multi-media tweet
 */
export const isMediaSpecificUrl = (url: string): boolean => {
  return extractMediaIndex(url) !== null
}

/**
 * Gets the media type from URL (video or photo)
 */
export const getMediaTypeFromUrl = (url: string): 'video' | 'photo' | null => {
  try {
    const parsedUrl = new URL(url)
    const pathParts = parsedUrl.pathname.split('/').filter(Boolean)
    
    for (const part of pathParts) {
      if (part === 'video') return 'video'
      if (part === 'photo') return 'photo'
    }
    
    return null
  } catch {
    return null
  }
} 