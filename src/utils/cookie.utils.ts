import type { CookieSession } from '../types/cookie.types'

/**
 * Checks if a URL has restriction-related error messages
 */
export function hasRestrictionError(urlTitle?: string): boolean {
  if (!urlTitle) return false
  
  return urlTitle.includes('🔒 Restricted Content') ||
         urlTitle.includes('⚠️ Metadata extraction failed') ||
         urlTitle.includes('❌ Failed even with cookies') ||
         urlTitle.includes('❌ Failed even with existing cookie')
}

/**
 * Checks if a URL needs cookie authentication
 */
export function needsCookieAuthentication(urlTitle?: string): boolean {
  return hasRestrictionError(urlTitle)
}

/**
 * Formats a cookie session for display
 */
export function formatCookieSession(session: CookieSession): string {
  return `${session.originalName} (${formatTimeAgo(session.uploadTime)})`
}

/**
 * Formats time ago for display
 */
export function formatTimeAgo(timestamp: number): string {
  const now = Date.now()
  const diffMinutes = Math.floor((now - timestamp) / (1000 * 60))
  
  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
} 