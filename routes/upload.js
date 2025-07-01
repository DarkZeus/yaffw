import { Hono } from 'hono'
import fs from 'fs'
import path from 'path'
import { generateUniqueFilename } from '../utils/fileUtils.js'
import { extractVideoMetadata } from '../utils/videoUtils.js'
import { extractAudioWaveform } from '../utils/audioUtils.js'

const upload = new Hono()

// Endpoint for committing file to server (hybrid approach for local files)
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
  
  const fileSizeBytes = parseInt(fileSize || '0')
  const TWO_GB = 2 * 1024 * 1024 * 1024  // 2,147,483,648 bytes
  const fileSizeGB = (fileSizeBytes / (1024 * 1024 * 1024)).toFixed(2)
  
  console.log(`📊 File commit request: "${originalFileName}" (${fileSizeGB} GB)`)
  
  // Smart file size detection: stream large files, buffer small ones
  if (fileSizeBytes >= TWO_GB) {
    console.log(`🌊 Large file detected (≥2GB), using streaming approach...`)
    return handleLargeFileStreaming(c, finalPath, originalFileName, uniqueFileName, fileSizeBytes)
  } else {
    console.log(`⚡ Small file detected (<2GB), using fast buffer approach...`)
    return handleSmallFileBuffer(c, finalPath, originalFileName, uniqueFileName, fileSizeBytes)
  }
})

// Handle large files with streaming (≥2GB)
async function handleLargeFileStreaming(c, finalPath, originalFileName, uniqueFileName, fileSizeBytes) {
  return new Promise((resolve) => {
    const writeStream = fs.createWriteStream(finalPath)
    const request = c.req.raw
    
    let bytesReceived = 0
    let lastLogTime = Date.now()
    const startTime = Date.now()
    
    console.log(`🚀 Starting streaming commit for "${originalFileName}"`)
    console.log(`📊 Expected file size: ${(fileSizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`)
    
    // Handle stream errors
    writeStream.on('error', (error) => {
      console.error('❌ File commit stream error:', error)
      if (fs.existsSync(finalPath)) {
        fs.unlinkSync(finalPath)
      }
      resolve(c.json({ 
        error: 'Failed to write file', 
        details: error.message 
      }, 500))
    })
    
    // Handle successful completion
    writeStream.on('finish', async () => {
      const duration = (Date.now() - startTime) / 1000
      const finalSize = (bytesReceived / (1024 * 1024 * 1024)).toFixed(2)
      const speed = (bytesReceived / (1024 * 1024)) / duration
      
      console.log(`✅ File streaming completed in ${duration.toFixed(1)}s`)
      console.log(`📁 Final file: ${finalPath} (${finalSize} GB)`)
      console.log(`⚡ Average speed: ${speed.toFixed(1)} MB/s`)
      
      try {
        console.log('🔍 Starting metadata extraction and waveform generation...')
        
        // Extract detailed metadata and waveform after file is saved
        const [metadata, waveformResult] = await Promise.all([
          extractVideoMetadata(finalPath),
          extractAudioWaveform(finalPath)
        ])
        
        console.log('✅ Metadata and waveform processing complete')
        
        resolve(c.json({
          success: true,
          filePath: finalPath,
          originalFileName: originalFileName,
          uniqueFileName: uniqueFileName,
          message: 'File committed successfully (streamed)',
          metadata: metadata,
          waveformData: waveformResult.keyPoints, // Backward compatibility
          waveformImagePath: waveformResult.imagePath,
          waveformImageDimensions: {
            width: waveformResult.imageWidth,
            height: waveformResult.imageHeight
          }
        }))
      } catch (error) {
        console.error('❌ Post-processing failed:', error)
        // Clean up file if processing fails
        if (fs.existsSync(finalPath)) {
          fs.unlinkSync(finalPath)
        }
        resolve(c.json({ 
          error: 'Failed to process file after commit', 
          details: error.message 
        }, 500))
      }
    })
    
    // Stream the request body directly to file using ReadableStream API
    if (request.body) {
      request.body.pipeTo(
        new WritableStream({
          write(chunk) {
            return new Promise((resolveWrite, rejectWrite) => {
              bytesReceived += chunk.byteLength
              
              // Log progress every 100MB or every 5 seconds
              const now = Date.now()
              const shouldLog = (bytesReceived % (100 * 1024 * 1024) < chunk.byteLength) || 
                               (now - lastLogTime > 5000)
              
              if (shouldLog && fileSizeBytes > 0) {
                const progress = ((bytesReceived / fileSizeBytes) * 100).toFixed(1)
                const receivedMB = (bytesReceived / (1024 * 1024)).toFixed(1)
                const totalMB = (fileSizeBytes / (1024 * 1024)).toFixed(1)
                const elapsed = (now - startTime) / 1000
                const speed = (bytesReceived / (1024 * 1024)) / elapsed
                
                console.log(`📈 Streaming progress: ${progress}% (${receivedMB}/${totalMB} MB) at ${speed.toFixed(1)} MB/s`)
                lastLogTime = now
              }
              
              const buffer = Buffer.from(chunk)
              const canWriteMore = writeStream.write(buffer)
              
              if (canWriteMore) {
                resolveWrite()
              } else {
                writeStream.once('drain', resolveWrite)
                writeStream.once('error', rejectWrite)
              }
            })
          },
          close() {
            console.log('🔒 Stream closed, finalizing file write...')
            writeStream.end()
          },
          abort(err) {
            console.error('⚠️ Stream aborted:', err)
            writeStream.destroy()
            if (fs.existsSync(finalPath)) {
              fs.unlinkSync(finalPath)
            }
          }
        })
      ).catch((error) => {
        console.error('❌ Streaming pipeline failed:', error)
        writeStream.destroy()
        if (fs.existsSync(finalPath)) {
          fs.unlinkSync(finalPath)
        }
        resolve(c.json({ 
          error: 'Stream processing failed', 
          details: error.message 
        }, 500))
      })
    } else {
      console.error('❌ No request body received')
      writeStream.destroy()
      resolve(c.json({ error: 'No request body received' }, 400))
    }
  })
}

