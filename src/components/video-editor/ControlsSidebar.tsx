import { BarChart3, Sliders } from 'lucide-react'

import type { ExportOperations, FileOperations, ProcessingState, TrimOperations, TrimState, VideoEditorState, VideoOperations, VideoState } from '../../types/video-editor-mediator.types'
import { VideoAnalytics } from '../VideoAnalytics'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { ExportControls } from './ExportControls'
import { FileManagementSection } from './FileManagementSection'
import { PlaybackControls } from './PlaybackControls'
import { StatusSection } from './StatusSection'
import { TrimControls } from './TrimControls'

type ControlsSidebarProps = {
  state: VideoEditorState
  videoOps: VideoOperations
  trimOps: TrimOperations
  exportOps: ExportOperations
  fileOps: FileOperations
}

export const ControlsSidebar = ({ state, videoOps, trimOps, exportOps, fileOps }: ControlsSidebarProps) => {
  const { currentVideo, duration, videoMetadata } = state

  return (
    <div className="h-full border-r bg-card">
      <Tabs defaultValue="controls" className="h-full flex flex-col">
        <TabsList className="grid w-full grid-cols-2 rounded-none border-b">
          <TabsTrigger value="controls" className="flex items-center gap-2">
            <Sliders className="h-4 w-4" />
            Controls
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto">
          <TabsContent value="controls" className="p-6 space-y-6 m-0">
            <PlaybackControls 
              videoState={{
                isPlaying: state.isPlaying,
                currentTime: state.currentTime,
                duration: state.duration
              }}
              videoOps={videoOps}
            />

            <TrimControls 
              trimState={{
                trimStart: state.trimStart,
                trimEnd: state.trimEnd
              }}
              trimOps={trimOps}
            />

            <ExportControls 
              processingState={{
                isProcessing: state.isProcessing,
                isUploading: state.isUploading,
                isCommittingToServer: state.isCommittingToServer
              }}
              hasCurrentVideo={!!currentVideo}
              exportOps={exportOps}
            />

            <StatusSection 
              videoState={{
                currentVideo: state.currentVideo,
                duration: state.duration
              }}
              processingState={{
                isProcessing: state.isProcessing,
                isDeleting: state.isDeleting
              }}
            />

            <FileManagementSection 
              processingState={{
                isDeleting: state.isDeleting,
                isProcessing: state.isProcessing,
                isUploading: state.isUploading
              }}
              fileOps={fileOps}
            />
          </TabsContent>

          <TabsContent value="analytics" className="p-6 m-0">
            {currentVideo && (
              <VideoAnalytics 
                file={currentVideo.file}
                duration={duration}
                videoMetadata={videoMetadata}
              />
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
} 