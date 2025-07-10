import { TWITTER_API_ENDPOINTS, TWITTER_ERROR_CODES, TWITTER_RATE_LIMITS } from '../constants/twitter.constants'
import type { TwitterSyndicationResponse } from '../types/twitter.types'

/**
 * Sleep utility for retry delays
 */
const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Generates syndication token using mathematical formula from Cobalt
 * Formula: ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '')
 */
const generateSyndicationToken = (tweetId: string): string => {
  try {
    const id = Number(tweetId)
    if (Number.isNaN(id)) {
      throw new Error('Invalid tweet ID for token generation')
    }
    
    const token = ((id / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '')
    return token
  } catch (error) {
    console.warn('⚠️ Failed to generate syndication token:', error)
    return ''
  }
}

/**
 * Validates syndication response
 */
const validateSyndicationResponse = (response: Response): boolean => {
  const contentLength = response.headers.get('content-length')
  const contentType = response.headers.get('content-type')
  
  // Check if response has content
  if (!contentLength || contentLength === '0') {
    return false
  }
  
  // Check if response is JSON
  if (!contentType?.startsWith('application/json')) {
    return false
  }
  
  return true
}

/**
 * Makes a request to Twitter's syndication API
 */
export const requestSyndication = async (tweetId: string): Promise<TwitterSyndicationResponse> => {
  const token = generateSyndicationToken(tweetId)
  if (!token) {
    throw new Error('Failed to generate syndication token')
  }
  
  const syndicationUrl = new URL(TWITTER_API_ENDPOINTS.SYNDICATION)
  syndicationUrl.searchParams.set('id', tweetId)
  syndicationUrl.searchParams.set('token', token)
  
  let retryCount = 0
  let delay = TWITTER_RATE_LIMITS.RETRY_DELAY
  
  while (retryCount < TWITTER_RATE_LIMITS.MAX_RETRIES) {
    try {
      console.log(`📡 Requesting tweet ${tweetId} via Syndication API (attempt ${retryCount + 1})...`)
      
      const response = await fetch(syndicationUrl.toString(), {
        method: 'GET',
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(15000) // 15 second timeout
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      // Validate response format
      if (!validateSyndicationResponse(response)) {
        throw new Error('Invalid syndication response format')
      }
      
      const data: TwitterSyndicationResponse = await response.json()
      
      console.log('✅ Syndication API request successful')
      return data
      
    } catch (error) {
      retryCount++
      console.warn(`⚠️ Syndication API request failed (attempt ${retryCount}/${TWITTER_RATE_LIMITS.MAX_RETRIES}):`, error)
      
      if (retryCount < TWITTER_RATE_LIMITS.MAX_RETRIES) {
        console.log(`⏳ Retrying in ${delay}ms...`)
        await sleep(delay)
        delay *= TWITTER_RATE_LIMITS.BACKOFF_MULTIPLIER
      }
    }
  }
  
  throw new Error(TWITTER_ERROR_CODES.FETCH_FAIL)
}

/**
 * Tests if syndication API is available for a tweet
 */
export const testSyndicationAvailability = async (tweetId: string): Promise<boolean> => {
  try {
    const token = generateSyndicationToken(tweetId)
    if (!token) return false
    
    const syndicationUrl = new URL(TWITTER_API_ENDPOINTS.SYNDICATION)
    syndicationUrl.searchParams.set('id', tweetId)
    syndicationUrl.searchParams.set('token', token)
    
    const response = await fetch(syndicationUrl.toString(), {
      method: 'HEAD', // Just check if endpoint responds
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(5000) // 5 second timeout for test
    })
    
    return response.ok
  } catch {
    return false
  }
}

/**
 * Extracts media from syndication response
 */
export const extractSyndicationMedia = (response: TwitterSyndicationResponse) => {
  return response.mediaDetails || null
}

/**
 * Makes a syndication request with fallback and error handling
 */
export const requestSyndicationWithRetry = async (tweetId: string): Promise<TwitterSyndicationResponse> => {
  try {
    return await requestSyndication(tweetId)
  } catch (error) {
    console.error('❌ Syndication API request failed after all retries:', error)
    throw new Error(TWITTER_ERROR_CODES.FETCH_FAIL)
  }
} 