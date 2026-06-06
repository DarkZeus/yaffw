/* @vitest-environment jsdom */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { QueryClient } from "@tanstack/react-query";
import {
	RouterProvider,
	createMemoryHistory,
	createRouter,
} from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "./routeTree.gen";

const prototypeRoutePath = "/editor-next-workbench-prototype";
const sourceDir = dirname(fileURLToPath(import.meta.url));
const prototypeRouteFile = join(
	sourceDir,
	"routes/editor-next-workbench-prototype.tsx",
);
const prototypeComponentFile = join(
	sourceDir,
	"editor-next/editor-workbench-prototype.tsx",
);
const routeTreeFile = join(sourceDir, "routeTree.gen.ts");
const appSidebarFile = join(sourceDir, "components/app-sidebar.tsx");

beforeEach(() => {
	Object.defineProperty(window, "matchMedia", {
		configurable: true,
		value: vi.fn((query: string) => ({
			addEventListener: vi.fn(),
			addListener: vi.fn(),
			dispatchEvent: vi.fn(),
			matches: false,
			media: query,
			onchange: null,
			removeEventListener: vi.fn(),
			removeListener: vi.fn(),
		})),
	});
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("app route contract", () => {
	it("renders editor-next as the canonical root editor inside the collapsed sidebar shell", async () => {
		renderAppAt("/");

		expect(
			await screen.findByLabelText("Editor workbench top bar"),
		).toBeTruthy();
		expect(screen.getByLabelText("Editor workbench rail")).toBeTruthy();

		const sidebar = document.querySelector('[data-slot="sidebar"]');
		expect(sidebar?.getAttribute("data-state")).toBe("collapsed");

		const sidebarInset = document.querySelector('[data-slot="sidebar-inset"]');
		expect(sidebarInset?.className).toContain(
			"md:peer-data-[variant=inset]:!m-0",
		);
		expect(sidebarInset?.className).toContain(
			"md:peer-data-[variant=inset]:!rounded-none",
		);
	});

	it("redirects /editor-next to the canonical root route", async () => {
		const router = renderAppAt("/editor-next");

		await waitFor(() => {
			expect(router.state.location.pathname).toBe("/");
		});
		expect(screen.getByLabelText("Editor workbench top bar")).toBeTruthy();
	});

	it("keeps the legacy editor fallback directly reachable but hidden from navigation", async () => {
		renderAppAt("/legacy-editor");

		expect(
			await screen.findByText("Drop your video or click to browse"),
		).toBeTruthy();
		expect(document.querySelector('a[href="/legacy-editor"]')).toBeNull();
		expect(screen.queryByRole("link", { name: "Legacy Editor" })).toBeNull();
	});

	it("keeps bulk download reachable in the normal app shell", async () => {
		renderAppAt("/bulk-download");

		expect(
			await screen.findByRole("heading", { name: /bulk download/i }),
		).toBeTruthy();

		const sidebarInset = document.querySelector('[data-slot="sidebar-inset"]');
		expect(sidebarInset?.className).not.toContain(
			"md:peer-data-[variant=inset]:!m-0",
		);
	});

	it("shows only canonical product navigation labels", async () => {
		renderAppAt("/");

		expect(await screen.findAllByText("YAFFW")).not.toHaveLength(0);
		expect(screen.getByRole("link", { name: "Editor" })).toBeTruthy();
		expect(screen.getByRole("link", { name: "Bulk download" })).toBeTruthy();
		expect(screen.queryByRole("link", { name: "Editor Next" })).toBeNull();
		expect(screen.queryByRole("link", { name: "Legacy Editor" })).toBeNull();
		expect(screen.queryByText("Yet Another FFMPEG wrapper")).toBeNull();
	});

	it("does not publish the workbench prototype as a route while preserving its reference component", () => {
		const routeTreeSource = readFileSync(routeTreeFile, "utf8");
		const appSidebarSource = readFileSync(appSidebarFile, "utf8");
		const prototypeComponentSource = readFileSync(prototypeComponentFile, "utf8");

		expect(routeTreeSource).not.toContain(prototypeRoutePath);
		expect(existsSync(prototypeRouteFile)).toBe(false);
		expect(appSidebarSource).not.toContain(prototypeRoutePath);
		expect(prototypeComponentSource).toContain(
			"export function EditorWorkbenchPrototype",
		);
	});
});

function renderAppAt(path: string) {
	const queryClient = new QueryClient({
		defaultOptions: {
			mutations: { retry: false },
			queries: { retry: false },
		},
	});
	const router = createRouter({
		context: { queryClient },
		defaultPreload: false,
		history: createMemoryHistory({ initialEntries: [path] }),
		routeTree,
	});

	render(createElement(RouterProvider, { router }));

	return router;
}
