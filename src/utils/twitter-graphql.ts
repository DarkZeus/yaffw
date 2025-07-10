import { 
  TWITTER_API_ENDPOINTS, 
  TWITTER_ERROR_CODES, 
  TWITTER_RATE_LIMITS,
  TWITTER_TWEET_FEATURES, 
  TWITTER_TWEET_FIELD_TOGGLES
} from '../constants/twitter.constants'
import type { 
  TwitterAuthConfig, 
  TwitterError, 
  TwitterGraphQLResponse 
} from '../types/twitter.types'
import { getAuthHeaders, handleAuthError, updateCookieFromResponse } from './twitter-auth'

/**
 * Sleep utility for retry delays
 */
const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Validates GraphQL response
 */
const validateResponse = (response: Response): boolean => {
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
 * Makes a GraphQL request to Twitter API
 */
export const requestTweet = async (
  tweetId: string,
  authConfig: TwitterAuthConfig
): Promise<{ response: TwitterGraphQLResponse; updatedAuth?: TwitterAuthConfig }> => {
  const graphqlUrl = new URL(TWITTER_API_ENDPOINTS.GRAPHQL)
  
  // Set GraphQL variables
  graphqlUrl.searchParams.set('variables', JSON.stringify({
    tweetId,
    withCommunity: false,
    includePromotedContent: false,
    withVoice: false
  }))
  
  // Set features and field toggles
  graphqlUrl.searchParams.set('features', JSON.stringify(TWITTER_TWEET_FEATURES))
  graphqlUrl.searchParams.set('fieldToggles', JSON.stringify(TWITTER_TWEET_FIELD_TOGGLES))
  
  const headers = getAuthHeaders(authConfig)
  
  let retryCount = 0
  let delay = TWITTER_RATE_LIMITS.RETRY_DELAY
  let currentAuthConfig = { ...authConfig }
  
  while (retryCount < TWITTER_RATE_LIMITS.MAX_RETRIES) {
    try {
      console.log(`🐦 Requesting tweet ${tweetId} via GraphQL (attempt ${retryCount + 1})...`)
      
      const response = await fetch(graphqlUrl.toString(), {
        method: 'GET',
        headers: getAuthHeaders(currentAuthConfig),
        signal: AbortSignal.timeout(15000) // 15 second timeout
      })
      
      // Update cookies if present in response
      let updatedAuth = currentAuthConfig
      if (currentAuthConfig.cookie && response.headers.get('set-cookie')) {
        const updatedCookie = updateCookieFromResponse(currentAuthConfig.cookie, response.headers)
        updatedAuth = { ...currentAuthConfig, cookie: updatedCookie }
      }
      
      // Handle authentication errors with retry logic
      if (!response.ok) {
        const errorInfo = handleAuthError(response.status, currentAuthConfig)
        
        if (errorInfo.shouldRetry && retryCount < TWITTER_RATE_LIMITS.MAX_RETRIES - 1) {
          console.warn(`⚠️ GraphQL request failed with status ${response.status}, retrying...`)
          
          if (errorInfo.newAuthConfig) {
            currentAuthConfig = errorInfo.newAuthConfig
          }
          
          retryCount++
          await sleep(delay)
          delay *= TWITTER_RATE_LIMITS.BACKOFF_MULTIPLIER
          continue
        }
        
        throw new Error(`HTTP ${response.status}: ${errorInfo.error}`)
      }
      
      // Validate response format
      if (!validateResponse(response)) {
        throw new Error('Invalid response format')
      }
      
      const data: TwitterGraphQLResponse = await response.json()
      
      console.log('✅ GraphQL tweet request successful')
      return { response: data, updatedAuth }
      
    } catch (error) {
      retryCount++
      console.warn(`⚠️ GraphQL request failed (attempt ${retryCount}/${TWITTER_RATE_LIMITS.MAX_RETRIES}):`, error)
      
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
 * Handles CSRF token retry for 403 errors
 */
export const retryWithUpdatedCsrf = async (
  tweetId: string,
  authConfig: TwitterAuthConfig,
  response: Response
): Promise<{ response: TwitterGraphQLResponse; updatedAuth?: TwitterAuthConfig }> => {
  if (!authConfig.cookie) {
    throw new Error('Cookie required for CSRF retry')
  }
  
  // Update cookie with new CSRF token from response
  const updatedCookie = updateCookieFromResponse(authConfig.cookie, response.headers)
  const updatedAuthConfig: TwitterAuthConfig = {
    ...authConfig,
    cookie: updatedCookie
  }
  
  console.log('🔄 Retrying GraphQL request with updated CSRF token...')
  
  // Make new request with updated auth
  return requestTweet(tweetId, updatedAuthConfig)
}

/**
 * Extracts error information from GraphQL response
 */
export const extractGraphQLError = (response: TwitterGraphQLResponse): TwitterError | null => {
  const tweetResult = response.data?.tweetResult?.result
  
  if (!tweetResult) {
    return {
      error: TWITTER_ERROR_CODES.FETCH_EMPTY,
      code: 'empty_result'
    }
  }
  
  if (tweetResult.__typename === 'TweetUnavailable') {
    switch (tweetResult.reason) {
      case 'Protected':
        return {
          error: TWITTER_ERROR_CODES.CONTENT_POST_PRIVATE,
          code: 'protected_tweet'
        }
      case 'NsfwLoggedOut':
        return {
          error: TWITTER_ERROR_CODES.CONTENT_POST_AGE,
          code: 'nsfw_logged_out'
        }
      default:
        return {
          error: TWITTER_ERROR_CODES.CONTENT_POST_UNAVAILABLE,
          code: 'tweet_unavailable'
        }
    }
  }
  
  if (!['Tweet', 'TweetWithVisibilityResults'].includes(tweetResult.__typename)) {
    return {
      error: TWITTER_ERROR_CODES.CONTENT_POST_UNAVAILABLE,
      code: 'unsupported_tweet_type'
    }
  }
  
  return null
}

/**
 * Makes a GraphQL request with full error handling and retry logic
 */
export const requestTweetWithRetry = async (
  tweetId: string,
  authConfig: TwitterAuthConfig
): Promise<{ response: TwitterGraphQLResponse; updatedAuth?: TwitterAuthConfig }> => {
  try {
    const result = await requestTweet(tweetId, authConfig)
    
    // Check for GraphQL-level errors
    const error = extractGraphQLError(result.response)
    if (error) {
      throw new Error(error.error)
    }
    
    return result
    
  } catch (error) {
    console.error('❌ GraphQL request failed after all retries:', error)
    throw error
  }
} 