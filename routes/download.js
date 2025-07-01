import { Hono } from 'hono'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import axios from 'axios'
import { generateUniqueFilename } from '../utils/fileUtils.js'
import { extractVideoMetadata } from '../utils/videoUtils.js'
import { extractAudioWaveform } from '../utils/audioUtils.js'

const download = new Hono()

// In-memory progress tracking
const progressTracking = new Map()

// Helper function to generate progress ID
const generateProgressId = () => {
  return 'progress_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
}

// Helper function to update progress
const updateProgress = (progressId, progress, message = 'Downloading...', speed = null) => {
  progressTracking.set(progressId, {
    progress,
    message,
    speed,
    timestamp: Date.now()
  })
  console.log(`📊 Progress ${progressId}: ${progress}% - ${message}`)
}

// Progress polling endpoint
download.get('/progress/:progressId', (c) => {
  const progressId = c.req.param('progressId')
  const progressData = progressTracking.get(progressId)
  
  if (!progressData) {
    return c.json({ error: 'Progress not found' }, 404)
  }

  return c.json(progressData)
})

// Cleanup progress after completion
const cleanupProgress = (progressId) => {
  setTimeout(() => {
    progressTracking.delete(progressId)
    console.log(`🧹 Cleaned up progress tracking for ${progressId}`)
  }, 30000) // Clean up after 30 seconds
}

// Helper function to check if URL is a direct video link
const isDirectVideoUrl = (url) => {
  const videoExtensions = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.m4v', '.3gp', '.flv', '.wmv']
  return videoExtensions.some(ext => url.toLowerCase().includes(ext))
}

// Helper function to detect social media platforms
const isSocialMediaUrl = (url) => {
  const socialPlatforms = [
    'youtube.com', 'youtu.be', 'twitter.com', 'x.com', 'instagram.com', 
    'tiktok.com', 'facebook.com', 'vimeo.com', 'dailymotion.com',
    'twitch.tv', 'reddit.com'
  ]
  return socialPlatforms.some(platform => url.includes(platform))
}

// Download video using yt-dlp
const downloadWithYtDlp = (url, outputPath, progressCallback = null) => {
  return new Promise((resolve, reject) => {
    const ytDlpArgs = [
      url,
      '-o', outputPath,
      '--no-playlist',
      '--format', 'best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      // Add progress tracking
      '--newline',
      '--progress-template', 'download:{"status":"%(progress.status)s","percent":"%(progress._percent_str)s","speed":"%(progress._speed_str)s","eta":"%(progress._eta_str)s","downloaded":"%(progress._downloaded_bytes_str)s","total":"%(progress._total_bytes_str)s"}'
    ]

    const ytDlp = spawn('yt-dlp', ytDlpArgs)
    let stderr = ''

    // Listen to stdout for progress updates
    ytDlp.stdout.on('data', (data) => {
      const output = data.toString()
      console.log('yt-dlp stdout:', output)
      
      // Parse progress lines
      const lines = output.split('\n')
      for (const line of lines) {
        if (line.trim().startsWith('{') && line.includes('"status"')) {
          try {
            const progressData = JSON.parse(line.trim())
            if (progressData.status === 'downloading' && progressCallback) {
              // Extract percentage (remove % symbol and convert to number)
              const percentStr = progressData.percent || '0%'
              const percent = parseFloat(percentStr.replace('%', '').trim()) || 0
              
              // Extract speed (clean up the speed string)
              const speedStr = progressData.speed || null
              let speed = null
              if (speedStr && speedStr !== 'N/A' && speedStr !== 'Unknown') {
                // Convert speed string to MB/s number
                if (speedStr.includes('MiB/s')) {
                  speed = parseFloat(speedStr.replace('MiB/s', '').trim())
                } else if (speedStr.includes('KiB/s')) {
                  speed = parseFloat(speedStr.replace('KiB/s', '').trim()) / 1024
                } else if (speedStr.includes('B/s')) {
                  speed = parseFloat(speedStr.replace('B/s', '').trim()) / (1024 * 1024)
                }
              }
              
              console.log(`📊 Real yt-dlp progress: ${percent}% (speed: ${speed ? speed.toFixed(1) + ' MB/s' : 'unknown'})`)
              progressCallback(percent, speed)
            }
          } catch (e) {
            // Ignore JSON parse errors for non-progress lines
            console.warn('Failed to parse yt-dlp progress JSON:', e.message)
          }
        }
      }
    })

    ytDlp.stderr.on('data', (data) => {
      stderr += data.toString()
      console.log('yt-dlp stderr:', data.toString())
    })

    ytDlp.on('close', (code) => {
      if (code === 0) {
        // Send 100% progress on completion
        if (progressCallback) {
          progressCallback(100)
        }
        resolve(outputPath)
      } else {
        reject(new Error(`yt-dlp failed with code ${code}: ${stderr}`))
      }
    })

    ytDlp.on('error', (error) => {
      reject(new Error(`Failed to start yt-dlp: ${error.message}`))
    })
  })
}

