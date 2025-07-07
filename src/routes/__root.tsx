import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar.tsx'
import { Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import { ThemeProvider } from 'next-themes'

import { Toaster } from '../components/ui/sonner'

import { AppSidebar } from '@/components/app-sidebar.tsx'
import type { QueryClient } from '@tanstack/react-query'

type MyRouterContext = {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: () => (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <SidebarProvider defaultOpen={false}>
        <AppSidebar />
        <SidebarInset>
          <main className="flex-1 overflow-y-auto px-4">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
      <Toaster expand={true} />
      {/* <TanStackRouterDevtools /> */}
      {/* <TanStackQueryLayout /> */}
    </ThemeProvider>
  )
})
