import { Hono } from 'hono'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import { 
  isTwitterUrl, 
  downloadTwitterMedia as callTwitterDownloader,
  getTwitterMediaInfo as twitterMediaInfo
} from '../utils/twitterUtils.js'
import { extractVideoMetadata } from '../utils/videoUtils.js'
import { extractAudioWaveform } from '../utils/audioUtils.js'
import { generateUniqueFilename } from '../utils/fileUtils.js'
import { broadcastProgress, broadcastCompletion } from './sse.js'
import crypto from 'crypto'

const twitterDownload = new Hono()

// Progress tracking for downloads
const progressTracking = new Map()

// Store for temporary cookie files
const tempCookieStore = new Map()

// Note: SSE connections are managed by the shared sse.js module

const generateProgressId = () => {
  return `twitter_progress_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

const generateCookieSessionId = () => {
  return `cookie_session_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`
}

const updateProgress = (progressId, progress, message = 'Processing...', speed = null) => {
  const progressData = {
    progress,
    message,
    speed,
    timestamp: Date.now()
  }
  
  progressTracking.set(progressId, progressData)
  
  // Use shared SSE broadcasting
  broadcastProgress(progressId, progressData)
}

const cleanupProgress = (progressId) => {
  setTimeout(() => {
    progressTracking.delete(progressId)
  }, 30000) // Clean up after 30 seconds
}

const cleanupCookieFile = (sessionId) => {
  const cookieData = tempCookieStore.get(sessionId)
  if (cookieData) {
    // Delete the temporary file
    try {
      if (fs.existsSync(cookieData.filePath)) {
        fs.unlinkSync(cookieData.filePath)
      }
    } catch (error) {
      //
    }
    
    // Remove from store
    tempCookieStore.delete(sessionId)
  }
}

// Remove all code that downloads Twitter media without using yt-dlp
// Only keep code that uses yt-dlp for downloading Twitter media

// Fallback to yt-dlp for age-restricted content
const downloadWithYtDlpFallback = async (url, outputPath, progressCallback = null, cookieFilePath = null) => {
  
  return new Promise((resolve, reject) => {
    const ytDlpArgs = [
      url,
      '-o', outputPath,
      '--no-playlist',
      '--format', 'best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '--newline',
      '--progress-template', 'download:{"status":"%(progress.status)s","percent":"%(progress._percent_str)s","speed":"%(progress._speed_str)s","eta":"%(progress._eta_str)s","downloaded":"%(progress._downloaded_bytes_str)s","total":"%(progress._total_bytes_str)s"}'
    ]

    // Add cookies if provided
    if (cookieFilePath && fs.existsSync(cookieFilePath)) {
      ytDlpArgs.push('--cookies', cookieFilePath)
    }

    const ytDlp = spawn('yt-dlp', ytDlpArgs)
    let stderr = ''

    ytDlp.stdout.on('data', (data) => {
      const output = data.toString()
      
      if (progressCallback) {
        // Parse progress lines
        const lines = output.split('\n')
        for (const line of lines) {
          if (line.includes('"status":"downloading"')) {
            try {
              const progressData = JSON.parse(line)
              const percentStr = progressData.percent || '0%'
              const percent = parseFloat(percentStr.replace('%', ''))
              
              if (!isNaN(percent)) {
                progressCallback(Math.min(percent, 85), null)
              }
            } catch (e) {
              // Continue parsing other lines
            }
          }
        }
      }
    })

    ytDlp.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    ytDlp.on('close', (code) => {
      if (code === 0) {
        resolve(outputPath)
      } else {
        reject(new Error(`yt-dlp failed: ${stderr}`))
      }
    })

    ytDlp.on('error', (error) => {
      reject(new Error(`Failed to start yt-dlp: ${error.message}`))
    })
  })
}

// Upload cookie file endpoint
twitterDownload.post('/upload-cookies', async (c) => {
  try {
    const formData = await c.req.formData()
    const cookieFile = formData.get('cookieFile')
    
    if (!cookieFile || typeof cookieFile === 'string') {
      return c.json({ error: 'No cookie file provided' }, 400)
    }
    
    // Validate file type
    if (!cookieFile.name.endsWith('.txt')) {
      return c.json({ error: 'Cookie file must be a .txt file' }, 400)
    }
    
    // Generate session ID
    const sessionId = generateCookieSessionId()
    
    // Create temporary file path
    const tempDir = path.join(process.cwd(), 'temp-cookies')
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }
    
    const tempFilePath = path.join(tempDir, `${sessionId}.txt`)
    
    // Save file
    const arrayBuffer = await cookieFile.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    fs.writeFileSync(tempFilePath, buffer)
    
    // Store cookie session data
    tempCookieStore.set(sessionId, {
      filePath: tempFilePath,
      originalName: cookieFile.name,
      uploadTime: Date.now(),
      used: false
    })
    
    // Auto-cleanup after 1 hour
    setTimeout(() => {
      cleanupCookieFile(sessionId)
    }, 60 * 60 * 1000)
    
    return c.json({
      success: true,
      sessionId,
      message: 'Cookie file uploaded successfully. It will be automatically deleted after use or in 1 hour.'
    })
    
  } catch (error) {
    return c.json({ 
      error: 'Failed to upload cookie file', 
      details: error.message 
    }, 500)
  }
})

// Twitter-specific download endpoint
twitterDownload.post('/from-twitter', async (c) => {
  try {
    const { url, cookieSessionId } = await c.req.json()
    
    if (!url) {
      return c.json({ error: 'URL is required' }, 400)
    }
    
    if (!isTwitterUrl(url)) {
      return c.json({ error: 'Invalid Twitter URL' }, 400)
    }
    
    const progressId = generateProgressId()
    
    // Generate unique filename
    const timestamp = Date.now()
    const baseFileName = `twitter_${timestamp}`
    const uniqueFileName = generateUniqueFilename(baseFileName + '.mp4')
    const outputPath = path.join('uploads', uniqueFileName)
    
    // Initialize progress tracking
    updateProgress(progressId, 0, 'Starting Twitter download...')
    
    // Start background download
    setImmediate(async () => {
      let cookieFilePath = null
      
      try {
        // Check if cookie session is provided and valid
        if (cookieSessionId) {
          const cookieData = tempCookieStore.get(cookieSessionId)
          if (cookieData && fs.existsSync(cookieData.filePath)) {
            cookieFilePath = cookieData.filePath
            
            // Mark as used
            cookieData.used = true
            tempCookieStore.set(cookieSessionId, cookieData)
          } else {
            //
          }
        }
        
        updateProgress(progressId, 5, 'Downloading Twitter media with yt-dlp...')
        
        const finalPath = await downloadWithYtDlpFallback(url, outputPath, (progress, speed) => {
          updateProgress(progressId, Math.min(progress, 85), 'Downloading Twitter media...', speed)
        }, cookieFilePath)
        
        // Clean up cookie file after use
        if (cookieSessionId) {
          cleanupCookieFile(cookieSessionId)
        }
        
        // Verify file exists and has content
        if (!fs.existsSync(finalPath) || fs.statSync(finalPath).size === 0) {
          throw new Error('Downloaded file is empty or does not exist')
        }
        
        updateProgress(progressId, 90, 'Extracting metadata...')
        
        // Extract metadata
        const metadata = await extractVideoMetadata(finalPath).catch(err => {
          return null
        })
        
        // Generate waveform if video has audio
        let waveformResult
        if (metadata?.hasAudio) {
          waveformResult = await extractAudioWaveform(finalPath).catch(err => {
            return { imagePath: null, keyPoints: [], imageWidth: 0, imageHeight: 0, hasAudio: true }
          })
        } else {
          waveformResult = {
            imagePath: null,
            keyPoints: [],
            imageWidth: 0,
            imageHeight: 0,
            hasAudio: false
          }
        }
        
        updateProgress(progressId, 95, 'Processing complete...')
        
        const fileName = path.basename(finalPath)
        
        const result = {
          success: true,
          filePath: finalPath,
          originalFileName: fileName,
          uniqueFileName: fileName,
          message: 'Twitter media downloaded successfully',
          metadata: metadata,
          waveformData: waveformResult.keyPoints,
          waveformImagePath: waveformResult.imagePath,
          waveformImageDimensions: {
            width: waveformResult.imageWidth,
            height: waveformResult.imageHeight
          },
          hasAudio: waveformResult.hasAudio,
          source: 'twitter-download'
        }
        
        const completionData = {
          progress: 100,
          message: 'Twitter download complete!',
          speed: null,
          timestamp: Date.now(),
          completed: true,
          result: result
        }
        
        progressTracking.set(progressId, completionData)
        // Use shared SSE broadcasting
        broadcastCompletion(progressId, completionData)
        cleanupProgress(progressId)
        
      } catch (error) {
        
        // Clean up cookie file on error
        if (cookieSessionId) {
          cleanupCookieFile(cookieSessionId)
        }
        
        // Check if error indicates restriction issues
        const errorMessage = error.message.toLowerCase()
        const isRestrictionError = errorMessage.includes('private') ||
                                 errorMessage.includes('restricted') ||
                                 errorMessage.includes('unavailable') ||
                                 errorMessage.includes('403') ||
                                 errorMessage.includes('unauthorized') ||
                                 errorMessage.includes('age-restricted') ||
                                 errorMessage.includes('login required') ||
                                 errorMessage.includes('requires authentication') ||
                                 errorMessage.includes('nsfw tweet') ||
                                 errorMessage.includes('use --cookies')
        
        const errorData = {
          progress: 0,
          message: 'Twitter download failed',
          speed: null,
          timestamp: Date.now(),
          error: error.message,
          isRestrictionError,
          completed: true,
          type: 'completed' // Ensure SSE knows this is a completion message
        }
        
        progressTracking.set(progressId, errorData)
        // Use shared SSE broadcasting  
        broadcastCompletion(progressId, errorData)
        cleanupProgress(progressId)
      }
    })
    
    return c.json({
      progressId: progressId,
      message: 'Twitter download started, check progress using the progress ID'
    })
    
  } catch (error) {
    return c.json({ 
      error: 'Failed to start Twitter download', 
      details: error.message 
    }, 500)
  }
})

// Get Twitter media info endpoint
twitterDownload.post('/twitter-info', async (c) => {
  try {
    const { url } = await c.req.json()
    
    if (!url) {
      return c.json({ error: 'URL is required' }, 400)
    }
    
    if (!isTwitterUrl(url)) {
      return c.json({ error: 'Invalid Twitter URL' }, 400)
    }
    
    // Get Twitter media information
    const mediaInfo = await twitterMediaInfo(url)
    
    return c.json({
      success: true,
      ...mediaInfo
    })
    
  } catch (error) {
    return c.json({ 
      error: 'Failed to get Twitter media info', 
      details: error.message 
    }, 500)
  }
})

// Progress polling endpoint
twitterDownload.get('/progress/:progressId', (c) => {
  const progressId = c.req.param('progressId')
  const progressData = progressTracking.get(progressId)
  
  if (!progressData) {
    return c.json({ error: 'Progress not found' }, 404)
  }
  
  return c.json(progressData)
})

// Clean up cookie file endpoint
twitterDownload.delete('/cleanup-cookies/:sessionId', (c) => {
  const sessionId = c.req.param('sessionId')
  
  if (!sessionId) {
    return c.json({ error: 'Session ID is required' }, 400)
  }
  
  cleanupCookieFile(sessionId)
  
  return c.json({
    success: true,
    message: 'Cookie file cleaned up successfully'
  })
})

// Test endpoint to verify Twitter utilities are working
twitterDownload.get('/test', async (c) => {
  try {
    const testUrl = 'https://x.com/stalker_thegame/status/1921960172055875771'
    
    // Test URL detection
    const isTwitter = isTwitterUrl(testUrl)
    
    if (!isTwitter) {
      return c.json({ error: 'URL not detected as Twitter URL' }, 400)
    }
    
    // Test media info retrieval
    const mediaInfo = await twitterMediaInfo(testUrl)
    
    return c.json({
      success: true,
      message: 'Twitter utilities are working correctly',
      testUrl,
      isTwitterUrl: isTwitter,
      mediaInfo
    })
    
  } catch (error) {
    return c.json({ 
      error: 'Twitter utilities test failed', 
      details: error.message 
    }, 500)
  }
})

// Note: Broadcasting functions are now imported from sse.js for shared SSE management

export default twitterDownload 