// Handle small files with buffer (< 2GB)
async function handleSmallFileBuffer(c, finalPath, originalFileName, uniqueFileName, fileSizeBytes) {
  const startTime = Date.now()
  
  try {
    console.log(`⚡ Using fast buffer approach for ${(fileSizeBytes / (1024 * 1024)).toFixed(1)} MB file`)
    
    // Fast buffer approach for small files
    const buffer = await c.req.arrayBuffer()
    fs.writeFileSync(finalPath, Buffer.from(buffer))
    
    const duration = (Date.now() - startTime) / 1000
    console.log(`✅ File buffered in ${duration.toFixed(2)}s: ${finalPath}`)
    
    console.log('🔍 Starting metadata extraction and waveform generation...')
    
    // Extract detailed metadata first
    const metadata = await extractVideoMetadata(finalPath)
    
    // Only generate waveform if video has audio
    let waveformResult
    if (metadata?.hasAudio) {
      console.log('🎵 Video has audio - generating waveform')
      waveformResult = await extractAudioWaveform(finalPath)
    } else {
      console.log('🔇 Video has no audio - skipping waveform generation')
      waveformResult = {
        imagePath: null,
        keyPoints: [],
        imageWidth: 0,
        imageHeight: 0,
        hasAudio: false
      }
    }
    
    console.log('✅ Metadata and waveform processing complete')
    
    return c.json({
      success: true,
      filePath: finalPath,
      originalFileName: originalFileName,
      uniqueFileName: uniqueFileName,
      message: 'File committed successfully (buffered)',
      metadata: metadata,
      waveformData: waveformResult.keyPoints, // Backward compatibility
      waveformImagePath: waveformResult.imagePath,
      waveformImageDimensions: {
        width: waveformResult.imageWidth,
        height: waveformResult.imageHeight
        },
        hasAudio: waveformResult.hasAudio
    })
    
  } catch (error) {
    console.error('❌ File commit failed:', error)
    
    // Clean up partial file if it exists
    if (fs.existsSync(finalPath)) {
      fs.unlinkSync(finalPath)
    }
    
         return c.json({ 
       error: 'Failed to commit file', 
       details: error.message 
     }, 500)
   }
 }

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
        const metadata = await extractVideoMetadata(finalPath)
        
        // Only generate waveform if video has audio
        let waveformResult
        if (metadata?.hasAudio) {
          console.log('🎵 Video has audio - generating waveform')
          waveformResult = await extractAudioWaveform(finalPath)
        } else {
          console.log('🔇 Video has no audio - skipping waveform generation')
          waveformResult = {
            imagePath: null,
            keyPoints: [],
            imageWidth: 0,
            imageHeight: 0,
            hasAudio: false
          }
        }
        
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
            },
            hasAudio: waveformResult.hasAudio
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