import { CheckCircle, Loader2, Upload } from 'lucide-react'
import { Progress } from './progress'

type ProgressToastProps = {
  progress: number
  message: string
  isComplete?: boolean
  speed?: number // MB/s
}

export const ProgressToast = ({ progress, message, isComplete = false, speed }: ProgressToastProps) => {
  return (
    <div className="flex flex-col gap-3 min-w-[300px]">
      {/* Header with icon and message */}
      <div className="flex items-center gap-2">
        {isComplete ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : (
          <Upload className="h-4 w-4 text-blue-500" />
        )}
        <span className="font-medium text-sm">{message}</span>
      </div>
      
      {/* Progress bar */}
      <Progress value={Math.min(100, Math.max(0, progress))} className="w-full" />
      
      {/* Progress details */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{Math.round(progress)}%</span>
        {speed && !isComplete && (
          <div className="flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>{speed.toFixed(1)} MB/s</span>
          </div>
        )}
        {isComplete && (
          <span className="text-green-600 font-medium">Complete!</span>
        )}
      </div>
    </div>
  )
} 