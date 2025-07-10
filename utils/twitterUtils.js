// Twitter utility functions for Node.js backend
// This is a simplified JavaScript version of our TypeScript utilities
import { getGuestTokenHeaders, getGraphQLHeaders, getSyndicationHeaders, getMediaDownloadHeaders } from './twitterHeaders.js'

// Twitter URL validation
export const isTwitterUrl = (url) => {
  try {
    const parsedUrl = new URL(url)
    const hostname = parsedUrl.hostname.toLowerCase()
    
    if (hostname === 'twitter.com') return true
    if (['x.com', 'vxtwitter.com', 'fixvx.com'].includes(hostname)) return true
    if (hostname.includes('twitter.com')) return true
    
    return false
  } catch {
    return false
  }
}

// Extract tweet ID from URL
export const extractTweetId = (url) => {
  try {
    const parsedUrl = new URL(url)
    
    // Handle bookmark URLs
    const postId = parsedUrl.searchParams.get('post_id')
    if (postId && /^\d{1,20}$/.test(postId)) {
      return postId
    }
    
    // Handle standard status URLs
    const pathParts = parsedUrl.pathname.split('/').filter(Boolean)
    
    if (pathParts.length >= 3 && pathParts[1] === 'status') {
      const tweetId = pathParts[2]
      if (/^\d{1,20}$/.test(tweetId)) {
        return tweetId
      }
    }
    
    return null
  } catch {
    return null
  }
}

