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
    // Apply logarithmic scaling for better perception (like human hearing)
    // This makes quiet sounds much more visible while keeping loud sounds reasonable
    const boostedAmplitude = Math.min(1, maxAmplitude * 2.5)
    const logAmplitude = boostedAmplitude > 0 ? 
      Math.log10(boostedAmplitude * 9 + 1) : 0  // Maps 0->0, 1->1 logarithmically
    
    waveformData.push({
      time: time,
      amplitude: logAmplitude
    })
  }
  
  return waveformData
}

// Generate waveform image using FFmpeg's showwavespic filter
const generateWaveformImage = async (filePath, duration) => {
  console.log('🎯 Generating waveform image with FFmpeg showwavespic filter...')
  
  const waveformImagePath = `${filePath}.waveform.png`
  
  // Calculate optimal width based on duration for responsive image
  const pixelsPerSecond = 20 // Higher resolution for better quality
  const imageWidth = Math.min(6000, Math.max(1200, Math.floor(duration * pixelsPerSecond)))
  const imageHeight = 120 // Reasonable height for UI
  
  // Generate high-quality waveform image with better styling
  const waveformCommand = `ffmpeg -i "${filePath}" -filter_complex "aformat=channel_layouts=mono,showwavespic=s=${imageWidth}x${imageHeight}:colors=#06b6d4:scale=lin" -frames:v 1 "${waveformImagePath}" -y`
  
  await execAsync(waveformCommand)
  
  // Generate a small set of data points for precise overlay positioning
  const keyPoints = await extractWaveformFromImage(waveformImagePath, imageWidth, imageHeight, duration)
  
  console.log(`✅ Generated waveform image: ${imageWidth}x${imageHeight} saved to ${waveformImagePath}`)
  console.log(`📊 Extracted ${keyPoints.length} key data points for overlay positioning`)
  
  return {
    imagePath: waveformImagePath,
    keyPoints: keyPoints.filter((_, index) => index % 10 === 0), // Keep every 10th point for positioning
    imageWidth,
    imageHeight
  }
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
    // Apply logarithmic scaling for better perception (like human hearing)
    const boostedAmplitude = Math.min(1, peakAmplitude * 2.5)
    const logAmplitude = boostedAmplitude > 0 ? 
      Math.log10(boostedAmplitude * 9 + 1) : 0  // Maps 0->0, 1->1 logarithmically
    
    waveformData.push({ time, amplitude: logAmplitude })
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

// Main function to generate waveform image and extract key positioning data
export const extractAudioWaveform = async (filePath) => {
  console.log('🎵 Generating waveform image using FFmpeg:', filePath)
  
  const duration = await getVideoDuration(filePath)
  console.log(`📏 Video duration: ${duration.toFixed(2)} seconds`)
  
  // Method 1: Generate waveform image with showwavespic filter
  try {
    return await generateWaveformImage(filePath, duration)
  } catch (error) {
    console.log('⚠️ Waveform image generation failed:', error.message)
  }
  
  // Method 2: Fallback - Direct PCM analysis with empty image path
  try {
    const pcmData = await extractWaveformViaPCM(filePath, duration)
    console.log('⚠️ Using PCM data fallback - no image generated')
    return {
      imagePath: null,
      keyPoints: pcmData,
      imageWidth: 0,
      imageHeight: 0
    }
  } catch (error) {
    console.log('⚠️ Direct PCM analysis failed:', error.message)
  }
  
  // Method 3: Final fallback - Basic audio detection
  try {
    if (await hasAudioStream(filePath)) {
      console.log('⚠️ Audio detected but waveform generation failed')
      return {
        imagePath: null,
        keyPoints: [],
        imageWidth: 0,
        imageHeight: 0
      }
    }
  } catch (error) {
    console.log('⚠️ Audio detection failed:', error.message)
  }
  
  console.log('❌ All waveform generation methods failed')
  return {
    imagePath: null,
    keyPoints: [],
    imageWidth: 0,
    imageHeight: 0
  }
} 