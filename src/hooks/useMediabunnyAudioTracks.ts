import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny'
import { useEffect, useState } from 'react'

type AudioTrackInfo = {
  index: number
  label: string
  languageCode: string
  audioBuffer: AudioBuffer
}

/**
 * Extract multiple audio tracks using Mediabunny AudioBufferSink
 * Each track is decoded to AudioBuffer for WaveSurfer visualization
 */
export const useMediabunnyAudioTracks = (videoFile: File | null) => {
  const [audioTracks, setAudioTracks] = useState<AudioTrackInfo[]>([])
  const [isExtracting, setIsExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!videoFile) {
      setAudioTracks([])
      return
    }

    setIsExtracting(true)
    setError(null)

    const extractTracks = async () => {
      try {
        // Initialize Mediabunny input
        const input = new Input({
          source: new BlobSource(videoFile),
          formats: ALL_FORMATS
        })

        // Get all audio tracks
        const tracks = await input.getAudioTracks()

        if (tracks.length === 0) {
          setAudioTracks([])
          setIsExtracting(false)
          return
        }

        // Extract AudioBuffer for each track
        const extractedTracks: AudioTrackInfo[] = []

        for (let i = 0; i < tracks.length; i++) {
          const track = tracks[i]

          // Check if track can be decoded
          const canDecode = await track.canDecode()
          if (!canDecode) {
            console.warn(`Track ${i} cannot be decoded, skipping`)
            continue
          }

          // Create AudioBufferSink to extract decoded audio
          const sink = new AudioBufferSink(track)
          
          // Get duration to know how much audio to extract
          const duration = await track.computeDuration()
          
          // Collect all audio buffers and merge them
          const buffers: AudioBuffer[] = []
          for await (const { buffer } of sink.buffers(0, duration)) {
            buffers.push(buffer)
          }

          if (buffers.length === 0) {
            console.warn(`No audio data extracted for track ${i}`)
            continue
          }

          // Merge all buffers into one
          const mergedBuffer = mergeAudioBuffers(buffers)

          extractedTracks.push({
            index: i,
            label: track.name || `Audio ${i + 1}`,
            languageCode: track.languageCode || 'und',
            audioBuffer: mergedBuffer
          })
        }

        setAudioTracks(extractedTracks)
      } catch (err) {
        console.error('Failed to extract audio tracks with Mediabunny:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
        setAudioTracks([])
      } finally {
        setIsExtracting(false)
      }
    }

    extractTracks()
  }, [videoFile])

  return { audioTracks, isExtracting, error }
}

// Helper to merge multiple AudioBuffers into one
function mergeAudioBuffers(buffers: AudioBuffer[]): AudioBuffer {
  if (buffers.length === 0) {
    throw new Error('No buffers to merge')
  }

  if (buffers.length === 1) {
    return buffers[0]
  }

  // Calculate total length
  const totalLength = buffers.reduce((sum, buffer) => sum + buffer.length, 0)
  const sampleRate = buffers[0].sampleRate
  const numberOfChannels = buffers[0].numberOfChannels

  // Create new buffer
  const audioContext = new AudioContext()
  const mergedBuffer = audioContext.createBuffer(numberOfChannels, totalLength, sampleRate)

  // Copy data from all buffers
  let offset = 0
  for (const buffer of buffers) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const channelData = buffer.getChannelData(channel)
      mergedBuffer.getChannelData(channel).set(channelData, offset)
    }
    offset += buffer.length
  }

  return mergedBuffer
}
