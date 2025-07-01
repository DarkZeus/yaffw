import { Hono } from 'hono'
import fs from 'fs'
import path from 'path'

const waveform = new Hono()

// Serve waveform images
waveform.get('/waveform/:filename', async (c) => {
  try {
    const filename = c.req.param('filename')
    const waveformPath = path.join('uploads', filename)
    
    console.log('🎵 Waveform request:', {
      requestedFilename: filename,
      computedPath: waveformPath,
      fullPath: path.resolve(waveformPath)
    })
    
    // Security check - ensure filename ends with .waveform.png
    if (!filename.endsWith('.waveform.png')) {
      console.log('❌ Invalid waveform file extension:', filename)
      return c.json({ error: 'Invalid waveform file' }, 400)
    }
    
    // Check if file exists
    if (!fs.existsSync(waveformPath)) {
      console.log('❌ Waveform file not found:', waveformPath)
      console.log('📁 Files in uploads directory:', fs.readdirSync('uploads').filter(f => f.includes('waveform')))
      return c.json({ error: 'Waveform image not found' }, 404)
    }
    
    console.log('✅ Serving waveform image:', waveformPath)
    
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
    console.error('Error serving waveform image:', error)
    return c.json({ error: 'Failed to serve waveform image' }, 500)
  }
})

export default waveform 