import axios from 'axios'

export type WaveformPoint = {
  time: number
  amplitude: number
}

export type AxiosUploadOptions = {
  file: File
  onProgress?: (progress: number) => void
  onComplete?: (result: { 
    success: boolean; 
    filePath: string; 
    message: string;
    metadata?: {
      duration: number;
      fileSize: number;
      bitrate: number;
      format: string;
      width: number;
      height: number;
      videoCodec: string;
      videoBitrate: number;
      fps: number;
      pixelFormat: string;
      profile: string;
      hasAudio: boolean;
      audioCodec: string | null;
      audioBitrate: number;
      audioChannels: number;
      audioSampleRate: number;
      aspectRatio: string | null;
    } | null;
    waveformData?: WaveformPoint[];
    metadataError?: string;
    processingError?: string;
  }) => void
  onError?: (error: Error) => void
}

export async function axiosUpload({ 
  file, 
  onProgress, 
  onComplete, 
  onError 
}: AxiosUploadOptions) {
  try {
    const response = await axios.post(
      'http://localhost:3001/api/upload-stream',
      file,
      {
        headers: {
          'x-filename': file.name,
          'x-file-size': file.size.toString(),
          'Content-Type': 'application/octet-stream'
        },
        // Real upload progress tracking! 🎯
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const progress = (progressEvent.loaded / progressEvent.total) * 100
            onProgress?.(progress)
          }
        },
        // 30 minute timeout for large files
        timeout: 30 * 60 * 1000
      }
    )

    const result = response.data
    onComplete?.(result)
    return result

  } catch (error) {
    const uploadError = axios.isAxiosError(error) 
      ? new Error(error.response?.data?.error || error.message || 'Upload failed')
      : new Error('Unknown upload error')
    
    onError?.(uploadError)
    throw uploadError
  }
} 