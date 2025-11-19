
export type LocalVideoFile = {
  file: File
  url: string
  serverFilePath?: string // Only set when file is committed to server
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

const detectVideoAudio = (): boolean => {
  return true // Default to true, server will provide accurate hasAudio value
}

/**
 * Process a video file locally for preview and analysis
 * This reads the file directly without uploading to server
 */
export async function processVideoLocally(file: File): Promise<LocalVideoFile> {
  const url = URL.createObjectURL(file)
  
  return {
    file,
    url,
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
  hasAudio?: boolean
}> {
  const { apiClient } = await import('./apiClient')
  
  onProgress?.(0)
  
  type CommitResponse = {
    filePath: string
    hasAudio?: boolean
  }
  
  const response = await apiClient.post<CommitResponse>('/commit-file', localVideo.file, {
    headers: {
      'x-filename': localVideo.file.name,
      'x-file-size': localVideo.file.size.toString(),
      'Content-Type': 'application/octet-stream'
    },
    onUploadProgress: (progressEvent) => {
      if (progressEvent.total) {
        const progress = (progressEvent.loaded / progressEvent.total) * 100
        onProgress?.(progress)
      }
    },
    timeout: 5 * 60 * 1000 // 5 minutes for large files
  })
  
  return {
    filePath: response.filePath,
    hasAudio: response.hasAudio
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
