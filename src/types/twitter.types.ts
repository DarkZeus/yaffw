export type TwitterMediaType = 'photo' | 'video' | 'animated_gif'

export type TwitterVideoVariant = {
  bitrate?: number
  content_type: string
  url: string
}

export type TwitterVideoInfo = {
  aspect_ratio: [number, number]
  duration_millis?: number
  variants: TwitterVideoVariant[]
}

export type TwitterMediaItem = {
  id_str: string
  media_url_https: string
  type: TwitterMediaType
  url: string
  video_info?: TwitterVideoInfo
  source_status_id_str?: string
}

export type TwitterTweetLegacy = {
  id_str: string
  full_text: string
  extended_entities?: {
    media: TwitterMediaItem[]
  }
  retweeted_status_result?: {
    result: {
      legacy: TwitterTweetLegacy
      tweet?: {
        legacy: TwitterTweetLegacy
      }
    }
  }
}

export type TwitterCardBindingValue = {
  key: string
  value: {
    string_value?: string
    type: string
  }
}

export type TwitterCard = {
  legacy: {
    binding_values: TwitterCardBindingValue[]
  }
}

export type TwitterTweetResult = {
  __typename: 'Tweet' | 'TweetWithVisibilityResults' | 'TweetUnavailable'
  legacy?: TwitterTweetLegacy
  tweet?: {
    legacy: TwitterTweetLegacy
  }
  card?: TwitterCard
  reason?: 'Protected' | 'NsfwLoggedOut'
}

export type TwitterGraphQLResponse = {
  data?: {
    tweetResult?: {
      result?: TwitterTweetResult
    }
  }
}

export type TwitterSyndicationResponse = {
  mediaDetails?: TwitterMediaItem[]
}

export type TwitterGuestTokenResponse = {
  guest_token: string
}

export type TwitterDownloadOptions = {
  quality?: 'best' | 'worst' | string
  format?: 'mp4' | 'webm' | 'gif'
  subtitleLang?: string
  toGif?: boolean
  alwaysProxy?: boolean
  index?: number
}

export type TwitterAuthConfig = {
  guestToken?: string
  cookie?: string
  csrfToken?: string
}

export type TwitterDownloadResult = {
  type: 'proxy' | 'remux' | 'tunnel' | 'picker'
  urls?: string
  filename?: string
  audioFilename?: string
  isPhoto?: boolean
  isGif?: boolean
  subtitles?: string
  fileMetadata?: {
    sublanguage?: string
  }
  picker?: TwitterMediaPickerItem[]
}

export type TwitterMediaPickerItem = {
  type: 'photo' | 'video' | 'gif'
  url: string
  thumb?: string
}

export type TwitterError = {
  error: string
  code?: string
  context?: Record<string, unknown>
}

export type TwitterUrlPattern = {
  user: string
  id: string
  index?: string
}

export type TwitterParsedUrl = {
  tweetId: string
  mediaIndex?: number
  isValid: boolean
  error?: string
} 