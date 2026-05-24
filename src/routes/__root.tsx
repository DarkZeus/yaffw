import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar.tsx'
import { Outlet, createRootRouteWithContext, useLocation } from '@tanstack/react-router'
import { ThemeProvider } from 'next-themes'

import { Toaster } from '../components/ui/sonner'

import { AppSidebar } from '@/components/app-sidebar.tsx'
import { CookieProvider } from '@/providers/CookieProvider'
import type { QueryClient } from '@tanstack/react-query'

type MyRouterContext = {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: RootComponent,
})

function RootComponent() {
  const pathname = useLocation({
    select: (location) => location.pathname,
  })
  const editorWorkbenchRoute = pathname.startsWith('/editor-next')

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <CookieProvider>
        {editorWorkbenchRoute ? (
          <Outlet />
        ) : (
          <SidebarProvider defaultOpen={false}>
            <AppSidebar />
            <SidebarInset>
              <Outlet />
            </SidebarInset>
          </SidebarProvider>
        )}
        <Toaster expand={true} />
        {/* <TanStackRouterDevtools /> */}
        {/* <TanStackQueryLayout /> */}
      </CookieProvider>
    </ThemeProvider>
  )
}
