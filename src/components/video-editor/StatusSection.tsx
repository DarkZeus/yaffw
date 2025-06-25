import { Activity, Clock, Volume2 } from 'lucide-react'

import type { ProcessingState, VideoState } from '../../types/video-editor-mediator.types'
import { Badge } from '../ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'

type StatusSectionProps = {
  videoState: Pick<VideoState, 'currentVideo' | 'duration'>
  processingState: Pick<ProcessingState, 'isProcessing' | 'isDeleting'>
}

export const StatusSection = ({ videoState, processingState }: StatusSectionProps) => {
  const { currentVideo, duration } = videoState
  const { isProcessing, isDeleting } = processingState

  const shortcutsActive = !!currentVideo && !isProcessing && !isDeleting

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Shortcuts</span>
          <Badge variant={shortcutsActive ? "default" : "secondary"}>
            {shortcutsActive ? 'Active' : 'Disabled'}
          </Badge>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Duration
          </span>
          <Badge variant="outline" className="font-mono">
            {Math.floor(duration / 60)}:{(Math.floor(duration % 60)).toString().padStart(2, '0')}
          </Badge>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Volume2 className="h-3 w-3" />
              Volume
            </span>
            <Badge variant="outline" className="font-mono">
              Use overlay controls
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  )
} 