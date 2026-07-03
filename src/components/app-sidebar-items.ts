import { Download, type LucideIcon, Video } from "lucide-react";

export type SidebarEnvironment = {
	hostname?: string | null;
};

export type AppSidebarItem = {
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

function isLocalBulkDownloadEnvironment(
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

function readSidebarEnvironment(): SidebarEnvironment {
	if (typeof window === "undefined") {
		return {};
	}

	return window.location;
}
