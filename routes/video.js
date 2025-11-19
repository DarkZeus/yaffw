import { Hono } from 'hono'
import fs from 'fs'
import path from 'path'
import { deleteFile } from '../utils/fileUtils.js'

const video = new Hono()

// Stream video endpoint
video.get('/stream/:filename', async (c) => {
  const filename = c.req.param('filename')
  const filePath = path.join('uploads', filename)
  
  
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