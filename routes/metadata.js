import { Hono } from 'hono'
import { spawn } from 'child_process'
import fs from 'fs'

const metadata = new Hono()

// Import the same cookie store from twitter-download for consistency
// Note: In a real application, this would be a shared module
const tempCookieStore = new Map()

// Extract metadata using yt-dlp (following same pattern as download.js)
const extractMetadataWithYtDlp = (url, cookieFilePath = null) => {
  return new Promise((resolve, reject) => {
    const ytDlpArgs = [
      '--print', '%(id)s|||%(title)s|||%(duration_string)s|||%(thumbnail)s|||%(description)s|||%(view_count)s|||%(upload_date)s|||%(uploader)s',
      '--simulate',
      '--no-warnings',
      '--no-playlist'
    ]
    
    // Add cookie file if provided
    if (cookieFilePath) {
      ytDlpArgs.push('--cookies', cookieFilePath)
    }
    
    ytDlpArgs.push(url)

    console.log('🔍 Extracting metadata with yt-dlp for:', url, cookieFilePath ? 'with cookies' : 'without cookies')
    const ytDlp = spawn('yt-dlp', ytDlpArgs)
    let stdout = ''
    let stderr = ''

    ytDlp.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    ytDlp.stderr.on('data', (data) => {
      stderr += data.toString()
      console.log('yt-dlp stderr:', data.toString())
    })

    ytDlp.on('close', (code) => {
      if (code === 0) {
        try {
          // Parse the output
          const output = stdout.trim()
          const parts = output.split('|||')
          
          if (parts.length < 8) {
            reject(new Error('Invalid metadata format received'))
            return
          }

          const metadata = {
            id: parts[0] || null,
            title: parts[1] || 'Unknown Title',
            duration: parts[2] || null,
            thumbnail: parts[3] || null,
            description: parts[4] || null,
            viewCount: parts[5] ? parseInt(parts[5]) : null,
            uploadDate: parts[6] || null,
            uploader: parts[7] || null,
            url: url
          }

          console.log('✅ Metadata extracted successfully for:', metadata.title)
          resolve(metadata)
        } catch (parseError) {
          console.error('Parse error:', parseError)
          reject(new Error(`Failed to parse metadata: ${parseError.message}`))
        }
      } else {
        reject(new Error(`yt-dlp failed with code ${code}: ${stderr}`))
      }
    })

    ytDlp.on('error', (error) => {
      reject(new Error(`Failed to start yt-dlp: ${error.message}`))
    })
  })
}

// Extract metadata from a single URL
metadata.post('/extract', async (c) => {
  try {
    const { url, cookieSessionId } = await c.req.json()

    if (!url) {
      return c.json({ error: 'URL is required' }, 400)
    }

    // Validate URL format
    try {
      new URL(url)
    } catch (error) {
      return c.json({ error: 'Invalid URL format' }, 400)
    }

    // Check if cookie session is provided and valid
    let cookieFilePath = null
    if (cookieSessionId) {
      // For simplicity, check if the cookie file exists in the temp directory
      const tempDir = 'temp-cookies'
      const potentialCookiePath = `${tempDir}/${cookieSessionId}.txt`
      
      if (fs.existsSync(potentialCookiePath)) {
        cookieFilePath = potentialCookiePath
        console.log('🍪 Using cookie file for metadata extraction:', cookieSessionId)
      } else {
        console.log('⚠️ Cookie session provided but file not found:', cookieSessionId)
      }
    }

    // Extract metadata using yt-dlp with optional cookies
    const metadata = await extractMetadataWithYtDlp(url, cookieFilePath)
    return c.json({ success: true, metadata })

  } catch (error) {
    console.error('❌ Metadata extraction failed:', error)
    return c.json({ 
      error: 'Failed to extract metadata',
      details: error.message 
    }, 400)
  }
})

// Extract formats using yt-dlp (following same pattern as download.js)
const extractFormatsWithYtDlp = (url) => {
  return new Promise((resolve, reject) => {
    const ytDlpArgs = [
      '--list-formats',
      '--no-warnings',
      '--simulate',
      '--no-playlist',
      url
    ]

    console.log('🔍 Extracting formats with yt-dlp for:', url)
    const ytDlp = spawn('yt-dlp', ytDlpArgs)
    let stdout = ''
    let stderr = ''

    ytDlp.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    ytDlp.stderr.on('data', (data) => {
      stderr += data.toString()
      console.log('yt-dlp stderr:', data.toString())
    })

    ytDlp.on('close', (code) => {
      if (code === 0) {
        try {
          // Parse format information
          const lines = stdout.split('\n').filter(line => line.trim())
          const formats = []

          for (const line of lines) {
            // Skip header lines and empty lines
            if (line.includes('ID') && line.includes('EXT') && line.includes('RESOLUTION')) continue
            if (!line.trim()) continue

            // Basic format parsing (this could be improved)
            const parts = line.trim().split(/\s+/)
            if (parts.length >= 3) {
              formats.push({
                id: parts[0],
                ext: parts[1],
                resolution: parts[2],
                raw: line.trim()
              })
            }
          }

          console.log(`✅ Formats extracted successfully: ${formats.length} formats found`)
          resolve(formats)
        } catch (parseError) {
          console.error('Formats parse error:', parseError)
          reject(new Error(`Failed to parse formats: ${parseError.message}`))
        }
      } else {
        reject(new Error(`yt-dlp failed with code ${code}: ${stderr}`))
      }
    })

    ytDlp.on('error', (error) => {
      reject(new Error(`Failed to start yt-dlp: ${error.message}`))
    })
  })
}

// Extract available formats from a URL
metadata.post('/formats', async (c) => {
  try {
    const { url } = await c.req.json()

    if (!url) {
      return c.json({ error: 'URL is required' }, 400)
    }

    // Validate URL format
    try {
      new URL(url)
    } catch (error) {
      return c.json({ error: 'Invalid URL format' }, 400)
    }

    // Extract formats using yt-dlp
    const formats = await extractFormatsWithYtDlp(url)
    return c.json({ success: true, formats })

  } catch (error) {
    console.error('❌ Formats extraction failed:', error)
    return c.json({ 
      error: 'Failed to extract formats',
      details: error.message 
    }, 400)
  }
})

export default metadata 