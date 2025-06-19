import { Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { ThemeProvider } from 'next-themes'

import Header from '../components/Header'
import { Toaster } from '../components/ui/sonner'

import TanStackQueryLayout from '../integrations/tanstack-query/layout.tsx'

import type { QueryClient } from '@tanstack/react-query'

type MyRouterContext = {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: () => (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <Outlet />
      <Toaster />
      {/* <TanStackRouterDevtools /> */}

      {/* <TanStackQueryLayout /> */}
    </ThemeProvider>
  ),
})
