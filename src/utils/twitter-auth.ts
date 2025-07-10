import { 
  TWITTER_API_ENDPOINTS, 
  TWITTER_COMMON_HEADERS, 
  TWITTER_ERROR_CODES, 
  TWITTER_RATE_LIMITS
} from '../constants/twitter.constants'
import type { TwitterAuthConfig, TwitterGuestTokenResponse } from '../types/twitter.types'

// In-memory cache for guest tokens
let cachedGuestToken: string | null = null
let tokenExpiryTime = 0

/**
 * Sleep utility for retry delays
 */
const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Gets or refreshes Twitter guest token
 */
export const getGuestToken = async (forceReload = false): Promise<string | null> => {
  // Return cached token if still valid
  if (cachedGuestToken && !forceReload && Date.now() < tokenExpiryTime) {
    return cachedGuestToken
  }

  let retryCount = 0
  let delay = TWITTER_RATE_LIMITS.RETRY_DELAY

  while (retryCount < TWITTER_RATE_LIMITS.MAX_RETRIES) {
    try {
      console.log('🔑 Requesting Twitter guest token...')
      
      const response = await fetch(TWITTER_API_ENDPOINTS.GUEST_TOKEN, {
        method: 'POST',
        headers: TWITTER_COMMON_HEADERS,
        signal: AbortSignal.timeout(10000) // 10 second timeout
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data: TwitterGuestTokenResponse = await response.json()
      
      if (!data.guest_token) {
        throw new Error('No guest token in response')
      }

      // Cache the token for 1 hour
      cachedGuestToken = data.guest_token
      tokenExpiryTime = Date.now() + (60 * 60 * 1000)
      
      console.log('✅ Twitter guest token obtained successfully')
      return cachedGuestToken

    } catch (error) {
      retryCount++
      console.warn(`⚠️ Failed to get guest token (attempt ${retryCount}/${TWITTER_RATE_LIMITS.MAX_RETRIES}):`, error)
      
      if (retryCount < TWITTER_RATE_LIMITS.MAX_RETRIES) {
        console.log(`⏳ Retrying in ${delay}ms...`)
        await sleep(delay)
        delay *= TWITTER_RATE_LIMITS.BACKOFF_MULTIPLIER
      }
    }
  }

  console.error('❌ Failed to obtain Twitter guest token after all retries')
  return null
}

/**
 * Handles authentication errors and suggests retry strategies
 */
export const handleAuthError = (status: number, authConfig: TwitterAuthConfig): {
  shouldRetry: boolean
  newAuthConfig?: TwitterAuthConfig
  error: string
} => {
  switch (status) {
    case 401:
      return {
        shouldRetry: !!authConfig.guestToken,
        newAuthConfig: authConfig.guestToken ? { ...authConfig, guestToken: undefined } : undefined,
        error: TWITTER_ERROR_CODES.CONTENT_POST_PRIVATE
      }
    
    case 403:
      return {
        shouldRetry: true,
        newAuthConfig: authConfig,
        error: TWITTER_ERROR_CODES.CONTENT_POST_AGE
      }
    
    case 429:
      return {
        shouldRetry: true,
        newAuthConfig: authConfig,
        error: 'Rate limited - will retry'
      }
    
    default:
      return {
        shouldRetry: false,
        error: TWITTER_ERROR_CODES.FETCH_FAIL
      }
  }
}

/**
 * Clears cached authentication data
 */
export const clearAuthCache = (): void => {
  cachedGuestToken = null
  tokenExpiryTime = 0
  console.log('🧹 Twitter auth cache cleared')
} 