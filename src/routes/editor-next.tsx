import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/editor-next')({
  beforeLoad: () => {
    throw redirect({ replace: true, to: '/' })
  },
})
