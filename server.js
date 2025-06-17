import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import ffmpeg from 'ffmpeg'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'

const execAsync = promisify(exec)

// Function to extract video metadata using ffprobe
async function extractVideoMetadata(filePath) {
  try {
    const command = `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`
    const { stdout } = await execAsync(command)
    const metadata = JSON.parse(stdout)
    
    // Find video and audio streams
    const videoStream = metadata.streams.find(stream => stream.codec_type === 'video')
    const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio')
    
    // Extract relevant information
    const result = {
      // File info
      duration: parseFloat(metadata.format.duration) || 0,
      fileSize: parseInt(metadata.format.size) || 0,
      bitrate: parseInt(metadata.format.bit_rate) || 0,
      format: metadata.format.format_name,
      
      // Video info
      width: videoStream?.width || 0,
      height: videoStream?.height || 0,
      videoCodec: videoStream?.codec_name || 'unknown',
      videoBitrate: parseInt(videoStream?.bit_rate) || 0,
      fps: videoStream?.r_frame_rate ? eval(videoStream.r_frame_rate) : 0,
      pixelFormat: videoStream?.pix_fmt || 'unknown',
      profile: videoStream?.profile || 'unknown',
      
      // Audio info
      hasAudio: !!audioStream,
      audioCodec: audioStream?.codec_name || null,
      audioBitrate: parseInt(audioStream?.bit_rate) || 0,
      audioChannels: audioStream?.channels || 0,
      audioSampleRate: parseInt(audioStream?.sample_rate) || 0,
      
      // Calculated properties
      aspectRatio: videoStream?.width && videoStream?.height ? 
        `${videoStream.width}:${videoStream.height}`.replace(/(\d+):(\d+)/, (match, w, h) => {
          const gcd = (a, b) => b === 0 ? a : gcd(b, a % b)
          const divisor = gcd(parseInt(w), parseInt(h))
          return `${parseInt(w) / divisor}:${parseInt(h) / divisor}`
        }) : null
    }
    
    return result
  } catch (error) {
    console.error('FFprobe error:', error)
    return null
  }
}

const app = new Hono()

// Enable CORS for frontend
app.use('/api/*', cors({
  origin: 'http://localhost:3000',
  credentials: true,
}))

// Ensure uploads directory exists
const uploadsDir = 'uploads'
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir)
}

// Endpoint for streaming file upload
app.post('/api/upload-stream', async (c) => {
  try {
    // Get filename from headers
    const fileName = c.req.header('x-filename')
    const fileSize = c.req.header('x-file-size')
    
    if (!fileName) {
      return c.json({ error: 'Filename required in x-filename header' }, 400)
    }

    const finalPath = path.join(uploadsDir, fileName)
    
    return new Promise((resolve) => {
      const writeStream = fs.createWriteStream(finalPath)
      const request = c.req.raw
      
      let bytesReceived = 0
      const totalBytes = parseInt(fileSize || '0')
      
      // Handle stream errors
      writeStream.on('error', (error) => {
        resolve(c.json({ 
          error: 'Failed to write file', 
          details: error.message 
        }, 500))
      })
      
      // Handle successful completion
      writeStream.on('finish', async () => {
        try {
          // Extract metadata after upload completes
          const metadata = await extractVideoMetadata(finalPath)
          
          resolve(c.json({
            success: true,
            filePath: finalPath,
            message: 'Upload completed successfully',
            metadata: metadata
          }))
        } catch (error) {
          console.error('Metadata extraction failed:', error)
          // Still return success but without metadata
          resolve(c.json({
            success: true,
            filePath: finalPath,
            message: 'Upload completed successfully',
            metadata: null,
            metadataError: 'Failed to extract metadata'
          }))
        }
      })
      
      // Stream the request body directly to file
      request.body?.pipeTo(
        new WritableStream({
          write(chunk) {
            return new Promise((resolve, reject) => {
              bytesReceived += chunk.byteLength
              
              const buffer = Buffer.from(chunk)
              const canWriteMore = writeStream.write(buffer)
              
              if (canWriteMore) {
                resolve()
              } else {
                writeStream.once('drain', resolve)
                writeStream.once('error', reject)
              }
            })
          },
          close() {
            writeStream.end()
          },
          abort(err) {
            writeStream.destroy()
            if (fs.existsSync(finalPath)) {
              fs.unlinkSync(finalPath)
            }
          }
        })
      ).catch((error) => {
        writeStream.destroy()
        if (fs.existsSync(finalPath)) {
          fs.unlinkSync(finalPath)
        }
        resolve(c.json({ 
          error: 'Stream processing failed', 
          details: error.message 
        }, 500))
      })
    })

  } catch (error) {
    return c.json({ 
      error: 'Upload failed', 
      details: error.message 
    }, 500)
  }
})

