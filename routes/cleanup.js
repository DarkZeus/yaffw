import { Hono } from 'hono'
import { cleanupOldFiles } from '../utils/fileUtils.js'

const cleanup = new Hono()

// Cleanup old files endpoint - removes files older than 24 hours
cleanup.post('/cleanup-old-files', async (c) => {
  try {
    const maxAge = 24 * 60 * 60 * 1000 // 24 hours in milliseconds
    const deletedCount = cleanupOldFiles('uploads', maxAge)
    
    return c.json({
      success: true,
      message: `Cleaned up ${deletedCount} old files`,
      deletedCount
    })
    
  } catch (error) {
    console.error('Cleanup failed:', error)
    return c.json({
      error: 'Cleanup failed',
      details: error.message
    }, 500)
  }
})

export default cleanup 