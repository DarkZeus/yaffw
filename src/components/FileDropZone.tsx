import { AlertCircle, FileVideo, Upload } from 'lucide-react'
import { useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Card, CardContent } from './ui/card'
import { Badge } from './ui/badge'
import { Alert, AlertDescription } from './ui/alert'

type FileDropZoneProps = {
  onDrop: (files: File[]) => void
  isUploading?: boolean
  showCard?: boolean
}

export function FileDropZone({ onDrop, isUploading, showCard = true }: FileDropZoneProps) {
  const [dragDepth, setDragDepth] = useState(0)
  
  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.m4v', '.3gp']
    },
    multiple: false,
    disabled: isUploading,
    onDragEnter: () => setDragDepth(prev => prev + 1),
    onDragLeave: () => setDragDepth(prev => prev - 1),
  })

  const content = (
    <div {...getRootProps()} className="p-12 text-center space-y-6 cursor-pointer transition-all duration-300">
        <input {...getInputProps()} />
        
        {/* Icon */}
        <div className="flex justify-center">
          <div className={`rounded-full p-6 transition-all duration-300 ${isDragActive ? 'bg-primary/10 scale-110' : 'bg-muted'}`}>
            {isDragReject ? (
              <AlertCircle className="h-12 w-12 text-destructive" />
            ) : isDragActive ? (
              <FileVideo className="h-12 w-12 text-primary animate-bounce" />
            ) : (
              <Upload className={`h-12 w-12 text-muted-foreground transition-transform duration-300 ${!isUploading ? 'group-hover:scale-110' : ''}`} />
            )}
          </div>
        </div>

        {/* Text Content */}
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className={`text-xl font-semibold transition-colors duration-300 ${
              isDragReject ? 'text-destructive' : 
              isDragActive ? 'text-primary' : 
              'text-foreground'
            }`}>
              {isDragReject ? 'Invalid file type' :
               isDragActive ? 'Drop your video here!' :
               isUploading ? 'Analyzing video...' :
               'Drop your video to get started'}
            </h3>
            
            <p className="text-muted-foreground">
              {isDragReject ? 'Please select a valid video file' :
               isDragActive ? 'Release to load' :
               isUploading ? 'Please wait while we analyze your file' :
               'or click to browse files'}
            </p>
          </div>
          
          {/* Supported Formats */}
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Supported formats:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {['MP4', 'AVI', 'MOV', 'MKV', 'WebM'].map((format) => (
                <Badge key={format} variant="secondary" className="font-mono">
                  {format}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {/* Loading State */}
        {isUploading && (
          <Alert>
            <Upload className="h-4 w-4 animate-spin" />
            <AlertDescription>
              Analyzing your video file locally...
            </AlertDescription>
          </Alert>
        )}
      </div>
  )

  if (showCard) {
    return (
      <Card className={`transition-all duration-300 ${isDragActive ? 'border-primary shadow-lg' : ''} ${isDragReject ? 'border-destructive' : ''} ${isUploading ? 'opacity-50 cursor-not-allowed' : 'hover:border-muted-foreground'}`}>
        <CardContent className="p-0">
          {content}
        </CardContent>
      </Card>
    )
  }

  return content
} 