// Download video using axios for direct URLs
const downloadWithAxios = async (url, outputPath, progressCallback = null) => {
  try {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    })

    // Check if we can track progress
    const contentLength = response.headers['content-length']
    const totalBytes = contentLength ? parseInt(contentLength, 10) : null
    let downloadedBytes = 0

    console.log(`📊 Direct download: Total size ${totalBytes ? (totalBytes / (1024 * 1024)).toFixed(1) + ' MB' : 'unknown'}`)

    const writer = fs.createWriteStream(outputPath)
    
    // Track download progress if we know the total size
    if (totalBytes && progressCallback) {
      const startTime = Date.now()
      let lastProgressUpdate = 0
      let lastProgressTime = startTime
      
      response.data.on('data', (chunk) => {
        downloadedBytes += chunk.length
        const progress = Math.min(85, (downloadedBytes / totalBytes) * 100) // Cap at 85% to leave room for processing
        
        // Throttle progress updates - only update every 500ms or 5% progress change
        const now = Date.now()
        const progressDiff = Math.abs(progress - lastProgressUpdate)
        const timeDiff = now - lastProgressTime
        
        if (progressDiff >= 5 || timeDiff >= 500) {
          // Calculate speed
          const elapsed = (now - startTime) / 1000
          const speed = elapsed > 0 ? (downloadedBytes / (1024 * 1024)) / elapsed : 0
          
          console.log(`📊 Direct download progress: ${progress.toFixed(1)}% (${(downloadedBytes / (1024 * 1024)).toFixed(1)}/${(totalBytes / (1024 * 1024)).toFixed(1)} MB, ${speed.toFixed(1)} MB/s)`)
          progressCallback(progress, speed > 0.1 ? speed : null)
          
          lastProgressUpdate = progress
          lastProgressTime = now
        }
      })
    } else if (progressCallback) {
      // If no content-length, show indeterminate progress
      const startTime = Date.now()
      const progressInterval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000
        const speed = elapsed > 0 ? (downloadedBytes / (1024 * 1024)) / elapsed : 0
        
        // Show growing progress based on time, but cap at 80%
        const timeBasedProgress = Math.min(80, 5 + (elapsed * 2))
        console.log(`📊 Direct download (unknown size): ${timeBasedProgress.toFixed(1)}% (${(downloadedBytes / (1024 * 1024)).toFixed(1)} MB downloaded, ${speed.toFixed(1)} MB/s)`)
        progressCallback(timeBasedProgress, speed > 0.1 ? speed : null)
      }, 1000)
      
      response.data.on('data', (chunk) => {
        downloadedBytes += chunk.length
      })
      
      writer.on('finish', () => {
        clearInterval(progressInterval)
      })
      
      writer.on('error', () => {
        clearInterval(progressInterval)
      })
    }

    response.data.pipe(writer)

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        console.log(`✅ Direct download completed: ${(downloadedBytes / (1024 * 1024)).toFixed(1)} MB`)
        resolve(outputPath)
      })
      writer.on('error', reject)
    })
  } catch (error) {
    throw new Error(`Failed to download video: ${error.message}`)
  }
}

