/* @vitest-environment jsdom */

import {
	RouterProvider,
	createMemoryHistory,
	createRouter,
} from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "./routeTree.gen";
const routeRenderTimeout = { timeout: 5_000 };

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
	it("renders the canonical editor at the root route", async () => {
		renderAppAt("/");

		expect(
			await screen.findByLabelText(
				"Editor workbench top bar",
				undefined,
				routeRenderTimeout,
			),
		).toBeTruthy();
	});

	it("redirects /editor-next to the canonical root route", async () => {
		const router = renderAppAt("/editor-next");

		await waitFor(() => {
			expect(router.state.location.pathname).toBe("/");
		});
		expect(
			await screen.findByLabelText(
				"Editor workbench top bar",
				undefined,
				routeRenderTimeout,
			),
		).toBeTruthy();
	});
});

function renderAppAt(path: string) {
	const router = createRouter({
		defaultPreload: false,
		history: createMemoryHistory({ initialEntries: [path] }),
		routeTree,
	});

	render(createElement(RouterProvider, { router }));

	return router;
}
