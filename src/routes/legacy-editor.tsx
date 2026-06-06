import { createFileRoute } from '@tanstack/react-router'

import { VideoEditorLayout } from '@/components/VideoEditorLayout'

export const Route = createFileRoute('/legacy-editor')({
  component: VideoEditorLayout,
})