// Get Twitter guest token
export const getTwitterGuestToken = async () => {
  try {
    const response = await fetch('https://api.x.com/1.1/guest/activate.json', {
      method: 'POST',
      headers: getGuestTokenHeaders()
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    const data = await response.json()
    return data.guest_token
  } catch (error) {
    console.error('Failed to get Twitter guest token:', error)
    return null
  }
}

// Request tweet via GraphQL
export const requestTweetGraphQL = async (tweetId, guestToken) => {
  try {
    const graphqlUrl = new URL('https://api.x.com/graphql/I9GDzyCGZL2wSoYFFrrTVw/TweetResultByRestId')
    
    graphqlUrl.searchParams.set('variables', JSON.stringify({
      tweetId,
      withCommunity: false,
      includePromotedContent: false,
      withVoice: false
    }))
    
    graphqlUrl.searchParams.set('features', JSON.stringify({
      creator_subscriptions_tweet_preview_api_enabled: true,
      communities_web_enable_tweet_community_results_fetch: true,
      c9s_tweet_anatomy_moderator_badge_enabled: true,
      articles_preview_enabled: true,
      tweetypie_unmention_optimization_enabled: true,
      responsive_web_edit_tweet_api_enabled: true,
      graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
      view_counts_everywhere_api_enabled: true,
      longform_notetweets_consumption_enabled: true,
      responsive_web_twitter_article_tweet_consumption_enabled: true,
      tweet_awards_web_tipping_enabled: false,
      creator_subscriptions_quote_tweet_preview_enabled: false,
      freedom_of_speech_not_reach_fetch_enabled: true,
      standardized_nudges_misinfo: true,
      tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
      rweb_video_timestamps_enabled: true,
      longform_notetweets_rich_text_read_enabled: true,
      longform_notetweets_inline_media_enabled: true,
      rweb_tipjar_consumption_enabled: true,
      responsive_web_graphql_exclude_directive_enabled: true,
      verified_phone_label_enabled: false,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      responsive_web_graphql_timeline_navigation_enabled: true,
      responsive_web_enhance_cards_enabled: false
    }))
    
    graphqlUrl.searchParams.set('fieldToggles', JSON.stringify({
      withArticleRichContentState: true,
      withArticlePlainText: false,
      withGrokAnalyze: false
    }))
    
    const headers = getGraphQLHeaders({
      guestToken,
      isAuthenticated: false // No custom cookies, so not authenticated
    })
    
    const response = await fetch(graphqlUrl.toString(), {
      method: 'GET',
      headers
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    return await response.json()
  } catch (error) {
    console.error('GraphQL request failed:', error)
    throw error
  }
}

// Request tweet via Syndication API
export const requestTweetSyndication = async (tweetId) => {
  try {
    // Generate token using mathematical formula from Cobalt
    const id = Number(tweetId)
    const token = ((id / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '')
    
    const syndicationUrl = new URL('https://cdn.syndication.twimg.com/tweet-result')
    syndicationUrl.searchParams.set('id', tweetId)
    syndicationUrl.searchParams.set('token', token)
    
    const response = await fetch(syndicationUrl.toString(), {
      method: 'GET',
      headers: getSyndicationHeaders()
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    return await response.json()
  } catch (error) {
    console.error('Syndication request failed:', error)
    throw error
  }
}

// Request tweet via FixupX service (fallback for NSFW content)
export const requestTweetFixupX = async (url) => {
  try {
    // Convert Twitter URL to FixupX URL
    // Pattern: https://fixupx.com/{username}/status/{tweetId}
    const tweetId = extractTweetId(url)
    if (!tweetId) {
      throw new Error('Could not extract tweet ID from URL')
    }
    
    // Extract username from original URL
    const urlObj = new URL(url)
    const pathParts = urlObj.pathname.split('/').filter(Boolean)
    let username = 'unknown'
    
    if (pathParts.length >= 3 && pathParts[1] === 'status') {
      username = pathParts[0]
    }
    
    const fixupxUrl = `https://fixupx.com/${username}/status/${tweetId}`
    console.log('🔧 Trying FixupX fallback:', fixupxUrl)
    
    const response = await fetch(fixupxUrl, {
      method: 'GET',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9'
      }
    })
    
    if (!response.ok) {
      throw new Error(`FixupX HTTP ${response.status}`)
    }
    
    const html = await response.text()
    return { html, isRedirect: false }
  } catch (error) {
    console.error('FixupX request failed:', error)
    throw error
  }
}

// Extract media from GraphQL response
export const extractMediaFromGraphQL = (response) => {
  const tweetResult = response.data?.tweetResult?.result
  
  if (!tweetResult) {
    return null
  }
  
  if (tweetResult.__typename === 'TweetUnavailable') {
    const reason = tweetResult.reason || 'Unknown reason'
    
    // For NSFW content, we'll let the caller handle retrying with authentication
    if (reason === 'NsfwLoggedOut') {
      const error = new Error('Tweet unavailable: ' + reason)
      error.code = 'NSFW_LOGGED_OUT'
      throw error
    }
    
    throw new Error('Tweet unavailable: ' + reason)
  }
  
  let baseTweet
  if (tweetResult.__typename === 'TweetWithVisibilityResults') {
    baseTweet = tweetResult.tweet?.legacy
  } else {
    baseTweet = tweetResult.legacy
  }
  
  return baseTweet?.extended_entities?.media || null
}

// Extract media from syndication response
export const extractMediaFromSyndication = (response) => {
  // Check if the response is a tombstone (age-restricted content)
  if (response?.__typename === 'TweetTombstone') {
    const tombstoneText = response.tombstone?.text?.text || 'Content not available'
    if (tombstoneText.includes('Age-restricted') || tombstoneText.includes('adult content')) {
      const error = new Error('Tweet unavailable: Age-restricted content')
      error.code = 'NSFW_TOMBSTONE'
      throw error
    }
    throw new Error('Tweet unavailable: ' + tombstoneText)
  }
  
  // The syndication API response has a different structure than GraphQL
  // It contains mediaDetails which is an array of media objects
  if (!response || !response.mediaDetails) {
    return null
  }
  
  // Convert syndication format to match GraphQL format
  const mediaDetails = response.mediaDetails
  
  if (!Array.isArray(mediaDetails) || mediaDetails.length === 0) {
    return null
  }
  
  return mediaDetails.map(media => {
    // Convert syndication format to GraphQL-like format
    if (media.type === 'photo') {
      return {
        type: 'photo',
        media_url_https: media.media_url_https || media.media_url
      }
    }
    
    if (media.type === 'video' || media.type === 'animated_gif') {
      return {
        type: media.type,
        video_info: {
          variants: media.video_info?.variants || []
        }
      }
    }
    
    return media
  })
}

// Extract media from FixupX response (handles both redirects and HTML)
export const extractMediaFromFixupX = (response) => {
  try {
    // If it's a redirect, use the redirect URL directly
    if (response.isRedirect && response.redirectUrl) {
      console.log('🔧 Using direct video URL from FixupX redirect:', response.redirectUrl)
      return [{
        type: 'video',
        video_info: {
          variants: [{
            content_type: 'video/mp4',
            url: response.redirectUrl,
            bitrate: 1000000 // Default bitrate
          }]
        }
      }]
    }
    
    // If it's HTML content, parse it
    if (!response.isRedirect && response.html) {
      const html = response.html
      
      // Debug: Show a sample of the HTML
      console.log('🔧 HTML sample (first 500 chars):', html.substring(0, 500))
      
      // Look for og:video meta tags (primary method for FixupX)
      console.log('🔧 Searching for og:video in HTML...')
      const ogVideoMatches = html.match(/<meta[^>]*property="og:video"[^>]*content="([^"]+)"[^>]*>/gi)
      console.log('🔧 og:video matches found:', ogVideoMatches ? ogVideoMatches.length : 0)
      if (ogVideoMatches && ogVideoMatches.length > 0) {
        console.log('🔧 First og:video match:', ogVideoMatches[0])
        const videoUrl = ogVideoMatches[0].match(/content="([^"]+)"/)?.[1]
        if (videoUrl) {
          console.log('🔧 Found video URL in FixupX og:video meta tag:', videoUrl)
          return [{
            type: 'video',
            video_info: {
              variants: [{
                content_type: 'video/mp4',
                url: videoUrl,
                bitrate: 1000000 // Default bitrate
              }]
            }
          }]
        } else {
          console.log('🔧 Could not extract content from og:video tag')
        }
      }
      
      // Look for twitter:player:stream meta tags (alternative method)
      const twitterStreamMatches = html.match(/<meta[^>]*property="twitter:player:stream"[^>]*content="([^"]+)"[^>]*>/gi)
      if (twitterStreamMatches && twitterStreamMatches.length > 0) {
        const videoUrl = twitterStreamMatches[0].match(/content="([^"]+)"/)?.[1]
        if (videoUrl) {
          console.log('🔧 Found video URL in FixupX twitter:player:stream meta tag:', videoUrl)
          return [{
            type: 'video',
            video_info: {
              variants: [{
                content_type: 'video/mp4',
                url: videoUrl,
                bitrate: 1000000 // Default bitrate
              }]
            }
          }]
        }
      }
      
      // Look for video elements in the HTML
      const videoMatches = html.match(/<video[^>]*src="([^"]+)"[^>]*>/gi)
      if (videoMatches && videoMatches.length > 0) {
        const videoSrc = videoMatches[0].match(/src="([^"]+)"/)?.[1]
        if (videoSrc) {
          console.log('🔧 Found video URL in FixupX HTML video element:', videoSrc)
          return [{
            type: 'video',
            video_info: {
              variants: [{
                content_type: 'video/mp4',
                url: videoSrc,
                bitrate: 1000000 // Default bitrate
              }]
            }
          }]
        }
      }
      
      // Look for JSON-LD structured data
      const jsonLdMatches = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gis)
      if (jsonLdMatches) {
        for (const match of jsonLdMatches) {
          try {
            const jsonContent = match.replace(/<script[^>]*>/, '').replace(/<\/script>/, '')
            const data = JSON.parse(jsonContent)
            if (data.contentUrl || data.videoUrl || data.url) {
              const videoUrl = data.contentUrl || data.videoUrl || data.url
              console.log('🔧 Found video URL in FixupX JSON-LD:', videoUrl)
              return [{
                type: 'video',
                video_info: {
                  variants: [{
                    content_type: 'video/mp4',
                    url: videoUrl,
                    bitrate: 1000000 // Default bitrate
                  }]
                }
              }]
            }
          } catch (e) {
            // Continue to next JSON-LD block
          }
        }
      }
    }
    
    console.warn('🔧 No video found in FixupX response')
    return null
  } catch (error) {
    console.error('🔧 Error extracting media from FixupX:', error)
    return null
  }
}