// Updated trim video endpoint to work with reassembled files
app.post('/api/trim-video', async (c) => {
  try {
    const body = await c.req.json()
    const { filePath, startTime, endTime, fileName } = body
    
    if (!filePath || !fs.existsSync(filePath)) {
      return c.json({ error: 'Video file not found' }, 400)
    }

    // Create safe output filename (remove special characters and spaces)
    const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
    const outputPath = path.join(uploadsDir, `trimmed-${Date.now()}-${safeFileName}`)

    return new Promise(async (resolve) => {
      try {
        // Create safe temporary filename for processing (FFmpeg doesn't like spaces/special chars)
        const tempInputPath = path.join(uploadsDir, `temp-${Date.now()}.mp4`)
        fs.copyFileSync(filePath, tempInputPath)
        
        const cleanupFiles = () => {
          fs.unlink(filePath, () => {})      // Original reassembled file
          fs.unlink(tempInputPath, () => {}) // Temp file
        }
        
        // Format time properly (convert seconds to HH:MM:SS.mmm format)
        const formatTime = (seconds) => {
          const hours = Math.floor(seconds / 3600)
          const minutes = Math.floor((seconds % 3600) / 60)
          const secs = seconds % 60
          return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toFixed(3).padStart(6, '0')}`
        }
        
        const formattedStartTime = formatTime(parseFloat(startTime))
        const formattedEndTime = formatTime(parseFloat(endTime))
        
        // Use the exact same command structure that works for you
        const command = `ffmpeg -ss "${formattedStartTime}" -i "${tempInputPath}" -to "${formattedEndTime}" -c copy "${outputPath}"`
        
        console.log('Executing FFmpeg command:', command)
        
        try {
          await execAsync(command)
          
          // Read the trimmed video file
          const fileBuffer = fs.readFileSync(outputPath)
          
          cleanupFiles()
          fs.unlink(outputPath, () => {}) // Clean up output file after reading
          
          resolve(new Response(fileBuffer, {
            headers: {
              'Content-Type': 'video/mp4',
              'Content-Disposition': `attachment; filename="trimmed-${safeFileName}"`,
              'Content-Length': fileBuffer.length.toString(),
            },
          }))
          
        } catch (ffmpegError) {
          cleanupFiles()
          console.error('FFmpeg command failed:', ffmpegError)
          resolve(c.json({ 
            error: 'Failed to trim video', 
            details: ffmpegError.message || 'FFmpeg processing failed',
            command: command
          }, 500))
        }
        
      } catch (initError) {
        if (fs.existsSync(tempInputPath)) {
          fs.unlink(tempInputPath, () => {})
        }
        console.error('Processing initialization failed:', initError)
        resolve(c.json({ 
          error: 'Failed to initialize video processing', 
          details: initError.message || 'Processing initialization error'
        }, 500))
      }
    })

  } catch (error) {
    console.error('Server error:', error)
    return c.json({ 
      error: 'Server error', 
      details: error.message || 'Unknown server error'
    }, 500)
  }
})

const port = 3001
console.log(`Video processing server with chunked upload support running on http://localhost:${port}`)

serve({
  fetch: app.fetch,
  port
}) 