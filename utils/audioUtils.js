import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import { createCanvas, loadImage } from 'canvas'
import { getVideoDuration } from './videoUtils.js'

const execAsync = promisify(exec)

// Extract waveform data from PNG image
const extractWaveformFromImage = async (imagePath, imageWidth, imageHeight, duration) => {
  const image = await loadImage(imagePath)
  const canvas = createCanvas(imageWidth, imageHeight)
  const ctx = canvas.getContext('2d')
  
  ctx.drawImage(image, 0, 0)
  const imageData = ctx.getImageData(0, 0, imageWidth, imageHeight)
  
  const waveformData = []
  const samplesPerPixel = Math.max(1, Math.floor(imageWidth / (duration * 8))) // Target ~8 samples per second
  
  for (let x = 0; x < imageWidth; x += samplesPerPixel) {
    let maxAmplitude = 0
    const centerY = imageHeight / 2
    
    // Check pixels from center outward to find waveform boundaries
    for (let y = 0; y < imageHeight; y++) {
      const pixelIndex = (y * imageWidth + x) * 4
      const brightness = imageData.data[pixelIndex] // Red channel (grayscale)
      
      if (brightness > 128) { // White pixel = waveform data
        const distanceFromCenter = Math.abs(y - centerY)
        const amplitude = distanceFromCenter / centerY
        maxAmplitude = Math.max(maxAmplitude, amplitude)
      }
    }
    
    const time = (x / imageWidth) * duration
    const finalAmplitude = Math.max(0.01, Math.min(1, maxAmplitude))
    
    waveformData.push({
      time: time,
      amplitude: finalAmplitude
    })
  }
  
  return waveformData
}

// Extract waveform using FFmpeg's showwavespic filter
const extractWaveformViaShowwavespic = async (filePath, duration) => {
  console.log('🎯 Using FFmpeg showwavespic filter for REAL waveform data...')
  
  const tempWaveformImage = `${filePath}.waveform.png`
  
  // Calculate optimal width based on duration
  const pixelsPerSecond = 15
  const imageWidth = Math.min(4000, Math.max(800, Math.floor(duration * pixelsPerSecond)))
  const imageHeight = 200
  
  // Generate high-resolution waveform image
  const waveformCommand = `ffmpeg -i "${filePath}" -filter_complex "aformat=channel_layouts=mono,showwavespic=s=${imageWidth}x${imageHeight}:colors=white" -frames:v 1 "${tempWaveformImage}" -y`
  
  await execAsync(waveformCommand)
  
  const waveformData = await extractWaveformFromImage(tempWaveformImage, imageWidth, imageHeight, duration)
  
  // Clean up temp file
  fs.unlinkSync(tempWaveformImage)
  
  console.log(`✅ REAL HIGH-RES waveform: ${waveformData.length} data points from ${imageWidth}x${imageHeight} image`)
  return waveformData
}

// Extract waveform using direct PCM analysis
const extractWaveformViaPCM = async (filePath, duration) => {
  console.log('🔊 Using direct PCM analysis for real audio data...')
  
  const tempAudioFile = `${filePath}.temp.raw`
  
  // Extract raw PCM data at reasonable sample rate for analysis
  const extractCommand = `ffmpeg -i "${filePath}" -ac 1 -ar 22050 -f s16le "${tempAudioFile}" -y`
  await execAsync(extractCommand)
  
  // Read raw PCM data
  const audioBuffer = fs.readFileSync(tempAudioFile)
  const samples = []
  
  // Read 16-bit signed samples
  for (let i = 0; i < audioBuffer.length; i += 2) {
    const sample = audioBuffer.readInt16LE(i)
    samples.push(Math.abs(sample) / 32768) // Normalize to 0-1
  }
  
  // Create high-resolution waveform (8 samples per second)
  const targetSamples = Math.floor(duration * 8)
  const step = Math.floor(samples.length / targetSamples)
  
  const waveformData = []
  for (let i = 0; i < targetSamples; i++) {
    const startIdx = i * step
    const endIdx = Math.min(startIdx + step, samples.length)
    
    // Calculate peak amplitude for this segment
    let peakAmplitude = 0
    for (let j = startIdx; j < endIdx; j++) {
      peakAmplitude = Math.max(peakAmplitude, samples[j])
    }
    
    const time = (i / targetSamples) * duration
    const amplitude = Math.max(0.01, Math.min(1, peakAmplitude * 1.2)) // Slight boost for visibility
    
    waveformData.push({ time, amplitude })
  }
  
  // Clean up temp file
  fs.unlinkSync(tempAudioFile)
  
  console.log(`✅ Direct PCM analysis: ${waveformData.length} high-res data points`)
  return waveformData
}

// Check if file has audio stream
const hasAudioStream = async (filePath) => {
  const audioCheckCommand = `ffprobe -v quiet -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "${filePath}"`
  const { stdout: audioCheck } = await execAsync(audioCheckCommand)
  return audioCheck.trim() === 'audio'
}

// Main function to extract real audio waveform data using ffmpeg
export const extractAudioWaveform = async (filePath) => {
  console.log('🎵 HIGH-RES real waveform extraction using FFmpeg:', filePath)
  
  const duration = await getVideoDuration(filePath)
  console.log(`📏 Video duration: ${duration.toFixed(2)} seconds`)
  
  // Method 1: Use FFmpeg's showwavespic filter
  try {
    return await extractWaveformViaShowwavespic(filePath, duration)
  } catch (error) {
    console.log('⚠️ showwavespic method failed:', error.message)
  }
  
  // Method 2: Direct PCM analysis
  try {
    return await extractWaveformViaPCM(filePath, duration)
  } catch (error) {
    console.log('⚠️ Direct PCM analysis failed:', error.message)
  }
  
  // Method 3: Fallback - Basic audio detection
  try {
    if (await hasAudioStream(filePath)) {
      console.log('⚠️ Using empty waveform - real extraction failed but audio detected')
      return []
    }
  } catch (error) {
    console.log('⚠️ Audio detection failed:', error.message)
  }
  
  console.log('❌ All real waveform methods failed')
  return []
} 