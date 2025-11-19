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
  const waveformImagePath = `${filePath}.waveform.png`
  
  // Calculate optimal width based on duration for responsive image
  const pixelsPerSecond = 20 // Higher resolution for better quality
  const imageWidth = Math.min(6000, Math.max(1200, Math.floor(duration * pixelsPerSecond)))
  const imageHeight = 120 // Reasonable height for UI
  
  // Generate high-quality waveform image with better styling
  // Using sqrt scale for optimal video editing: good balance between showing
  // quiet parts (dialog/ambient) and loud parts (music/effects) clearly
  const waveformCommand = `ffmpeg -i "${filePath}" -filter_complex "aformat=channel_layouts=mono,showwavespic=s=${imageWidth}x${imageHeight}:colors=#06b6d4:scale=sqrt" -frames:v 1 "${waveformImagePath}" -y`
  
  await execAsync(waveformCommand)
  
  return {
    imagePath: waveformImagePath,
    imageWidth,
    imageHeight
  }
}

// Check if file has audio stream
const hasAudioStream = async (filePath) => {
  const audioCheckCommand = `ffprobe -v quiet -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "${filePath}"`
  const { stdout: audioCheck } = await execAsync(audioCheckCommand)
  return audioCheck.trim() === 'audio'
}

// Main function to generate waveform image and extract key positioning data
export const extractAudioWaveform = async (filePath) => {
  
  // First, check if the video has any audio streams
  try {
    const hasAudio = await hasAudioStream(filePath)
    if (!hasAudio) {
      return {
        imagePath: null,
        imageWidth: 0,
        imageHeight: 0,
        hasAudio: false
      }
    }
  } catch (error) {
    return {
      imagePath: null,
      imageWidth: 0,
      imageHeight: 0,
      hasAudio: false
    }
  }
  
  const duration = await getVideoDuration(filePath)
  
  const result = await generateWaveformImage(filePath, duration)
    return {
      ...result,
      hasAudio: true
    }
} 