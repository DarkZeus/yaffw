import { Hono } from 'hono'
import fs from 'fs'
import path from 'path'
import { generateUniqueFilename } from '../utils/fileUtils.js'
import { extractVideoMetadata } from '../utils/videoUtils.js'
import { extractAudioWaveform } from '../utils/audioUtils.js'

const upload = new Hono()

// Endpoint for streaming file upload
upload.post('/upload-stream', async (c) => {
  // Get filename from headers
  const originalFileName = c.req.header('x-filename')
  const fileSize = c.req.header('x-file-size')
  
  if (!originalFileName) {
    return c.json({ error: 'Filename required in x-filename header' }, 400)
  }

  // Generate unique filename to prevent collisions
  const uniqueFileName = generateUniqueFilename(originalFileName)
  const finalPath = path.join('uploads', uniqueFileName)
  
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
        // Extract metadata and waveform data after upload completes
        console.log('📊 Processing uploaded file:', finalPath)
        const [metadata, waveformData] = await Promise.all([
          extractVideoMetadata(finalPath),
          extractAudioWaveform(finalPath)
        ])
        
        resolve(c.json({
          success: true,
          filePath: finalPath,
          originalFileName: originalFileName,
          uniqueFileName: uniqueFileName,
          message: 'Upload completed successfully',
          metadata: metadata,
          waveformData: waveformData
        }))
      } catch (error) {
        console.error('Post-processing failed:', error)
        // Still return success but without processed data
        resolve(c.json({
          success: true,
          filePath: finalPath,
          originalFileName: originalFileName,
          uniqueFileName: uniqueFileName,
          message: 'Upload completed successfully',
          metadata: null,
          waveformData: [],
          processingError: 'Failed to extract metadata/waveform'
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
})

export default upload 