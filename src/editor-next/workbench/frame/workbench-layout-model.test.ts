import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	createDefaultWorkbenchLayout,
	readWorkbenchLayout,
	restoreWorkbenchLayout,
	saveWorkbenchLayout,
	workbenchLayoutStorageKey,
	workbenchTabsets,
} from "./workbench-layout-model";

beforeEach(() => localStorage.clear());

describe("browser-local workbench layouts", () => {
	it("restores panel placement and selection with current panel definitions", () => {
		const model = createDefaultWorkbenchLayout();
		const groups = workbenchTabsets(model.root);
		const inspector = groups.find((group) => group.id === "inspector");
		const viewer = groups.find((group) => group.id === "viewer");
		if (!inspector || !viewer) throw new Error("Missing default dock targets");
		const audio = inspector.tabs.find((tab) => tab.id === "audio");
		if (!audio) throw new Error("Missing Audio panel");
		inspector.tabs = inspector.tabs.filter((tab) => tab !== audio);
		viewer.tabs.push({
			...audio,
			title: "Outdated",
			disableClose: false,
			data: null,
		});
		viewer.selectedId = "audio";
		saveWorkbenchLayout(model);
		const restored = readWorkbenchLayout();
		const restoredViewer = workbenchTabsets(restored.root).find(
			(group) => group.id === "viewer",
		);
		expect(restoredViewer?.selectedId).toBe("audio");
		expect(restoredViewer?.tabs.map((tab) => tab.id)).toEqual([
			"preview",
			"audio",
		]);
		expect(restoredViewer?.tabs[1]).toEqual({
			id: "audio",
			title: "Audio",
			disableClose: true,
			data: null,
		});
	});

	it("recovers missing panels and drops unknown panels from older layouts", () => {
		const restored = restoreWorkbenchLayout({
			version: 1,
			root: {
				type: "tabset",
				id: "old",
				tabs: [
					{ id: "media", data: null },
					{ id: "retired", data: null },
				],
			},
		});
		expect(
			restored &&
				workbenchTabsets(restored.root)
					.flatMap((group) => group.tabs.map((tab) => tab.id))
					.sort(),
		).toEqual([
			"audio",
			"export",
			"media",
			"preview",
			"selection",
			"transport",
		]);
	});

	it.each([
		"invalid json",
		"null",
		'{"version":99}',
		'{"version":1,"root":{}}',
	])("falls back to Cinema for corrupt saved data: %s", (stored) => {
		localStorage.setItem(workbenchLayoutStorageKey, stored);
		expect(readWorkbenchLayout()).toEqual(createDefaultWorkbenchLayout());
	});

	it("keeps editing usable when storage is unavailable", () => {
		const read = vi.spyOn(localStorage, "getItem").mockImplementation(() => {
			throw new Error("Blocked");
		});
		const write = vi.spyOn(localStorage, "setItem").mockImplementation(() => {
			throw new Error("Quota exceeded");
		});
		expect(readWorkbenchLayout()).toEqual(createDefaultWorkbenchLayout());
		expect(() =>
			saveWorkbenchLayout(createDefaultWorkbenchLayout()),
		).not.toThrow();
		read.mockRestore();
		write.mockRestore();
	});
});
