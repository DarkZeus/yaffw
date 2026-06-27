import {
	ChevronLeft,
	ChevronRight,
	Download,
	type LucideIcon,
	Video,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
	useSidebar,
} from "@/components/ui/sidebar";

type SidebarEnvironment = {
	hostname?: string | null;
};

type AppSidebarItem = {
	icon: LucideIcon;
	requiresLocalEnvironment?: boolean;
	title: string;
	url: string;
};

const localBulkDownloadHostnames = new Set([
	"localhost",
	"127.0.0.1",
	"0.0.0.0",
	"::1",
]);

const items: AppSidebarItem[] = [
	{
		title: "Editor",
		url: "/",
		icon: Video,
	},
	{
		title: "Bulk download",
		url: "/bulk-download",
		icon: Download,
		requiresLocalEnvironment: true,
	},
];

export function isLocalBulkDownloadEnvironment(
	environment: SidebarEnvironment = readSidebarEnvironment(),
) {
	return localBulkDownloadHostnames.has(environment.hostname ?? "");
}

export function getAppSidebarItems(
	environment: SidebarEnvironment = readSidebarEnvironment(),
) {
	return items.filter(
		(item) =>
			!item.requiresLocalEnvironment ||
			isLocalBulkDownloadEnvironment(environment),
	);
}

export function AppSidebar({
	environment,
}: {
	environment?: SidebarEnvironment;
}) {
	const { state, toggleSidebar } = useSidebar();
	const sidebarItems = getAppSidebarItems(environment);
	const canOpenSidebar = sidebarItems.length > 1;

	if (!canOpenSidebar) {
		return null;
	}

	return (
		<Sidebar variant="inset" collapsible="offcanvas">
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>YAFFW</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{sidebarItems.map((item) => (
								<SidebarMenuItem key={item.title}>
									<SidebarMenuButton asChild>
										<a href={item.url}>
											<item.icon />
											<span>{item.title}</span>
										</a>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
			<SidebarRail />

			<Button
				variant="secondary"
				size="sm"
				onClick={toggleSidebar}
				className={`absolute top-1/2 z-20 h-8 w-6 -translate-y-1/2 rounded-r-md rounded-l-none border-l-0 bg-background/80 backdrop-blur-sm shadow-md hover:bg-background/90 transition-all duration-200 cursor-pointer ${
					state === "expanded" ? "-right-3" : "-right-5"
				}`}
				aria-label="Toggle Sidebar"
			>
				{state === "expanded" ? (
					<ChevronLeft className="h-3 w-3" />
				) : (
					<ChevronRight className="h-3 w-3" />
				)}
			</Button>
		</Sidebar>
	);
}

function readSidebarEnvironment(): SidebarEnvironment {
	if (typeof window === "undefined") {
		return {};
	}

	return window.location;
}
