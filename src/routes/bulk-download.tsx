import { createFileRoute } from '@tanstack/react-router'
import { BulkDownloadComponent } from '../components/bulk-download/BulkDownloadComponent'

export const Route = createFileRoute('/bulk-download')({
  component: RouteComponent,
})

function RouteComponent() {
  return <BulkDownloadComponent />
}
