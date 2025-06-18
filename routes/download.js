import { Hono } from 'hono'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import axios from 'axios'
import { generateUniqueFilename } from '../utils/fileUtils.js'
import { extractVideoMetadata } from '../utils/videoUtils.js'
import { extractAudioWaveform } from '../utils/audioUtils.js'

const download = new Hono()

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
const downloadWithYtDlp = (url, outputPath) => {
  return new Promise((resolve, reject) => {
    const ytDlpArgs = [
      url,
      '-o', outputPath,
      '--no-playlist',
      '--format', 'best[ext=mp4]/best',
      '--merge-output-format', 'mp4'
    ]

    const ytDlp = spawn('yt-dlp', ytDlpArgs)
    let stderr = ''

    ytDlp.stderr.on('data', (data) => {
      stderr += data.toString()
      console.log('yt-dlp:', data.toString())
    })

    ytDlp.on('close', (code) => {
      if (code === 0) {
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
const downloadWithAxios = async (url, outputPath) => {
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

    const writer = fs.createWriteStream(outputPath)
    response.data.pipe(writer)

    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(outputPath))
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

    // Generate unique filename
    const timestamp = Date.now()
    const baseFileName = `downloaded_video_${timestamp}`
    const uniqueFileName = generateUniqueFilename(baseFileName + '.mp4')
    const outputPath = path.join('uploads', uniqueFileName)

    let finalPath

    try {
      if (isDirectVideoUrl(url)) {
        console.log('📥 Downloading direct video URL with axios...')
        finalPath = await downloadWithAxios(url, outputPath)
      } else if (isSocialMediaUrl(url)) {
        console.log('📱 Downloading from social media with yt-dlp...')
        // For yt-dlp, let it determine the extension
        const baseOutputPath = path.join('uploads', baseFileName)
        finalPath = await downloadWithYtDlp(url, `${baseOutputPath}.%(ext)s`)
        
        // Find the actual downloaded file (yt-dlp might change the extension)
        const uploadDir = 'uploads'
        const files = fs.readdirSync(uploadDir)
        const downloadedFile = files.find(file => file.startsWith(baseFileName))
        
        if (downloadedFile) {
          finalPath = path.join(uploadDir, downloadedFile)
        } else {
          throw new Error('Downloaded file not found')
        }
      } else {
        // Try yt-dlp first, fallback to axios
        console.log('🔄 Trying yt-dlp first, will fallback to axios if needed...')
        try {
          const baseOutputPath = path.join('uploads', baseFileName)
          finalPath = await downloadWithYtDlp(url, `${baseOutputPath}.%(ext)s`)
          
          const uploadDir = 'uploads'
          const files = fs.readdirSync(uploadDir)
          const downloadedFile = files.find(file => file.startsWith(baseFileName))
          
          if (downloadedFile) {
            finalPath = path.join(uploadDir, downloadedFile)
          } else {
            throw new Error('yt-dlp download failed')
          }
        } catch (ytDlpError) {
          console.log('⚠️ yt-dlp failed, trying direct download with axios...')
          finalPath = await downloadWithAxios(url, outputPath)
        }
      }

      // Verify file exists and has content
      if (!fs.existsSync(finalPath) || fs.statSync(finalPath).size === 0) {
        throw new Error('Downloaded file is empty or does not exist')
      }

      console.log('✅ Video downloaded successfully:', finalPath)
      console.log('📁 File exists check:', fs.existsSync(finalPath))
      console.log('📁 File stats:', fs.existsSync(finalPath) ? fs.statSync(finalPath) : 'File not found')

      // Extract metadata and waveform
      console.log('🔍 Extracting metadata and waveform...')
      const [metadata, waveformResult] = await Promise.all([
        extractVideoMetadata(finalPath).catch(err => {
          console.error('Metadata extraction failed:', err)
          return null
        }),
        extractAudioWaveform(finalPath).catch(err => {
          console.error('Waveform extraction failed:', err)
          return { imagePath: null, keyPoints: [], imageWidth: 0, imageHeight: 0 }
        })
      ])

      console.log('📊 Extracted metadata:', metadata)
      console.log('🎵 Generated waveform image:', waveformResult.imagePath)
      console.log('🎵 Extracted key points:', waveformResult.keyPoints?.length || 0)

      const fileName = path.basename(finalPath)
      console.log('📂 Final path:', finalPath)
      console.log('📂 Base filename:', fileName)
      console.log('📂 Files in uploads:', fs.readdirSync('uploads').filter(f => f.includes('downloaded')))
      
      return c.json({
        success: true,
        filePath: finalPath,
        originalFileName: fileName,
        uniqueFileName: fileName,
        message: 'Video downloaded successfully',
        metadata: metadata,
        waveformData: waveformResult.keyPoints, // Backward compatibility
        waveformImagePath: waveformResult.imagePath,
        waveformImageDimensions: {
          width: waveformResult.imageWidth,
          height: waveformResult.imageHeight
        },
        source: 'url-download'
      })

    } catch (downloadError) {
      console.error('Download failed:', downloadError)
      
      // Clean up any partial files
      if (finalPath && fs.existsSync(finalPath)) {
        fs.unlinkSync(finalPath)
      }
      
      return c.json({ 
        error: 'Failed to download video', 
        details: downloadError.message 
      }, 500)
    }

  } catch (error) {
    console.error('Download endpoint error:', error)
    return c.json({ 
      error: 'Internal server error', 
      details: error.message 
    }, 500)
  }
})

export default download 