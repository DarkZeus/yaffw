import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar.tsx";
import {
	Outlet,
	createRootRouteWithContext,
	useLocation,
} from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";

import { Toaster } from "../components/ui/sonner";

import { AppSidebar } from "@/components/app-sidebar.tsx";
import { CookieProvider } from "@/providers/CookieProvider";
import type { QueryClient } from "@tanstack/react-query";

type MyRouterContext = {
	queryClient: QueryClient;
};

export const Route = createRootRouteWithContext<MyRouterContext>()({
	component: RootComponent,
});

function RootComponent() {
	const pathname = useLocation({
		select: (location) => location.pathname,
	});
	const editorWorkbenchRoute =
		pathname === "/" || pathname.startsWith("/editor-next");
	const sidebarInsetClassName = editorWorkbenchRoute
		? "min-h-svh overflow-hidden bg-transparent md:peer-data-[variant=inset]:!m-0 md:peer-data-[variant=inset]:!rounded-none md:peer-data-[variant=inset]:!shadow-none md:peer-data-[variant=inset]:peer-data-[state=collapsed]:!ml-0"
		: undefined;

	return (
		<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
			<CookieProvider>
				<SidebarProvider defaultOpen={false}>
					<AppSidebar />
					<SidebarInset className={sidebarInsetClassName}>
						<Outlet />
					</SidebarInset>
				</SidebarProvider>
				<Toaster expand={true} />
				{/* <TanStackRouterDevtools /> */}
				{/* <TanStackQueryLayout /> */}
			</CookieProvider>
		</ThemeProvider>
	);
}
