import axios, {type AxiosInstance, type AxiosRequestConfig, type AxiosResponse} from 'axios'
import {
  ALL_FORMATS,
  AudioBufferSink,
  AudioBufferSource,
  type AudioTrack,
  BlobSource,
  BufferTarget,
  Conversion,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  MovOutputFormat,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  WebMOutputFormat
} from 'mediabunny'
import {STANDARD_RESOLUTIONS} from '../constants/quality-modal.constants'
import {createSSEProgressTracker} from './sseClient'

// Base API configuration
const API_BASE_URL = 'http://localhost:3001/api'
const DEFAULT_TIMEOUT = 10000 // 10 seconds

// Response types for different endpoints
export type DeleteVideoResponse = {
  success: boolean
  message?: string
  error?: string
}

export type CleanupResponse = {
  success: boolean
  message?: string
  deletedCount?: number
  error?: string
}


// Create axios instance with common configuration
const apiInstance: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: DEFAULT_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor for logging and common headers
apiInstance.interceptors.request.use(
  (config) => {
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for logging and error handling
apiInstance.interceptors.response.use(
  (response: AxiosResponse) => {
    return response
  },
  (error) => {
    // Use detailed error message when available, fallback to generic error
    const errorMessage = error.response?.data?.details || error.response?.data?.error || error.message || 'API request failed'
    return Promise.reject(new Error(errorMessage))
  }
)

// Quality settings type for video operations
type QualitySettings = {
  resolution?: string
  bitrate?: number
  codec?: string
  useGpuAcceleration?: boolean
  gpuVendor?: string
}

// Utility to get file extension from codec
export const getFileExtensionFromCodec = (codec: string): string => {
  if (codec.includes('_webm')) return '.webm'
  if (codec.includes('_mov')) return '.mov'
  return '.mp4' // Default for h264_mp4, h265_mp4, av1
}


// API client methods
export const apiClient = {
  // GET request
  get: async <T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    const response = await apiInstance.get<T>(url, config)
    return response.data
  },

  // POST request
  post: async <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> => {
    const response = await apiInstance.post<T>(url, data, config)
    return response.data
  },

  // PUT request
  put: async <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> => {
    const response = await apiInstance.put<T>(url, data, config)
    return response.data
  },

  // DELETE request
  delete: async <T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    const response = await apiInstance.delete<T>(url, config)
    return response.data
  },

  // PATCH request
  patch: async <T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> => {
    const response = await apiInstance.patch<T>(url, data, config)
    return response.data
  },

  // Raw axios instance for advanced usage
  instance: apiInstance,

  // SSE progress tracking with polling fallback
  trackProgress: async <T = unknown>(
    progressId: string, 
    onProgress?: (progress: number, message: string, speed?: number) => void
  ): Promise<T> => {
    try {
      // Try SSE first
      const result = await createSSEProgressTracker(progressId, onProgress)
      return result as T
    } catch (sseError) {
      
      // Check if this is a restriction error - if so, preserve it instead of falling back to polling
      const isRestrictionError = sseError instanceof Error && 'isRestrictionError' in sseError 
        ? (sseError as Error & { isRestrictionError?: boolean }).isRestrictionError 
        : false
      
      
      if (isRestrictionError) {
        // Don't fall back to polling for restriction errors - preserve the error with its flag
        throw sseError
      }
      
      
      // Fallback to polling
      return new Promise((resolve, reject) => {
        const pollInterval = setInterval(async () => {
          try {
            const progressResponse = await apiInstance.get<{
              progress: number
              message: string
              speed?: number
              timestamp: number
              completed?: boolean
              result?: T
              error?: string
            }>(`/download/progress/${progressId}`, { timeout: 5000 })

            const progressData = progressResponse.data
            

            // Call progress callback if provided
            if (onProgress) {
              onProgress(progressData.progress, progressData.message, progressData.speed)
            }

            // Check if completed
            if (progressData.completed) {
              clearInterval(pollInterval)
              
              if (progressData.error) {
                reject(new Error(progressData.error))
              } else if (progressData.result) {
                resolve(progressData.result)
              } else {
                reject(new Error('Download completed but no result available'))
              }
            }
          } catch (pollError) {
            if (axios.isAxiosError(pollError)) {
              if (pollError.response?.status === 404) {
                clearInterval(pollInterval)
                reject(new Error('Download progress lost or expired'))
              } else {
              }
            } else {
            }
          }
        }, 1000) // Poll every second

        // Set maximum polling time (5 minutes)
        setTimeout(() => {
          clearInterval(pollInterval)
          reject(new Error('Progress tracking timeout - no updates received'))
        }, 5 * 60 * 1000)
      })
    }
  }
}

