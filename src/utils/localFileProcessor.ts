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

/**
 * Process a video file locally for preview and analysis
 * This reads the file directly without uploading to server
 */
export async function processVideoLocally(file: File): Promise<LocalVideoFile> {
  const url = URL.createObjectURL(file)
  
  // Get basic metadata
  const metadata = await extractBasicMetadata(file, url)
  
  // Generate waveform data (client-side)
  const waveformData = await generateClientWaveform(file)
  
  return {
    file,
    url,
    duration: metadata.duration,
    waveformData,
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
        hasAudio: true, // Assume true, would need server analysis for exact
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
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    
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
 * Commit file to server for processing
 * Only called when user actually wants to process the video
 */
export async function commitFileToServer(
  localVideo: LocalVideoFile,
  onProgress?: (progress: number) => void
): Promise<string> {
  try {
    const response = await fetch('http://localhost:3001/api/commit-file', {
      method: 'POST',
      headers: {
        'x-filename': localVideo.file.name,
        'x-file-size': localVideo.file.size.toString(),
        'Content-Type': 'application/octet-stream'
      },
      body: localVideo.file
    })
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`)
    }
    
    const result = await response.json()
    return result.filePath
    
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