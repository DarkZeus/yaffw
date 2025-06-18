import { useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Link, Download, FileVideo, AlertCircle, Loader2, Scissors } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'
import { Separator } from './ui/separator'

type UnifiedUploadZoneProps = {
  onFileDrop: (files: File[]) => void
  onUrlDownload: (url: string) => void
  isUploading?: boolean
  isDownloading?: boolean
  uploadProgress?: number
}

export function UnifiedUploadZone({ 
  onFileDrop, 
  onUrlDownload, 
  isUploading = false, 
  isDownloading = false,
  uploadProgress = 0 
}: UnifiedUploadZoneProps) {
  const [url, setUrl] = useState('')
  const [isValidUrl, setIsValidUrl] = useState(true)

  const isProcessing = isUploading || isDownloading

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop: onFileDrop,
    accept: {
      'video/*': ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.m4v', '.3gp']
    },
    multiple: false,
    disabled: isProcessing,
  })

  const validateUrl = (input: string) => {
    if (!input.trim()) {
      setIsValidUrl(true)
      return
    }

    try {
      new URL(input)
      setIsValidUrl(true)
    } catch {
      setIsValidUrl(false)
    }
  }

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value
    setUrl(newUrl)
    validateUrl(newUrl)
  }

  const handleDownload = () => {
    if (url.trim() && isValidUrl && !isProcessing) {
      onUrlDownload(url.trim())
      setUrl('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleDownload()
    }
  }

  return (
    <Card className="w-full">
      <CardHeader className="text-center">
        <CardTitle className="flex items-center justify-center gap-2 text-2xl">
          <Scissors className="h-6 w-6" />
          Yet Another FFmpeg Wrapper
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main Upload Area */}
        <div 
          {...getRootProps()} 
          className={`
            relative border-2 border-dashed rounded-lg p-12 text-center transition-all duration-300 cursor-pointer
            ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}
            ${isDragReject ? 'border-destructive bg-destructive/5' : ''}
            ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'hover:border-muted-foreground hover:bg-muted/5'}
          `}
        >
          <input {...getInputProps()} />
          
          <div className="space-y-4">
            {/* Icon */}
            <div className="flex justify-center">
              <div className={`rounded-full p-6 ${
                isDragReject ? 'bg-destructive/10' : 
                isDragActive ? 'bg-primary/10' : 
                'bg-muted'
              }`}>
                {isDragReject ? (
                  <AlertCircle className="h-12 w-12 text-destructive" />
                ) : isDragActive ? (
                  <FileVideo className="h-12 w-12 text-primary animate-bounce" />
                ) : isProcessing ? (
                  <Loader2 className="h-12 w-12 text-primary animate-spin" />
                ) : (
                  <Upload className="h-12 w-12 text-muted-foreground" />
                )}
              </div>
            </div>

            {/* Text */}
            <div className="space-y-2">
              <h3 className={`text-xl font-semibold ${
                isDragReject ? 'text-destructive' : 
                isDragActive ? 'text-primary' : 
                isProcessing ? 'text-primary' : 
                'text-foreground'
              }`}>
                {isDragReject ? 'Invalid file type' :
                 isDragActive ? 'Drop your video here!' :
                 isProcessing ? (isUploading ? 'Processing file...' : 'Downloading video...') :
                 'Drop your video or click to browse'}
              </h3>
              
              <p className="text-muted-foreground">
                {isDragReject ? 'Please select a valid video file' :
                 isDragActive ? 'Release to upload' :
                 isProcessing ? 'Please wait...' :
                 'Upload from your device'}
              </p>
            </div>

            {/* Supported Formats */}
            {!isProcessing && (
              <div className="flex flex-wrap justify-center gap-2">
                {['MP4', 'AVI', 'MOV', 'MKV', 'WebM'].map((format) => (
                  <Badge key={format} variant="secondary" className="text-xs">
                    {format}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Progress Bar */}
          {isProcessing && uploadProgress > 0 && (
            <div className="absolute bottom-4 left-4 right-4">
              <div className="bg-muted rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-primary h-full transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {uploadProgress}% complete
              </p>
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="relative">
          <Separator />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="bg-background px-3 text-sm text-muted-foreground">
              or download from URL
            </span>
          </div>
        </div>

        {/* URL Input Section */}
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="url"
              placeholder="https://youtube.com/watch?v=... or direct video URL"
              value={url}
              onChange={handleUrlChange}
              onKeyDown={handleKeyDown}
              disabled={isProcessing}
              className={`flex-1 ${!isValidUrl ? 'border-destructive' : ''}`}
            />
            <Button
              onClick={handleDownload}
              disabled={!url.trim() || !isValidUrl || isProcessing}
            >
              {isDownloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Supported Platforms */}
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-2">Supported platforms:</p>
            <div className="flex flex-wrap justify-center gap-1">
              {['YouTube', 'Twitter/X', 'Instagram', 'Twitch Clips', 'TikTok', 'Facebook', 'Vimeo', 'Reddit', 'Direct URLs'].map((platform) => (
                <Badge key={platform} variant="outline" className="text-xs">
                  {platform}
                </Badge>
              ))}
            </div>
          </div>

          {/* URL Validation Error */}
          {!isValidUrl && url.trim() && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please enter a valid URL (e.g., https://youtube.com/watch?v=...)
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
    </Card>
  )
} 