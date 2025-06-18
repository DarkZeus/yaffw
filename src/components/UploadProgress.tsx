import { useDeferredValue, useTransition } from 'react'
import { Card, CardContent } from './ui/card'
import { Progress } from './ui/progress'

type UploadProgressProps = {
  progress: number
  isUploading: boolean
  fileName?: string
}

export function UploadProgress({ progress, isUploading, fileName }: UploadProgressProps) {
  const [isPending] = useTransition()
  const deferredProgress = useDeferredValue(progress)
  
  if (!isUploading) return null

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="flex items-center gap-2">
              Uploading {fileName && `"${fileName}"`}...
              {isPending && <span className="animate-pulse">⏳</span>}
            </span>
            <span className="font-mono">{Math.round(deferredProgress)}%</span>
          </div>
          <Progress 
            value={deferredProgress} 
            className="w-full transition-all duration-300" 
          />
          <div className="text-xs text-gray-500 text-center">
            {deferredProgress < 100 ? 'Processing...' : 'Upload complete!'}
          </div>
        </div>
      </CardContent>
    </Card>
  )
} 