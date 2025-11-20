import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny'
import { useEffect, useState } from 'react'

export type AudioTrackInfo = {
  index: number
  label: string
  languageCode: string
  audioBuffer: AudioBuffer
  audioBlob: Blob | null
}

/**
 * Extract multiple audio tracks using Mediabunny
 * - AudioBuffer for WaveSurfer visualization
 * - Blob (WAV) for playback via hidden audio elements
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
        const input = new Input({
          source: new BlobSource(videoFile),
          formats: ALL_FORMATS
        })

        const tracks = await input.getAudioTracks()

        if (tracks.length === 0) {
          setAudioTracks([])
          setIsExtracting(false)
          return
        }

        const extractedTracks: AudioTrackInfo[] = []

        for (let i = 0; i < tracks.length; i++) {
          const track = tracks[i]

          const canDecode = await track.canDecode()
          if (!canDecode) {
            console.warn(`Track ${i} cannot be decoded, skipping`)
            continue
          }

          const duration = await track.computeDuration()
          
          const bufferSink = new AudioBufferSink(track)
          const buffers: AudioBuffer[] = []
          for await (const { buffer } of bufferSink.buffers(0, duration)) {
            buffers.push(buffer)
          }

          if (buffers.length === 0) {
            console.warn(`No audio data extracted for track ${i}`)
            continue
          }

          const mergedBuffer = mergeAudioBuffers(buffers)

          // Convert AudioBuffer to WAV Blob for playback
          const audioBlob = audioBufferToWavBlob(mergedBuffer)

          extractedTracks.push({
            index: i,
            label: track.name || `Audio ${i + 1}`,
            languageCode: track.languageCode || 'und',
            audioBuffer: mergedBuffer,
            audioBlob
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

// Merge multiple AudioBuffers into one
function mergeAudioBuffers(buffers: AudioBuffer[]): AudioBuffer {
  if (buffers.length === 0) {
    throw new Error('No buffers to merge')
  }

  if (buffers.length === 1) {
    return buffers[0]
  }

  const totalLength = buffers.reduce((sum, buffer) => sum + buffer.length, 0)
  const sampleRate = buffers[0].sampleRate
  const numberOfChannels = buffers[0].numberOfChannels

  const audioContext = new AudioContext()
  const mergedBuffer = audioContext.createBuffer(numberOfChannels, totalLength, sampleRate)

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

// Convert AudioBuffer to WAV Blob
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numberOfChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const length = buffer.length * numberOfChannels * 2 // 16-bit samples

  const arrayBuffer = new ArrayBuffer(44 + length)
  const view = new DataView(arrayBuffer)

  // WAV header
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + length, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, numberOfChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numberOfChannels * 2, true) // byte rate
  view.setUint16(32, numberOfChannels * 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeString(36, 'data')
  view.setUint32(40, length, true)

  // Interleave channels and convert to 16-bit PCM
  const channels: Float32Array[] = []
  for (let i = 0; i < numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i))
  }

  let offset = 44
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' })
}
