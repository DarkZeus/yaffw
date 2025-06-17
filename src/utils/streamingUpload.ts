export interface StreamingUploadOptions {
  file: File
  onProgress?: (progress: number) => void
  onComplete?: (result: { success: boolean; filePath: string; message: string }) => void
  onError?: (error: Error) => void
}

export async function streamingUpload({ 
  file, 
  onProgress, 
  onComplete, 
  onError 
}: StreamingUploadOptions) {
  try {
    // Simple progress tracking simulation (fetch doesn't have built-in upload progress)
    let uploadComplete = false
    
    // Simulate progress for user feedback
    const progressInterval = setInterval(() => {
      if (!uploadComplete) {
        // Simulate gradual progress (not accurate, but gives user feedback)
        const currentProgress = Math.min(95, Math.random() * 10 + 85)
        onProgress?.(currentProgress)
      }
    }, 1000)

    // Send file directly as body - much simpler!
    const response = await fetch('http://localhost:3001/api/upload-stream', {
      method: 'POST',
      headers: {
        'x-filename': file.name,
        'x-file-size': file.size.toString(),
        'Content-Type': 'application/octet-stream'
      },
      body: file // Just send the File object directly!
    })

    clearInterval(progressInterval)
    uploadComplete = true
    onProgress?.(100)

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Upload failed')
    }

    const result = await response.json()
    onComplete?.(result)
    return result

  } catch (error) {
    const uploadError = error instanceof Error ? error : new Error('Unknown upload error')
    onError?.(uploadError)
    throw uploadError
  }
} 