// Specialized API methods for common YAFFW operations
export const yaffwApi = {
  // Video operations - client-side trimming using Mediabunny
  trimVideo: async (payload: {
    file: File
    start: number
    end: number
    fileName?: string
    qualitySettings?: Partial<QualitySettings>
  }) => {
    const audioTrackControls = payload.qualitySettings?.audioTrackControls || new Map()
    const input = new Input({
      source: new BlobSource(payload.file),
      formats: ALL_FORMATS
    })
    
    const bufferTarget = new BufferTarget()
    
    // Map codec to output format and container
    const getOutputFormat = () => {
      if (!payload.qualitySettings?.codec) return new Mp4OutputFormat()
      
      const codec = payload.qualitySettings.codec
      if (codec.includes('_webm')) return new WebMOutputFormat()
      if (codec.includes('_mov')) return new MovOutputFormat()
      return new Mp4OutputFormat()
    }
    
    // Get MIME type based on codec
    const getMimeType = () => {
      if (!payload.qualitySettings?.codec) return 'video/mp4'
      
      const codec = payload.qualitySettings.codec
      if (codec.includes('_webm')) return 'video/webm'
      if (codec.includes('_mov')) return 'video/quicktime'
      return 'video/mp4'
    }
    
    const output = new Output({
      format: getOutputFormat(),
      target: bufferTarget
    })
    
    // Build video track configuration
    const videoConfig: Record<string, unknown> = {}
    
    // Apply resolution if specified and not 'original'
    if (payload.qualitySettings?.resolution && payload.qualitySettings.resolution !== 'original') {
      const resolutionOption = STANDARD_RESOLUTIONS.find(r => r.value === payload.qualitySettings?.resolution)
      if (resolutionOption && resolutionOption.width > 0) {
        videoConfig.width = resolutionOption.width
        videoConfig.height = resolutionOption.height
        videoConfig.fit = 'contain'
      }
    }
    
    // Apply codec if specified (or default when bitrate is set)
    const codecMap: Record<string, string> = {
      'h264_mp4': 'avc',
      'h265_mp4': 'hevc',
      'vp8_webm': 'vp8',
      'vp9_webm': 'vp9',
      'h264_mov': 'avc',
      'h265_mov': 'hevc',
      'prores_mov': 'prores',
      'av1': 'av1'
    }
    
    if (payload.qualitySettings?.codec) {
      const mappedCodec = codecMap[payload.qualitySettings.codec]
      if (mappedCodec) {
        videoConfig.codec = mappedCodec
      }
    } else if (payload.qualitySettings?.bitrate && payload.qualitySettings.bitrate > 0) {
      videoConfig.codec = 'avc'
    }
    
    // Apply bitrate if specified - convert Mbps to bits per second (bps)
    if (payload.qualitySettings?.bitrate && payload.qualitySettings.bitrate > 0) {
      const BITRATE_MULTIPLIER = 2.2
      videoConfig.bitrate = Math.round((payload.qualitySettings.bitrate / BITRATE_MULTIPLIER) * 1_000_000)
      videoConfig.bitrateMode = 'constant'
    }
    
    // GPU acceleration via hardwareAcceleration hint
    if (payload.qualitySettings?.useGpuAcceleration) {
      videoConfig.hardwareAcceleration = 'prefer-hardware'
    }
    
    // Force transcoding when quality settings are applied
    if (Object.keys(videoConfig).length > 0) {
      videoConfig.forceTranscode = true
    }
    

    // Get audio tracks and check if mixing is needed
    const audioTracks = await input.getAudioTracks()
    const hasSolo = Array.from(audioTrackControls.values()).some(ctrl => ctrl.solo)
    
    const tracksToMix: { track: AudioTrack; volume: number; mono: boolean }[] = []
    for (let i = 0; i < audioTracks.length; i++) {
      const controls = audioTrackControls.get(i)
      if (controls?.muted || (hasSolo && !controls?.solo)) continue
      tracksToMix.push({ 
        track: audioTracks[i], 
        volume: controls?.volume ?? 1,
        mono: controls?.mono ?? false
      })
    }
    
    // Helper: Convert stereo AudioBuffer to mono
    const convertToMono = (buffer: AudioBuffer): AudioBuffer => {
      if (buffer.numberOfChannels === 1) return buffer
      
      const audioCtx = new AudioContext()
      const monoBuffer = audioCtx.createBuffer(1, buffer.length, buffer.sampleRate)
      const monoData = monoBuffer.getChannelData(0)
      
      // Average all channels into mono
      for (let i = 0; i < buffer.length; i++) {
        let sum = 0
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
          sum += buffer.getChannelData(ch)[i]
        }
        monoData[i] = sum / buffer.numberOfChannels
      }
      
      return monoBuffer
    }
    
    // If 2+ tracks, mix audio first, then process video with quality settings
    if (tracksToMix.length > 1) {
      console.log(`Mixing ${tracksToMix.length} audio tracks`)
      
      // STEP 1: Extract and mix audio tracks
      const audioBuffers: { buffer: AudioBuffer; volume: number }[] = []
      
      for (const { track, volume, mono } of tracksToMix) {
        const canDecode = await track.canDecode()
        if (!canDecode) continue
        
        const sink = new AudioBufferSink(track)
        const buffers: AudioBuffer[] = []
        
        for await (const { buffer } of sink.buffers(payload.start, payload.end)) {
          buffers.push(buffer)
        }
        
        if (buffers.length === 0) continue
        
        // Concatenate buffers if multiple chunks
        let merged: AudioBuffer
        if (buffers.length === 1) {
          merged = buffers[0]
        } else {
          const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
          const sampleRate = buffers[0].sampleRate
          const numChannels = buffers[0].numberOfChannels
          const audioCtx = new AudioContext()
          merged = audioCtx.createBuffer(numChannels, totalLength, sampleRate)
          let offset = 0
          for (const buf of buffers) {
            for (let ch = 0; ch < numChannels; ch++) {
              merged.getChannelData(ch).set(buf.getChannelData(ch), offset)
            }
            offset += buf.length
          }
        }
        
        // Convert to mono if requested
        if (mono) {
          merged = convertToMono(merged)
        }
        
        audioBuffers.push({ buffer: merged, volume })
      }
      
      if (audioBuffers.length === 0) {
        throw new Error('No valid audio tracks')
      }
      
      // Mix all tracks together
      const sampleRate = audioBuffers[0].buffer.sampleRate
      const maxDuration = Math.max(...audioBuffers.map(ab => ab.buffer.duration))
      const numChannels = Math.max(...audioBuffers.map(ab => ab.buffer.numberOfChannels))
      
      const offlineCtx = new OfflineAudioContext(numChannels, sampleRate * maxDuration, sampleRate)
      
      for (const { buffer, volume } of audioBuffers) {
        const source = offlineCtx.createBufferSource()
        source.buffer = buffer
        const gain = offlineCtx.createGain()
        gain.gain.value = volume
        source.connect(gain)
        gain.connect(offlineCtx.destination)
        source.start(0)
      }
      
      const mixedAudioBuffer = await offlineCtx.startRendering()
      
      // STEP 2: Process video with quality settings (no audio)
      const videoOnlyTarget = new BufferTarget()
      const videoOnlyOutput = new Output({
        format: getOutputFormat(),
        target: videoOnlyTarget
      })
      
      const videoConversionConfig = {
        input,
        output: videoOnlyOutput,
        trim: {
          start: payload.start,
          end: payload.end
        },
        audio: () => ({ discard: true }) // Discard all audio
      }
      
      const videoFinalConfig = Object.keys(videoConfig).length > 0 
        ? { ...videoConversionConfig, video: videoConfig }
        : videoConversionConfig
      
      const videoConversion = await Conversion.init(videoFinalConfig)
      await videoConversion.execute()
      
      const videoOnlyBlob = new Blob([videoOnlyTarget.buffer!], { type: getMimeType() })
      
      // STEP 3: Manually combine video-only with mixed audio
      const videoOnlyInput = new Input({
        source: new BlobSource(videoOnlyBlob),
        formats: ALL_FORMATS
      })
      
      const processedVideoTrack = await videoOnlyInput.getPrimaryVideoTrack()
      if (!processedVideoTrack) {
        throw new Error('No video track in processed video')
      }
      
      // Setup video packet source
      const videoPacketSink = new EncodedPacketSink(processedVideoTrack)
      const videoPacketSource = new EncodedVideoPacketSource(processedVideoTrack.codec)
      
      // Setup audio source
      const audioBufferSource = new AudioBufferSource({ 
        codec: 'aac', 
        bitrate: QUALITY_HIGH 
      })
      
      // Add tracks to final output
      output.addVideoTrack(videoPacketSource)
      output.addAudioTrack(audioBufferSource)
      
      await output.start()
      
      // Copy all video packets and add mixed audio in parallel
      await Promise.all([
        (async () => {
          const decoderConfig = await processedVideoTrack.getDecoderConfig()
          let firstPacket = await videoPacketSink.getFirstPacket()
          
          if (!firstPacket) {
            throw new Error('No video packets found')
          }
          
          // Add first packet with decoder config
          await videoPacketSource.add(firstPacket, { decoderConfig })
          
          // Copy remaining packets
          let currentPacket = await videoPacketSink.getNextPacket(firstPacket)
          while (currentPacket) {
            await videoPacketSource.add(currentPacket)
            currentPacket = await videoPacketSink.getNextPacket(currentPacket)
          }
          
          videoPacketSource.close()
        })(),
        (async () => {
          await audioBufferSource.add(mixedAudioBuffer)
          audioBufferSource.close()
        })()
      ])
      
      await output.finalize()
    } else {
      // Single/no tracks - use Conversion
      const baseConfig = {
        input,
        output,
        trim: {
          start: payload.start,
          end: payload.end
        },
        audio: (audioTrack: AudioTrack, trackIndex: number) => {
          const controls = audioTrackControls.get(trackIndex)
          
          if (controls?.muted || (hasSolo && !controls?.solo)) {
            return { discard: true }
          }
          
          if (controls && (controls.volume !== 1 || controls.mono)) {
            return {
              process: (sample) => {
                if (!sample?.data) return sample
                
                let processedData = sample.data
                
                // Convert to mono if requested
                if (controls.mono && sample.data.length > 1) {
                  const monoChannel = new Float32Array(sample.data[0].length)
                  for (let i = 0; i < monoChannel.length; i++) {
                    let sum = 0
                    for (const channel of sample.data) {
                      sum += channel[i]
                    }
                    monoChannel[i] = sum / sample.data.length
                  }
                  processedData = [monoChannel]
                }
                
                // Apply volume
                if (controls.volume !== 1) {
                  processedData = processedData.map(channel => {
                    const newChannel = new Float32Array(channel.length)
                    for (let i = 0; i < channel.length; i++) {
                      newChannel[i] = channel[i] * controls.volume
                    }
                    return newChannel
                  })
                }
                
                return {
                  ...sample,
                  data: processedData
                }
              }
            }
          }
          
          return {}
        }
      }
      
      const conversionConfig = Object.keys(videoConfig).length > 0 
        ? { ...baseConfig, video: videoConfig }
        : baseConfig
      
      const conversion = await Conversion.init(conversionConfig)
      await conversion.execute()
    }
    
    
    const buffer = bufferTarget.buffer
    if (!buffer) {
      throw new Error('Conversion failed: no output buffer generated')
    }
    const blob = new Blob([buffer], { type: getMimeType() })
    
    return {
      status: 200,
      statusText: 'OK',
      data: blob
    }
  },

  deleteVideo: async (filePath: string): Promise<DeleteVideoResponse> => {
    return apiClient.delete<DeleteVideoResponse>('/delete-video', {
      data: { filePath }
    })
  },

  // File operations
  cleanupOldFiles: async (): Promise<CleanupResponse> => {
    return apiClient.post<CleanupResponse>('/cleanup-old-files', { action: 'cleanup' }, {
      timeout: 30000, // 30 seconds for cleanup
    })
  },

  // Stream operations
  getVideoStream: async (fileName: string) => {
    // Return the full response for streaming
    return apiInstance.get(`/stream/${fileName}`, {
      responseType: 'blob', // For video streaming
    })
  },
}

// Export types for TypeScript support
export type ApiResponse<T = unknown> = T
export type ApiError = Error

// Utility function to check if error is from API
export const isApiError = (error: unknown): error is ApiError => {
  return error instanceof Error
} 