import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// Format time for FFmpeg (convert seconds to HH:MM:SS.ffffff format)
export const formatTimeForFFmpeg = (seconds) => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toFixed(6).padStart(9, '0')}`
}

// Extract video metadata using ffprobe
export const extractVideoMetadata = async (filePath) => {
  const command = `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`
  const { stdout } = await execAsync(command)
  const metadata = JSON.parse(stdout)
  
  // Find video and audio streams
  const videoStream = metadata.streams.find(stream => stream.codec_type === 'video')
  const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio')
  
  // Calculate aspect ratio
  const calculateAspectRatio = (width, height) => {
    if (!width || !height) return null
    const gcd = (a, b) => b === 0 ? a : gcd(b, a % b)
    const divisor = gcd(width, height)
    return `${width / divisor}:${height / divisor}`
  }
  
  return {
    // File info
    duration: parseFloat(metadata.format.duration) || 0,
    fileSize: parseInt(metadata.format.size) || 0,
    bitrate: parseInt(metadata.format.bit_rate) || 0,
    format: metadata.format.format_name,
    
    // Video info
    width: videoStream?.width || 0,
    height: videoStream?.height || 0,
    videoCodec: videoStream?.codec_name || 'unknown',
    videoBitrate: parseInt(videoStream?.bit_rate) || 0,
    fps: videoStream?.r_frame_rate ? eval(videoStream.r_frame_rate) : 0,
    pixelFormat: videoStream?.pix_fmt || 'unknown',
    profile: videoStream?.profile || 'unknown',
    
    // Audio info
    hasAudio: !!audioStream,
    audioCodec: audioStream?.codec_name || null,
    audioBitrate: parseInt(audioStream?.bit_rate) || 0,
    audioChannels: audioStream?.channels || 0,
    audioSampleRate: parseInt(audioStream?.sample_rate) || 0,
    
    // Calculated properties
    aspectRatio: calculateAspectRatio(videoStream?.width, videoStream?.height)
  }
}

// Get video duration using ffprobe
export const getVideoDuration = async (filePath) => {
  const command = `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`
  const { stdout } = await execAsync(command)
  return parseFloat(stdout) || 60
} 