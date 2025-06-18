import { Hono } from 'hono'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import { createSafeFileName, deleteFile } from '../utils/fileUtils.js'
import { formatTimeForFFmpeg } from '../utils/videoUtils.js'

const execAsync = promisify(exec)
const video = new Hono()

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