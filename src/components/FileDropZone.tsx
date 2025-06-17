import { AlertCircle, FileVideo, Upload } from 'lucide-react'
import { useState } from 'react'
import { useDropzone } from 'react-dropzone'

interface FileDropZoneProps {
  onDrop: (files: File[]) => void
  isUploading?: boolean
}

export function FileDropZone({ onDrop, isUploading }: FileDropZoneProps) {
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

  const getDropZoneStyles = () => {
    if (isUploading) return 'border-gray-300 bg-gray-50 cursor-not-allowed'
    if (isDragReject) return 'border-red-400 bg-red-50 animate-pulse'
    if (isDragActive) return 'border-blue-500 bg-blue-50 scale-[1.02] shadow-lg'
    return 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
  }

  return (
    <div
      {...getRootProps()}
      className={`
        relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer 
        transition-all duration-300 ease-out group
        ${getDropZoneStyles()}
      `}
    >
      <input {...getInputProps()} />
      
      {/* Animated Background Pattern */}
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <div className="w-full h-full bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 rounded-xl" />
      </div>
      
      {/* Main Content */}
      <div className="relative z-10">
        {/* Icon with Animation */}
        <div className="relative mb-6">
          <div className={`
            mx-auto w-20 h-20 rounded-full flex items-center justify-center
            transition-all duration-300
            ${isDragActive ? 'bg-blue-100 scale-110' : 'bg-gray-100 group-hover:bg-gray-200'}
          `}>
            {isDragReject ? (
              <AlertCircle className="h-10 w-10 text-red-500" />
            ) : isDragActive ? (
              <FileVideo className="h-10 w-10 text-blue-600 animate-bounce" />
            ) : (
              <Upload className={`h-10 w-10 text-gray-500 transition-transform duration-300 ${
                !isUploading ? 'group-hover:scale-110 group-hover:text-gray-700' : ''
              }`} />
            )}
          </div>
          
          {/* Pulse Ring Animation */}
          {isDragActive && (
            <div className="absolute inset-0 rounded-full border-2 border-blue-400 animate-ping" />
          )}
        </div>

        {/* Text Content */}
        <div className="space-y-2">
          <h3 className={`text-xl font-semibold transition-colors duration-300 ${
            isDragReject ? 'text-red-600' : 
            isDragActive ? 'text-blue-600' : 
            'text-gray-700'
          }`}>
            {isDragReject ? 'Invalid file type' :
             isDragActive ? 'Drop your video here!' :
             isUploading ? 'Upload in progress...' :
             'Drop your video to get started'}
          </h3>
          
          <p className="text-gray-500">
            {isDragReject ? 'Please select a valid video file' :
             isDragActive ? 'Release to upload' :
             isUploading ? 'Please wait while we process your file' :
             'or click to browse files'}
          </p>
          
          {/* Supported Formats */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-400 mb-2">Supported formats:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {['MP4', 'AVI', 'MOV', 'MKV', 'WebM'].map((format) => (
                <span 
                  key={format}
                  className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs font-mono"
                >
                  {format}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {/* Loading Overlay */}
      {isUploading && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-xl flex items-center justify-center">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-600 font-medium">Processing...</span>
          </div>
        </div>
      )}
    </div>
  )
} 