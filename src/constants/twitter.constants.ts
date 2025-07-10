// Twitter API endpoints
export const TWITTER_API_ENDPOINTS = {
  GRAPHQL: 'https://api.x.com/graphql/I9GDzyCGZL2wSoYFFrrTVw/TweetResultByRestId',
  GUEST_TOKEN: 'https://api.x.com/1.1/guest/activate.json',
  SYNDICATION: 'https://cdn.syndication.twimg.com/tweet-result'
} as const

// Hardcoded Bearer token from Cobalt (Twitter's internal API token)
export const TWITTER_BEARER_TOKEN = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'

// Tweet features JSON (from Cobalt's implementation)
export const TWITTER_TWEET_FEATURES = {
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
} as const

// Tweet field toggles JSON
export const TWITTER_TWEET_FIELD_TOGGLES = {
  withArticleRichContentState: true,
  withArticlePlainText: false,
  withGrokAnalyze: false
} as const

// Supported Twitter URL patterns
export const TWITTER_URL_PATTERNS = [
  ':user/status/:id',
  ':user/status/:id/video/:index',
  ':user/status/:id/photo/:index',
  ':user/status/:id/mediaviewer',
  ':user/status/:id/mediaViewer',
  'i/bookmarks?post_id=:id'
] as const

// Supported Twitter domains
export const TWITTER_DOMAINS = {
  PRIMARY: 'twitter.com',
  ALTERNATIVE: ['x.com', 'vxtwitter.com', 'fixvx.com'],
  SUBDOMAINS: ['mobile']
} as const

// Container bug detection constants (from Cobalt)
export const TWITTER_EPOCH = 1288834974657n
export const TWITTER_CONTAINER_BUG_START = new Date(1701446400000) // Dec 1, 2023
export const TWITTER_CONTAINER_BUG_END = new Date(1702605600000)   // Dec 15, 2023

// Common headers for Twitter API requests
export const TWITTER_COMMON_HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'authorization': `Bearer ${TWITTER_BEARER_TOKEN}`,
  'x-twitter-client-language': 'en',
  'x-twitter-active-user': 'yes',
  'accept-language': 'en'
} as const

// Tweet ID validation
export const TWITTER_TWEET_ID_REGEX = /^\d{1,20}$/

// Rate limiting constants
export const TWITTER_RATE_LIMITS = {
  REQUESTS_PER_MINUTE: 60,
  RETRY_DELAY: 1000,
  MAX_RETRIES: 3,
  BACKOFF_MULTIPLIER: 2
} as const

// Error codes
export const TWITTER_ERROR_CODES = {
  FETCH_FAIL: 'fetch.fail',
  FETCH_EMPTY: 'fetch.empty',
  CONTENT_POST_PRIVATE: 'content.post.private',
  CONTENT_POST_AGE: 'content.post.age',
  CONTENT_POST_UNAVAILABLE: 'content.post.unavailable',
  INVALID_URL: 'invalid.url',
  INVALID_TWEET_ID: 'invalid.tweet_id'
} as const

// Media quality constants
export const TWITTER_MEDIA_QUALITY = {
  IMAGE_QUALITY: '?name=4096x4096',
  VIDEO_PREFERRED_FORMAT: 'video/mp4',
  FALLBACK_FORMAT: 'application/x-mpegURL'
} as const 