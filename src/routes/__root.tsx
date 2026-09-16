import { Outlet, createRootRoute } from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/sonner";

export const Route = createRootRoute({
	component: RootComponent,
});

function RootComponent() {
	return (
		<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
			<main className="relative flex min-h-svh w-full flex-col overflow-hidden bg-transparent">
				<Outlet />
			</main>
			<Toaster expand={true} />
		</ThemeProvider>
	);
}
