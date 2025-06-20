import { Hono } from 'hono'
import fs from 'fs'
import path from 'path'
import { generateUniqueFilename } from '../utils/fileUtils.js'
import { extractVideoMetadata } from '../utils/videoUtils.js'
import { extractAudioWaveform } from '../utils/audioUtils.js'

const upload = new Hono()

// Endpoint for committing file to server (hybrid approach)
// Only called when user wants to actually process the video
upload.post('/commit-file', async (c) => {
  const originalFileName = c.req.header('x-filename')
  const fileSize = c.req.header('x-file-size')
  
  if (!originalFileName) {
    return c.json({ error: 'Filename required in x-filename header' }, 400)
  }

  // Generate unique filename to prevent collisions
  const uniqueFileName = generateUniqueFilename(originalFileName)
  const finalPath = path.join('uploads', uniqueFileName)
  
  try {
    // Simple file copy instead of streaming
    const buffer = await c.req.arrayBuffer()
    fs.writeFileSync(finalPath, Buffer.from(buffer))
    
    console.log('📁 File committed to server:', finalPath)
    
    // Extract detailed metadata and waveform after file is saved
    const [metadata, waveformResult] = await Promise.all([
      extractVideoMetadata(finalPath),
      extractAudioWaveform(finalPath)
    ])
    
    return c.json({
      success: true,
      filePath: finalPath,
      originalFileName: originalFileName,
      uniqueFileName: uniqueFileName,
      message: 'File committed successfully',
      metadata: metadata,
      waveformData: waveformResult.keyPoints, // Backward compatibility
      waveformImagePath: waveformResult.imagePath,
      waveformImageDimensions: {
        width: waveformResult.imageWidth,
        height: waveformResult.imageHeight
      }
    })
    
  } catch (error) {
    console.error('File commit failed:', error)
    
    // Clean up partial file if it exists
    if (fs.existsSync(finalPath)) {
      fs.unlinkSync(finalPath)
    }
    
    return c.json({ 
      error: 'Failed to commit file', 
      details: error.message 
    }, 500)
  }
})

// Keep the old streaming endpoint for backward compatibility
// But it's now optional - hybrid approach
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
        const [metadata, waveformResult] = await Promise.all([
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
          waveformData: waveformResult.keyPoints, // Backward compatibility
          waveformImagePath: waveformResult.imagePath,
          waveformImageDimensions: {
            width: waveformResult.imageWidth,
            height: waveformResult.imageHeight
          }
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
            waveformImagePath: null,
            waveformImageDimensions: { width: 0, height: 0 },
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

// New endpoint for generating waveform only (using streaming for large files)
upload.post('/generate-waveform', async (c) => {
  const originalFileName = c.req.header('x-filename')
  
  if (!originalFileName) {
    return c.json({ error: 'Filename required in x-filename header' }, 400)
  }

  // Generate unique filename to prevent collisions
  const uniqueFileName = generateUniqueFilename(originalFileName)
  const finalPath = path.join('uploads', uniqueFileName)
  
  try {
    // Stream the file to disk instead of loading into memory
    const writeStream = fs.createWriteStream(finalPath)
    
    // Use streaming approach
    const request = c.req.raw
    const reader = request.body?.getReader()
    
    if (!reader) {
      throw new Error('No request body')
    }
    
    // Stream data chunk by chunk
    let done = false
    while (!done) {
      const { value, done: readerDone } = await reader.read()
      done = readerDone
      if (value) {
        writeStream.write(Buffer.from(value))
      }
    }
    
    // Close write stream
    writeStream.end()
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve)
      writeStream.on('error', reject)
    })
    
    console.log('📁 File streamed for waveform generation:', finalPath)
    
    // Generate waveform only
    const waveformResult = await extractAudioWaveform(finalPath)
    
    // Clean up the temporary file after waveform generation
    fs.unlinkSync(finalPath)
    
    return c.json({
      success: true,
      waveformData: waveformResult.keyPoints,
      waveformImagePath: waveformResult.imagePath,
      waveformImageDimensions: {
        width: waveformResult.imageWidth,
        height: waveformResult.imageHeight
      }
    })
    
  } catch (error) {
    console.error('Waveform generation failed:', error)
    
    // Clean up partial file if it exists
    if (fs.existsSync(finalPath)) {
      fs.unlinkSync(finalPath)
    }
    
    return c.json({ 
      error: 'Failed to generate waveform', 
      details: error.message 
    }, 500)
  }
})

export default upload 