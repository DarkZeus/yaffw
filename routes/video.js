import { Hono } from 'hono'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import { createSafeFileName, deleteFile } from '../utils/fileUtils.js'
import { formatTimeForFFmpeg } from '../utils/videoUtils.js'

const execAsync = promisify(exec)
const video = new Hono()

// Stream video endpoint
video.get('/stream/:filename', async (c) => {
  const filename = c.req.param('filename')
  const filePath = path.join('uploads', filename)
  
  console.log('🎥 Video stream request for:', filename)
  console.log('🎥 Looking for file at:', filePath)
  console.log('🎥 File exists:', fs.existsSync(filePath))
  console.log('🎥 Files in uploads:', fs.readdirSync('uploads').filter(f => f.includes('downloaded')))
  
  if (!fs.existsSync(filePath)) {
    return c.json({ error: 'Video file not found' }, 404)
  }

  try {
    const stat = fs.statSync(filePath)
    const fileSize = stat.size
    const range = c.req.header('range')

    if (range) {
      // Handle range requests for video streaming
      const parts = range.replace(/bytes=/, "").split("-")
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
      const chunksize = (end - start) + 1
      const file = fs.createReadStream(filePath, { start, end })
      
      return new Response(file, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize.toString(),
          'Content-Type': 'video/mp4',
          'Access-Control-Allow-Origin': 'http://localhost:3000',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Range',
        }
      })
    } else {
      // Serve entire file
      const file = fs.createReadStream(filePath)
      return new Response(file, {
        headers: {
          'Content-Length': fileSize.toString(),
          'Content-Type': 'video/mp4',
          'Access-Control-Allow-Origin': 'http://localhost:3000',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Range',
        }
      })
    }
  } catch (error) {
    console.error('Video streaming error:', error)
    return c.json({ error: 'Failed to stream video' }, 500)
  }
})

// Trim video endpoint
video.post('/trim-video', async (c) => {
  const body = await c.req.json()
  const { filePath, startTime, endTime, fileName } = body
  
  if (!filePath || !fs.existsSync(filePath)) {
    return c.json({ error: 'Video file not found' }, 400)
  }

  // Create safe output filename
  const safeFileName = createSafeFileName(fileName)
  const outputPath = path.join('uploads', `trimmed-${Date.now()}-${safeFileName}`)

  return new Promise(async (resolve) => {
    // Create safe temporary filename for processing
    const tempInputPath = path.join('uploads', `temp-${Date.now()}.mp4`)
    fs.copyFileSync(filePath, tempInputPath)
    
    const cleanupTempFiles = () => {
      fs.unlink(tempInputPath, () => {}) // Only clean up temp file, keep original
    }
    
    const startTimeFloat = parseFloat(startTime)
    const endTimeFloat = parseFloat(endTime)
    
    const formattedStartTime = formatTimeForFFmpeg(startTimeFloat)
    const formattedEndTime = formatTimeForFFmpeg(endTimeFloat)
    
    // Debug logging
    console.log(`🎬 Trim request:`)
    console.log(`   Start: ${startTimeFloat}s (${formattedStartTime})`)
    console.log(`   End: ${endTimeFloat}s (${formattedEndTime})`)
    console.log(`   Duration: ${endTimeFloat - startTimeFloat}s`)
    
    // Use precise frame-accurate cutting
    const command = `ffmpeg -i "${tempInputPath}" -ss ${formattedStartTime} -to ${formattedEndTime} -c copy "${outputPath}"`
    
    console.log('Executing FFmpeg command:', command)
    
    try {
      await execAsync(command)
      
      // Read the trimmed video file
      const fileBuffer = fs.readFileSync(outputPath)
      
      cleanupTempFiles()
      fs.unlink(outputPath, () => {}) // Clean up output file after reading
      
      resolve(new Response(fileBuffer, {
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Disposition': `attachment; filename="trimmed-${safeFileName}"`,
          'Content-Length': fileBuffer.length.toString(),
        },
      }))
      
    } catch (ffmpegError) {
      cleanupTempFiles()
      console.error('FFmpeg command failed:', ffmpegError)
      resolve(c.json({ 
        error: 'Failed to trim video', 
        details: ffmpegError.message || 'FFmpeg processing failed',
        command: command
      }, 500))
    }
  })
})

// Delete video endpoint
video.delete('/delete-video', async (c) => {
  const body = await c.req.json()
  const { filePath } = body
  
  // Early return if no file path provided
  if (!filePath) {
    return c.json({ error: 'File path is required' }, 400)
  }
  
  // Early return if file doesn't exist
  if (!fs.existsSync(filePath)) {
    return c.json({ error: 'File not found' }, 404)
  }
  
  try {
    await deleteFile(filePath)
    console.log(`🗑️ User deleted file: ${filePath}`)
    return c.json({ 
      success: true, 
      message: 'Video file deleted successfully' 
    })
  } catch (error) {
    console.error('Failed to delete file:', error)
    return c.json({ 
      error: 'Failed to delete file', 
      details: error.message 
    }, 500)
  }
})

export default video 