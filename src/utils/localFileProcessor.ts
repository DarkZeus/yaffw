export type WaveformPoint = {
  time: number
  amplitude: number
}

export type LocalVideoFile = {
  file: File
  url: string
  duration: number
  waveformData: WaveformPoint[]
  serverFilePath?: string // Only set when file is committed to server
  waveformImagePath?: string // Server-generated waveform image path
  waveformImageDimensions?: { width: number; height: number }
  hasAudio?: boolean // Whether the video contains audio streams
}

export type LocalFileMetadata = {
  duration: number
  fileSize: number
  format: string
  width: number
  height: number
  fps: number
  hasAudio: boolean
  aspectRatio: string | null
}

type ExtendedHTMLVideoElement = HTMLVideoElement & {
  mozHasAudio?: boolean
  webkitAudioDecodedByteCount?: number
}

const detectVideoAudio = (video: ExtendedHTMLVideoElement): boolean => {
  if (video.mozHasAudio !== undefined) return video.mozHasAudio
  if (video.webkitAudioDecodedByteCount !== undefined) return video.webkitAudioDecodedByteCount > 0
  return false
}

/**
 * Process a video file locally for preview and analysis
 * This reads the file directly without uploading to server
 */
export async function processVideoLocally(file: File): Promise<LocalVideoFile> {
  const url = URL.createObjectURL(file)
  
  // Get basic metadata
  const metadata = await extractBasicMetadata(file, url)
  
  // Generate waveform data (client-side) only if video has audio
  const waveformData = metadata.hasAudio 
    ? await generateClientWaveform(file)
    : []
  
  return {
    file,
    url,
    duration: metadata.duration,
    waveformData,
    hasAudio: metadata.hasAudio,
  }
}

/**
 * Extract basic metadata from video file
 */
async function extractBasicMetadata(file: File, url: string): Promise<LocalFileMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    
    const timeout = setTimeout(() => {
      cleanup()
      reject(new Error('Metadata extraction timeout'))
    }, 10000)
    
    const cleanup = () => {
      clearTimeout(timeout)
      video.remove()
    }
    
    video.onloadedmetadata = () => {
      const metadata: LocalFileMetadata = {
        duration: video.duration,
        fileSize: file.size,
        format: file.type.split('/')[1] || 'unknown',
        width: video.videoWidth,
        height: video.videoHeight,
        fps: 30, // Estimate, would need server-side FFprobe for exact
        hasAudio: detectVideoAudio(video as ExtendedHTMLVideoElement), // Detect audio on client-side
        aspectRatio: video.videoWidth && video.videoHeight 
          ? `${video.videoWidth}:${video.videoHeight}` 
          : null,
      }
      
      cleanup()
      resolve(metadata)
    }
    
    video.onerror = () => {
      cleanup()
      reject(new Error('Failed to load video metadata'))
    }
    
    video.src = url
  })
}

/**
 * Generate waveform data on client-side using Web Audio API
 * This is a simplified version - for production you might want more sophisticated analysis
 */
async function generateClientWaveform(file: File): Promise<WaveformPoint[]> {
  try {
    // Create audio context
    const audioContext = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    
    // Read file as array buffer
    const arrayBuffer = await file.arrayBuffer()
    
    // Decode audio data
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    
    // Get first channel data
    const channelData = audioBuffer.getChannelData(0)
    const sampleRate = audioBuffer.sampleRate
    const duration = audioBuffer.duration
    
    // Generate waveform points (sample every ~100ms)
    const pointsPerSecond = 10
    const totalPoints = Math.floor(duration * pointsPerSecond)
    const samplesPerPoint = Math.floor(channelData.length / totalPoints)
    
    const waveformData: WaveformPoint[] = []
    
    for (let i = 0; i < totalPoints; i++) {
      const startSample = i * samplesPerPoint
      const endSample = Math.min(startSample + samplesPerPoint, channelData.length)
      
      // Calculate RMS amplitude for this segment
      let sum = 0
      for (let j = startSample; j < endSample; j++) {
        sum += channelData[j] * channelData[j]
      }
      const rms = Math.sqrt(sum / (endSample - startSample))
      
      waveformData.push({
        time: (i / pointsPerSecond),
        amplitude: rms
      })
    }
    
    // Cleanup
    audioContext.close()
    
    return waveformData
    
  } catch (error) {
    console.warn('Failed to generate client-side waveform:', error)
    // Return empty waveform if generation fails
    return []
  }
}

/**
 * Commit file to server for processing with progress tracking
 * Only called when user actually wants to process the video
 */
export async function commitFileToServer(
  localVideo: LocalVideoFile,
  onProgress?: (progress: number) => void
): Promise<{
  filePath: string
  waveformImagePath?: string
  waveformImageDimensions?: { width: number; height: number }
  waveformData?: WaveformPoint[]
}> {
  try {
    // Report initial progress
    onProgress?.(0)
    
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      
      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = (event.loaded / event.total) * 100
          console.log(`📤 Upload progress: ${progress.toFixed(1)}% (${event.loaded}/${event.total} bytes)`)
          onProgress?.(progress)
        }
      })
      
      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const responseData: {
              filePath: string
              waveformImagePath?: string
              waveformImageDimensions?: { width: number; height: number }
              waveformData?: WaveformPoint[]
            } = JSON.parse(xhr.responseText)
            
            onProgress?.(100)
            resolve({
              filePath: responseData.filePath,
              waveformImagePath: responseData.waveformImagePath,
              waveformImageDimensions: responseData.waveformImageDimensions,
              waveformData: responseData.waveformData
            })
          } catch (parseError) {
            reject(new Error(`Failed to parse server response: ${parseError}`))
          }
        } else {
          reject(new Error(`Server error: ${xhr.status} ${xhr.statusText}`))
        }
      })
      
      // Handle errors
      xhr.addEventListener('error', () => {
        reject(new Error('Network error during file upload'))
      })
      
      // Handle abort
      xhr.addEventListener('abort', () => {
        reject(new Error('File upload was aborted'))
      })
      
      // Start the upload
      xhr.open('POST', 'http://localhost:3001/api/commit-file')
      xhr.setRequestHeader('x-filename', localVideo.file.name)
      xhr.setRequestHeader('x-file-size', localVideo.file.size.toString())
      xhr.setRequestHeader('Content-Type', 'application/octet-stream')
      xhr.send(localVideo.file)
    })
    
  } catch (error) {
    throw new Error(`Failed to commit file to server: ${error}`)
  }
}

/**
 * Clean up local file resources
 */
export function cleanupLocalFile(localVideo: LocalVideoFile) {
  if (localVideo.url) {
    URL.revokeObjectURL(localVideo.url)
  }
}

/**
 * Generate server-side waveform for local file
 * This sends the file to server just for waveform generation, then discards the server copy
 */
export async function generateServerWaveform(
  file: File
): Promise<{
  waveformImagePath?: string
  waveformImageDimensions?: { width: number; height: number }
  waveformData?: WaveformPoint[]
}> {
  try {
    const { yaffwApi } = await import('./apiClient')
    const result = await yaffwApi.generateWaveform(file)
    
    return {
      waveformImagePath: result.waveformImagePath,
      waveformImageDimensions: result.waveformImageDimensions,
      waveformData: result.waveformData
    }
    
  } catch (error) {
    console.warn('Failed to generate server waveform:', error)
    return {}
  }
} 