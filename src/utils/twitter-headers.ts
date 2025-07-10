import { TWITTER_BEARER_TOKEN } from '../constants/twitter.constants'

export type TwitterHeadersOptions = {
  guestToken?: string
  cookies?: string
  csrfToken?: string
  contentType?: string
  isAuthenticated?: boolean
}

// Common base headers for all Twitter requests
const getBaseHeaders = (): Record<string, string> => ({
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'accept-language': 'en-US,en;q=0.9',
  'accept': '*/*',
  'accept-encoding': 'gzip, deflate, br',
  'dnt': '1',
  'connection': 'keep-alive',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site'
})

// Headers for guest token activation
export const getGuestTokenHeaders = (): Record<string, string> => ({
  ...getBaseHeaders(),
  'authorization': `Bearer ${TWITTER_BEARER_TOKEN}`,
  'content-type': 'application/x-www-form-urlencoded'
})

// Headers for GraphQL API requests
export const getGraphQLHeaders = (options: TwitterHeadersOptions = {}): Record<string, string> => {
  const { guestToken, cookies, csrfToken, isAuthenticated = false } = options
  
  const headers: Record<string, string> = {
    ...getBaseHeaders(),
    'authorization': `Bearer ${TWITTER_BEARER_TOKEN}`,
    'x-twitter-client-language': 'en',
    'x-twitter-active-user': 'yes',
    'content-type': 'application/json'
  }
  
  if (isAuthenticated && cookies) {
    // Authenticated request headers
    headers['x-twitter-auth-type'] = 'OAuth2Session'
    headers.cookie = cookies
    
    if (csrfToken) {
      headers['x-csrf-token'] = csrfToken
    }
  } else if (guestToken) {
    // Guest token headers
    headers['x-guest-token'] = guestToken
    headers.cookie = `guest_id=v1%3A${guestToken}`
  }
  
  return headers
}

// Headers for Syndication API requests
export const getSyndicationHeaders = (): Record<string, string> => ({
  ...getBaseHeaders(),
  'referer': 'https://twitter.com/',
  'origin': 'https://twitter.com'
})

// Headers for media download requests
export const getMediaDownloadHeaders = (): Record<string, string> => ({
  ...getBaseHeaders(),
  'referer': 'https://twitter.com/',
  'accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
})

// Remove all cookie, CSRF, and custom authentication header logic
// Only keep guest token and public API headers
// Utility to extract CSRF token from cookies
export const extractCSRFToken = (cookies: string): string | null => {
  const csrfMatch = cookies.match(/ct0=([^;]+)/)
  return csrfMatch ? csrfMatch[1] : null
}

// Utility to extract auth token from cookies
export const extractAuthToken = (cookies: string): string | null => {
  const authMatch = cookies.match(/auth_token=([^;]+)/)
  return authMatch ? authMatch[1] : null
}

// Utility to check if cookies contain authentication
export const hasAuthentication = (cookies: string): boolean => {
  return !!(extractAuthToken(cookies) && extractCSRFToken(cookies))
}

// Generate standardized cookie string for guest sessions
export const generateGuestCookies = (guestToken: string): string => {
  return `guest_id=v1%3A${guestToken}; personalization_id="v1_${Date.now()}_${Math.random().toString(36).substr(2, 9)}"`
}

// Headers for different request types
export const TwitterHeaders = {
  guestToken: getGuestTokenHeaders,
  graphQL: getGraphQLHeaders,
  syndication: getSyndicationHeaders,
  mediaDownload: getMediaDownloadHeaders
} as const

export default TwitterHeaders 