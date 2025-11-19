import { Hono } from 'hono'
import fs from 'fs'
import path from 'path'

const waveform = new Hono()

// Serve waveform images
waveform.get('/waveform/:filename', async (c) => {
  try {
    const filename = c.req.param('filename')
    const waveformPath = path.join('uploads', filename)
    
      
    // Security check - ensure filename ends with .waveform.png
    if (!filename.endsWith('.waveform.png')) {
      return c.json({ error: 'Invalid waveform file' }, 400)
    }
    
    // Check if file exists
    if (!fs.existsSync(waveformPath)) {
      return c.json({ error: 'Waveform image not found' }, 404)
    }
    
    // Read and serve the image
    const imageBuffer = fs.readFileSync(waveformPath)
    
    return new Response(imageBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        'Access-Control-Allow-Origin': 'http://localhost:3000'
      }
    })
  } catch (error) {
    return c.json({ error: 'Failed to serve waveform image' }, 500)
  }
})

export default waveform 