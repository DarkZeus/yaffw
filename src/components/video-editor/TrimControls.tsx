import { RotateCcw, Scissors } from 'lucide-react'

import type { TrimOperations, TrimState } from '../../types/video-editor-mediator.types'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'

type TrimControlsProps = {
  trimState: TrimState
  trimOps: TrimOperations
}

export const TrimControls = ({ trimState, trimOps }: TrimControlsProps) => {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Scissors className="h-4 w-4" />
          Trim Controls
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={trimOps.handleSetTrimStart} className="h-12">
                Set Start
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Set trim start (J)</p></TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={trimOps.handleSetTrimEnd} className="h-12">
                Set End
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Set trim end (K)</p></TooltipContent>
          </Tooltip>
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={trimOps.handleJumpToTrimStart} variant="outline" size="sm">
                Jump to Start
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Jump to trim start (I)</p></TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={trimOps.handleJumpToTrimEnd} variant="outline" size="sm">
                Jump to End
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Jump to trim end (O)</p></TooltipContent>
          </Tooltip>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button onClick={trimOps.handleResetTrim} variant="outline" className="w-full">
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset Trim
            </Button>
          </TooltipTrigger>
          <TooltipContent><p>Reset trim (R)</p></TooltipContent>
        </Tooltip>
      </CardContent>
    </Card>
  )
} 