// Main download endpoint
download.post('/from-url', async (c) => {
  try {
    const { url } = await c.req.json()
    
    if (!url) {
      return c.json({ error: 'URL is required' }, 400)
    }

    // Validate URL format
    let parsedUrl
    try {
      parsedUrl = new URL(url)
    } catch (error) {
      return c.json({ error: 'Invalid URL format' }, 400)
    }

    console.log('🌐 Starting video download from:', url)

    // Generate progress ID and start download in background
    const progressId = generateProgressId()
    
    // Generate unique filename
    const timestamp = Date.now()
    const baseFileName = `downloaded_video_${timestamp}`
    const uniqueFileName = generateUniqueFilename(baseFileName + '.mp4')
    const outputPath = path.join('uploads', uniqueFileName)

    // Initialize progress tracking
    updateProgress(progressId, 0, 'Starting download...')

    // Start background download
    setImmediate(async () => {
      let finalPath

      try {
        if (isDirectVideoUrl(url)) {
          console.log('📥 Downloading direct video URL with axios...')
          updateProgress(progressId, 5, 'Starting direct download...')
          finalPath = await downloadWithAxios(url, outputPath, (progress, speed) => {
            // Real progress from direct download with speed
            updateProgress(progressId, Math.min(progress, 85), 'Downloading video...', speed)
          })
          updateProgress(progressId, 90, 'Download complete, processing...')
        } else if (isSocialMediaUrl(url)) {
          console.log('📱 Downloading from social media with yt-dlp...')
          updateProgress(progressId, 5, 'Downloading from social media...')
          
          // For yt-dlp, let it determine the extension
          const baseOutputPath = path.join('uploads', baseFileName)
          finalPath = await downloadWithYtDlp(url, `${baseOutputPath}.%(ext)s`, (progress, speed) => {
            // Real progress from yt-dlp with speed
            updateProgress(progressId, Math.min(progress, 85), 'Downloading video...', speed)
          })
          
          // Find the actual downloaded file (yt-dlp might change the extension)
          const uploadDir = 'uploads'
          const files = fs.readdirSync(uploadDir)
          const downloadedFile = files.find(file => file.startsWith(baseFileName))
          
          if (downloadedFile) {
            finalPath = path.join(uploadDir, downloadedFile)
          } else {
            throw new Error('Downloaded file not found')
          }
          
          updateProgress(progressId, 90, 'Download complete, processing...')
        } else {
          // Try yt-dlp first, fallback to axios
          console.log('🔄 Trying yt-dlp first, will fallback to axios if needed...')
          try {
            updateProgress(progressId, 5, 'Attempting download with yt-dlp...')
            
            const baseOutputPath = path.join('uploads', baseFileName)
            finalPath = await downloadWithYtDlp(url, `${baseOutputPath}.%(ext)s`, (progress, speed) => {
              // Real progress from yt-dlp with speed
              updateProgress(progressId, Math.min(progress, 85), 'Downloading video...', speed)
            })
            
            const uploadDir = 'uploads'
            const files = fs.readdirSync(uploadDir)
            const downloadedFile = files.find(file => file.startsWith(baseFileName))
            
            if (downloadedFile) {
              finalPath = path.join(uploadDir, downloadedFile)
            } else {
              throw new Error('yt-dlp download failed')
            }
            
            updateProgress(progressId, 90, 'Download complete, processing...')
          } catch (ytDlpError) {
            console.log('⚠️ yt-dlp failed, trying direct download with axios...')
            updateProgress(progressId, 10, 'Fallback to direct download...')
            finalPath = await downloadWithAxios(url, outputPath, (progress, speed) => {
              // Real progress from direct download fallback with speed
              updateProgress(progressId, Math.min(progress, 85), 'Downloading video...', speed)
            })
            updateProgress(progressId, 90, 'Download complete, processing...')
          }
        }

        // Verify file exists and has content
        if (!fs.existsSync(finalPath) || fs.statSync(finalPath).size === 0) {
          throw new Error('Downloaded file is empty or does not exist')
        }

        console.log('✅ Video downloaded successfully:', finalPath)
        updateProgress(progressId, 92, 'Extracting metadata...')

        // Extract metadata first to check for audio
        console.log('🔍 Extracting metadata...')
        const metadata = await extractVideoMetadata(finalPath).catch(err => {
          console.error('Metadata extraction failed:', err)
          return null
        })
        
        // Only generate waveform if video has audio
        let waveformResult
        if (metadata?.hasAudio) {
          console.log('🎵 Video has audio - generating waveform')
          waveformResult = await extractAudioWaveform(finalPath).catch(err => {
            console.error('Waveform extraction failed:', err)
            return { imagePath: null, keyPoints: [], imageWidth: 0, imageHeight: 0, hasAudio: true }
          })
        } else {
          console.log('🔇 Video has no audio - skipping waveform generation')
          waveformResult = {
            imagePath: null,
            keyPoints: [],
            imageWidth: 0,
            imageHeight: 0,
            hasAudio: false
          }
        }

        updateProgress(progressId, 95, 'Processing complete...')

        console.log('📊 Extracted metadata:', metadata)
        console.log('🎵 Generated waveform image:', waveformResult.imagePath)

        const fileName = path.basename(finalPath)
        
        // Store final result in progress tracking
        const result = {
          success: true,
          filePath: finalPath,
          originalFileName: fileName,
          uniqueFileName: fileName,
          message: 'Video downloaded successfully',
          metadata: metadata,
          waveformData: waveformResult.keyPoints,
          waveformImagePath: waveformResult.imagePath,
          waveformImageDimensions: {
            width: waveformResult.imageWidth,
            height: waveformResult.imageHeight
          },
          hasAudio: waveformResult.hasAudio,
          source: 'url-download'
        }
        
        // Mark as complete with result
        progressTracking.set(progressId, {
          progress: 100,
          message: 'Download complete!',
          speed: null,
          timestamp: Date.now(),
          completed: true,
          result: result
        })
        
        // Schedule cleanup
        cleanupProgress(progressId)
        
      } catch (error) {
        console.error('❌ Background download failed:', error)
        
        // Store error in progress tracking
        progressTracking.set(progressId, {
          progress: 0,
          message: 'Download failed',
          speed: null,
          timestamp: Date.now(),
          error: error.message,
          completed: true
        })
        
        // Schedule cleanup
        cleanupProgress(progressId)
      }
    })

    // Return progress ID immediately so frontend can start polling
    return c.json({
      progressId: progressId,
      message: 'Download started, check progress using the progress ID'
    })

  } catch (error) {
    console.error('❌ Download initialization failed:', error)
    return c.json({ 
      error: 'Failed to start download', 
      details: error.message 
    }, 500)
  }
})

export default download 