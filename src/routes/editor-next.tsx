import { createFileRoute } from '@tanstack/react-router'

import { EditorNextRoute } from '@/editor-next/EditorNextRoute'

export const Route = createFileRoute('/editor-next')({
  component: EditorNextRoute,
})
