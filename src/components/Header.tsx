import { Link } from '@tanstack/react-router'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { Separator } from './ui/separator'

export default function Header() {
  return (
    <Card className="rounded-none border-x-0 border-t-0">
      <div className="p-4 flex items-center justify-between">
        <nav className="flex items-center gap-4">
          <Button variant="ghost" asChild>
            <Link to="/" className="font-semibold">
              Home
            </Link>
          </Button>
          
          <Separator orientation="vertical" className="h-6" />
          
          <Button variant="ghost" asChild>
            <Link to="/demo/tanstack-query" className="font-semibold">
              TanStack Query
            </Link>
          </Button>
        </nav>
      </div>
    </Card>
  )
}