// Select best quality video URL
export const selectBestQuality = (variants) => {
  if (!variants || variants.length === 0) {
    return null
  }
  
  // Filter for MP4 variants first
  const mp4Variants = variants.filter(v => v.content_type === 'video/mp4')
  
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

// Main Twitter download function - based on Cobalt's approach
export const downloadTwitterMedia = async (url, options = {}) => {
  console.log('🐦 Starting Twitter media download for:', url)
  
  if (!isTwitterUrl(url)) {
    throw new Error('Invalid Twitter URL')
  }
  
  const tweetId = extractTweetId(url)
  if (!tweetId) {
    throw new Error('Could not extract tweet ID from URL')
  }
  
  console.log('🐦 Extracted tweet ID:', tweetId)
  
  // Get guest token
  const guestToken = await getTwitterGuestToken()
  if (!guestToken) {
    throw new Error('Failed to obtain Twitter guest token')
  }
  
  let media = null
  const originalUrl = url // Store original URL for fallback
  
  // Try GraphQL first (primary method)
  try {
    console.log('🐦 Trying GraphQL API...')
    const graphqlResponse = await requestTweetGraphQL(tweetId, guestToken)
    media = extractMediaFromGraphQL(graphqlResponse)
    
    if (media && media.length > 0) {
      console.log(`🐦 Found ${media.length} media item(s) via GraphQL`)
      return processMediaResult(media, tweetId, options)
    }
  } catch (graphqlError) {
    console.warn('🐦 GraphQL failed:', graphqlError.message)
    
    // Handle age-restricted content specifically
    if (graphqlError.code === 'NSFW_LOGGED_OUT') {
      console.log('🔒 Age-restricted content detected, trying fallback methods...')
      
      // Try syndication API for age-restricted content
      try {
        console.log('🐦 Trying Syndication API for age-restricted content...')
        const syndicationResponse = await requestTweetSyndication(tweetId)
        media = extractMediaFromSyndication(syndicationResponse)
        
        if (media && media.length > 0) {
          console.log(`🐦 Found ${media.length} media item(s) via Syndication`)
          return processMediaResult(media, tweetId, options)
        }
      } catch (syndicationError) {
        console.warn('🐦 Syndication API also failed:', syndicationError.message)
        
        // Age-restricted content often requires authentication
        // Suggest fallback to yt-dlp or user authentication
        throw new Error('This tweet contains age-restricted content. Try downloading it while logged into Twitter, or use yt-dlp as a fallback.')
      }
    }
  }
  
  // If GraphQL failed for non-NSFW reasons, try other methods
  if (!media) {
    try {
      console.log('🐦 Trying Syndication API...')
      const syndicationResponse = await requestTweetSyndication(tweetId)
      media = extractMediaFromSyndication(syndicationResponse)
      
      if (media && media.length > 0) {
        console.log(`🐦 Found ${media.length} media item(s) via Syndication`)
        return processMediaResult(media, tweetId, options)
      }
    } catch (syndicationError) {
      console.warn('🐦 Syndication API failed:', syndicationError.message)
      
      // Try FixupX as final fallback
      try {
        console.log('🔧 Trying FixupX fallback...')
        const fixupxResponse = await requestTweetFixupX(originalUrl)
        media = extractMediaFromFixupX(fixupxResponse)
        
        if (media && media.length > 0) {
          console.log(`🔧 Found ${media.length} media item(s) via FixupX`)
          return processMediaResult(media, tweetId, options)
        }
      } catch (fixupxError) {
        console.warn('🔧 FixupX fallback failed:', fixupxError.message)
      }
    }
  }
  
  // If we still have no media, throw an error
  if (!media || media.length === 0) {
    throw new Error('No media found in tweet. The tweet may be private, deleted, or contain no media.')
  }
  
  return processMediaResult(media, tweetId, options)
}

// Helper function to process media results consistently (based on Cobalt's approach)
const processMediaResult = (media, tweetId, options) => {
  // For now, handle single media item
  const mediaItem = media[0]
  
  if (mediaItem.type === 'photo') {
    const imageUrl = mediaItem.media_url_https + '?name=4096x4096'
    
    return {
      type: 'proxy',
      urls: imageUrl,
      filename: `twitter_${tweetId}.jpg`,
      isPhoto: true
    }
  }
  
  // Handle video/gif
  if (!mediaItem.video_info?.variants) {
    throw new Error('No video variants available')
  }
  
  const videoUrl = selectBestQuality(mediaItem.video_info.variants)
  if (!videoUrl) {
    throw new Error('Could not select video quality')
  }
  
  // Check if video needs container fixing (based on Cobalt's approach)
  const needsContainerFix = checkIfNeedsContainerFix(mediaItem)
  
  return {
    type: needsContainerFix ? 'remux' : 'proxy',
    urls: videoUrl,
    filename: `twitter_${tweetId}.mp4`,
    isGif: mediaItem.type === 'animated_gif'
  }
}

// Check if video needs container fixing (based on Cobalt's container bug detection)
const checkIfNeedsContainerFix = (mediaItem) => {
  // Twitter had a muxer bug from late 2023 that affected certain videos
  // This is a simplified version of Cobalt's detection logic
  if (mediaItem.video_info?.variants) {
    for (const variant of mediaItem.video_info.variants) {
      if (variant.content_type === 'video/mp4' && variant.url) {
        // Check if URL contains indicators of problematic videos
        // This is a simplified check - Cobalt has more sophisticated detection
        const urlPath = variant.url.split('?')[0]
        if (urlPath.includes('/amplify_video/') || urlPath.includes('/tweet_video/')) {
          // These are more likely to have container issues
          return true
        }
      }
    }
  }
  return false
}

// Get Twitter media info
export const getTwitterMediaInfo = async (url) => {
  if (!isTwitterUrl(url)) {
    throw new Error('Invalid Twitter URL')
  }
  
  const tweetId = extractTweetId(url)
  if (!tweetId) {
    throw new Error('Could not extract tweet ID from URL')
  }
  
  const guestToken = await getTwitterGuestToken()
  if (!guestToken) {
    throw new Error('Failed to obtain Twitter guest token')
  }
  
  let media = null
  const originalUrl = url // Store original URL for FixupX fallback
  
  try {
    const graphqlResponse = await requestTweetGraphQL(tweetId, guestToken)
    media = extractMediaFromGraphQL(graphqlResponse)
  } catch (graphqlError) {
    // If it's NSFW content, skip GraphQL and go straight to Syndication
    if (graphqlError.code === 'NSFW_LOGGED_OUT') {
      try {
        const syndicationResponse = await requestTweetSyndication(tweetId)
        media = extractMediaFromSyndication(syndicationResponse)
        if (!media) {
          throw new Error('Syndication API returned empty media')
        }
      } catch (syndicationError) {
        // Try FixupX as final fallback for NSFW content
        try {
          const fixupxResponse = await requestTweetFixupX(originalUrl)
          media = extractMediaFromFixupX(fixupxResponse)
          if (!media) {
            throw new Error('FixupX fallback returned empty media')
          }
        } catch (fixupxError) {
          // Check if it's also NSFW tombstone
          if (syndicationError.code === 'NSFW_TOMBSTONE') {
            throw new Error('This tweet contains age-restricted content that requires authentication to view.')
          }
          throw new Error('Unable to access this tweet. All fallback methods failed.')
        }
      }
    } else {
      // For non-NSFW errors, fallback to Syndication
      try {
        const syndicationResponse = await requestTweetSyndication(tweetId)
        media = extractMediaFromSyndication(syndicationResponse)
      } catch (syndicationError) {
        // Try FixupX as final fallback
        try {
          const fixupxResponse = await requestTweetFixupX(originalUrl)
          media = extractMediaFromFixupX(fixupxResponse)
          if (!media) {
            throw new Error('FixupX fallback returned empty media')
          }
        } catch (fixupxError) {
          throw new Error('Failed to fetch tweet data from all sources')
        }
      }
    }
  }
  
  if (!media || media.length === 0) {
    throw new Error('No media found in tweet')
  }
  
  const mediaTypes = media.map(m => {
    if (m.type === 'animated_gif') return 'gif'
    return m.type
  })
  
  return {
    tweetId,
    mediaCount: media.length,
    mediaTypes,
    hasVideo: mediaTypes.includes('video'),
    hasPhoto: mediaTypes.includes('photo'),
    hasGif: mediaTypes.includes('gif')
  }
} 