/* @vitest-environment jsdom */
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { useEffect, useState } from "react";
import { useParentWorkspace } from "react-resizable-panels";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorWorkbenchLayout } from "./editor-workbench-layout";
import {
	readWorkbenchLayout,
	workbenchTabsets,
} from "./workbench-layout-model";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function LayoutCommands() {
	const workspace = useParentWorkspace();
	return (
		<>
			<button
				type="button"
				onClick={() =>
					workspace?.moveTab("audio", { tabsetId: "viewer", region: "center" })
				}
			>
				Dock Audio with Preview
			</button>
			<button
				type="button"
				onClick={() =>
					workspace?.moveTab("preview", {
						tabsetId: "dock-selection",
						region: "left",
					})
				}
			>
				Move Preview beside Selection
			</button>
		</>
	);
}

function StatefulViewer({ onMount }: { onMount: () => void }) {
	const [value, setValue] = useState("");
	useEffect(() => {
		onMount();
	}, [onMount]);
	return (
		<>
			<video aria-label="Test media">
				<track kind="captions" />
			</video>
			<input
				aria-label="Viewer state"
				value={value}
				onChange={(event) => setValue(event.target.value)}
			/>
		</>
	);
}

function Workbench({ onMount = () => {} }: { onMount?: () => void }) {
	return (
		<EditorWorkbenchLayout
			viewer={<StatefulViewer onMount={onMount} />}
			transport={<LayoutCommands />}
			selection={<p>Selection content</p>}
			inspector={{
				media: <p>Media content</p>,
				audio: <p>Audio content</p>,
				export: <p>Export content</p>,
			}}
		/>
	);
}

function panelContent(id: string): HTMLElement {
	const element = document.querySelector<HTMLElement>(
		`[data-workbench-panel="${id}"]`,
	);
	if (!element) throw new Error(`Missing workbench panel: ${id}`);
	return element;
}

describe("customizable workbench layout", () => {
	it("arms panel hover feedback only while Alt is held and clears it on focus loss", () => {
		render(<Workbench />);
		const content = panelContent("preview");
		expect(content.hasAttribute("data-layout-drag-ready")).toBe(false);
		fireEvent.keyDown(window, { key: "Alt", altKey: true });
		expect(content.hasAttribute("data-layout-drag-ready")).toBe(true);
		fireEvent.keyUp(window, { key: "Alt", altKey: false });
		expect(content.hasAttribute("data-layout-drag-ready")).toBe(false);
		fireEvent.keyDown(window, { key: "Alt", altKey: true });
		fireEvent.blur(window);
		expect(content.hasAttribute("data-layout-drag-ready")).toBe(false);
		fireEvent.keyDown(window, { key: "Alt", altKey: true });
		fireEvent(document, new Event("visibilitychange"));
		expect(content.hasAttribute("data-layout-drag-ready")).toBe(false);
	});

	it("reconciles Alt held or released outside the window when the pointer returns", () => {
		vi.stubGlobal("PointerEvent", MouseEvent);
		try {
			render(<Workbench />);
			const content = panelContent("preview");
			fireEvent.pointerMove(content, { altKey: true });
			expect(content.hasAttribute("data-layout-drag-ready")).toBe(true);
			fireEvent.pointerMove(content, { altKey: false });
			expect(content.hasAttribute("data-layout-drag-ready")).toBe(false);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("Alt-drags content through Workspace without activating the underlying control", async () => {
		vi.stubGlobal("PointerEvent", MouseEvent);
		const originalHitTest = document.elementFromPoint;
		try {
			render(<Workbench />);
			const target = panelContent("selection");
			document.elementFromPoint = () => target;
			const control = screen.getByRole("button", {
				name: "Dock Audio with Preview",
			});
			fireEvent.pointerDown(control, {
				altKey: true,
				button: 0,
				clientX: 10,
				clientY: 10,
			});
			fireEvent.pointerMove(document, { clientX: 300, clientY: 300 });
			fireEvent.pointerUp(document, { clientX: 300, clientY: 300 });
			fireEvent.click(control, { altKey: true });
			await waitFor(() =>
				expect(
					workbenchTabsets(readWorkbenchLayout().root)
						.find((group) => group.id === "dock-selection")
						?.tabs.map((tab) => tab.id),
				).toEqual(["selection", "transport"]),
			);
			expect(
				workbenchTabsets(readWorkbenchLayout().root)
					.find((group) => group.id === "inspector")
					?.tabs.map((tab) => tab.id),
			).toEqual(["media", "audio", "export"]);
		} finally {
			if (originalHitTest) document.elementFromPoint = originalHitTest;
			else Reflect.deleteProperty(document, "elementFromPoint");
			vi.unstubAllGlobals();
		}
	});

	it("leaves placement unchanged for normal pointer gestures and canceled Alt-drags", () => {
		vi.stubGlobal("PointerEvent", MouseEvent);
		const originalHitTest = document.elementFromPoint;
		try {
			render(<Workbench />);
			document.elementFromPoint = () => panelContent("selection");
			const before = readWorkbenchLayout();
			const content = panelContent("preview");
			fireEvent.pointerDown(content, { button: 0, clientX: 10, clientY: 10 });
			fireEvent.pointerMove(document, { clientX: 300, clientY: 300 });
			fireEvent.pointerUp(document, { clientX: 300, clientY: 300 });
			expect(readWorkbenchLayout()).toEqual(before);
			fireEvent.pointerDown(content, {
				altKey: true,
				button: 0,
				clientX: 10,
				clientY: 10,
			});
			fireEvent.pointerMove(document, { clientX: 300, clientY: 300 });
			fireEvent.keyDown(document, { key: "Escape" });
			fireEvent.pointerUp(document, { clientX: 300, clientY: 300 });
			// Complete the browser gesture, including Workspace's post-drag click suppression.
			fireEvent.click(content);
			expect(readWorkbenchLayout()).toEqual(before);
		} finally {
			if (originalHitTest) document.elementFromPoint = originalHitTest;
			else Reflect.deleteProperty(document, "elementFromPoint");
			vi.unstubAllGlobals();
		}
	});

	it("marks the tab insertion position throughout a content drag and clears it after docking", async () => {
		vi.stubGlobal("PointerEvent", MouseEvent);
		const originalHitTest = document.elementFromPoint;
		try {
			render(<Workbench />);
			const tabs = ["Media", "Audio", "Export"].map((name, index) => {
				const tab = screen.getByRole("tab", { name });
				vi.spyOn(tab, "getBoundingClientRect").mockReturnValue(
					new DOMRect(index * 60, 0, 40, 30),
				);
				return tab;
			});
			const content = panelContent("transport");
			document.elementFromPoint = () => tabs[0];
			fireEvent.pointerDown(content, {
				altKey: true,
				button: 0,
				clientX: 10,
				clientY: 100,
			});
			fireEvent.pointerMove(document, { clientX: 10, clientY: 15 });
			expect(tabs[0].hasAttribute("data-drop-before")).toBe(true);
			document.elementFromPoint = () => tabs[1];
			fireEvent.pointerMove(document, { clientX: 70, clientY: 15 });
			expect(tabs[0].hasAttribute("data-drop-before")).toBe(false);
			expect(tabs[1].hasAttribute("data-drop-before")).toBe(true);
			document.elementFromPoint = () => tabs[2];
			fireEvent.pointerMove(document, { clientX: 200, clientY: 15 });
			expect(tabs[1].hasAttribute("data-drop-before")).toBe(false);
			expect(tabs[2].hasAttribute("data-drop-after")).toBe(true);
			fireEvent.pointerUp(document, { clientX: 200, clientY: 15 });
			fireEvent.click(content);
			await waitFor(() =>
				expect(
					workbenchTabsets(readWorkbenchLayout().root)
						.find((group) => group.id === "inspector")
						?.tabs.map((tab) => tab.id),
				).toEqual(["media", "audio", "export", "transport"]),
			);
			expect(
				document.querySelector("[data-drop-before], [data-drop-after]"),
			).toBeNull();
		} finally {
			if (originalHitTest) document.elementFromPoint = originalHitTest;
			else Reflect.deleteProperty(document, "elementFromPoint");
			vi.unstubAllGlobals();
		}
	});

	it("offers maximize and restore from the panel context menu", async () => {
		render(<Workbench />);
		fireEvent.contextMenu(panelContent("preview"));
		fireEvent.click(
			screen.getByRole("menuitem", { name: "Maximize panel group" }),
		);
		await waitFor(() =>
			expect(readWorkbenchLayout().maximizedTabsetId).toBe("viewer"),
		);
		fireEvent.contextMenu(panelContent("preview"));
		fireEvent.click(
			screen.getByRole("menuitem", { name: "Restore panel group" }),
		);
		await waitFor(() =>
			expect(readWorkbenchLayout().maximizedTabsetId).toBeUndefined(),
		);
	});

	it("supports keyboard activation and Escape dismissal of panel actions", async () => {
		vi.stubGlobal("PointerEvent", MouseEvent);
		try {
			render(<Workbench />);
			fireEvent.contextMenu(panelContent("preview"));
			fireEvent.keyDown(
				screen.getByRole("menuitem", { name: "Maximize panel group" }),
				{ key: "Enter" },
			);
			await waitFor(() =>
				expect(readWorkbenchLayout().maximizedTabsetId).toBe("viewer"),
			);
			fireEvent.contextMenu(panelContent("preview"));
			const menu = screen.getByRole("menu", { name: "Preview layout" });
			fireEvent.keyDown(menu, { key: "Escape" });
			await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
			expect(readWorkbenchLayout().maximizedTabsetId).toBe("viewer");
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("preserves the native context menu in editable panel content", () => {
		render(<Workbench />);
		expect(fireEvent.contextMenu(screen.getByLabelText("Viewer state"))).toBe(
			true,
		);
		expect(screen.queryByRole("menu")).toBeNull();
	});

	it("restores the selected inspector tab when the workbench opens again", async () => {
		const view = render(<Workbench />);
		fireEvent.click(screen.getByRole("tab", { name: "Export" }));
		await waitFor(() =>
			expect(
				workbenchTabsets(readWorkbenchLayout().root).find(
					(group) => group.id === "inspector",
				)?.selectedId,
			).toBe("export"),
		);
		view.unmount();
		render(<Workbench />);
		expect(
			screen.getByRole("tab", { name: "Export", selected: true }),
		).toBeTruthy();
	});

	it("docks and moves panels, preserves media and React state, and resets to Cinema", async () => {
		const onMount = vi.fn();
		render(<Workbench onMount={onMount} />);
		const media = screen.getByLabelText("Test media");
		fireEvent.change(screen.getByLabelText("Viewer state"), {
			target: { value: "keep me" },
		});
		fireEvent.click(
			screen.getByRole("button", { name: "Dock Audio with Preview" }),
		);
		await waitFor(() =>
			expect(
				workbenchTabsets(readWorkbenchLayout().root)
					.find((group) => group.id === "viewer")
					?.tabs.map((tab) => tab.id),
			).toEqual(["preview", "audio"]),
		);
		fireEvent.click(
			screen.getByRole("button", { name: "Move Preview beside Selection" }),
		);
		await waitFor(() =>
			expect(screen.getByRole("tabpanel", { name: "Preview" })).toBeTruthy(),
		);
		expect(screen.getByLabelText("Test media")).toBe(media);
		expect(
			(screen.getByLabelText("Viewer state") as HTMLInputElement).value,
		).toBe("keep me");
		expect(onMount).toHaveBeenCalledTimes(1);
		fireEvent.contextMenu(panelContent("preview"));
		fireEvent.click(
			screen.getByRole("menuitem", { name: "Reset workbench layout" }),
		);
		await waitFor(() =>
			expect(
				workbenchTabsets(readWorkbenchLayout().root)
					.find((group) => group.id === "inspector")
					?.tabs.map((tab) => tab.id),
			).toEqual(["media", "audio", "export"]),
		);
		expect(screen.getByLabelText("Test media")).toBe(media);
		expect(onMount).toHaveBeenCalledTimes(1);
	});

	it("restores the desktop arrangement after a narrow viewport without remounting media", async () => {
		let narrow = false;
		const listeners = new Set<() => void>();
		vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
			media: query,
			get matches() {
				return narrow;
			},
			onchange: null,
			addEventListener: (
				_event: string,
				listener: EventListenerOrEventListenerObject,
			) => listeners.add(listener as () => void),
			removeEventListener: (
				_event: string,
				listener: EventListenerOrEventListenerObject,
			) => listeners.delete(listener as () => void),
			addListener() {},
			removeListener() {},
			dispatchEvent: () => true,
		}));
		const onMount = vi.fn();
		render(<Workbench onMount={onMount} />);
		const media = screen.getByLabelText("Test media");
		fireEvent.click(
			screen.getByRole("button", { name: "Dock Audio with Preview" }),
		);
		await waitFor(() =>
			expect(
				workbenchTabsets(readWorkbenchLayout().root).find(
					(group) => group.id === "viewer",
				)?.tabs,
			).toHaveLength(2),
		);
		const desktop = readWorkbenchLayout();
		act(() => {
			narrow = true;
			for (const listener of listeners) listener();
		});
		await waitFor(() =>
			expect(
				document.querySelector('[data-tabset-id="narrow-preview"]'),
			).toBeTruthy(),
		);
		expect(readWorkbenchLayout()).toEqual(desktop);
		expect(screen.getByLabelText("Test media")).toBe(media);
		fireEvent.contextMenu(panelContent("preview"));
		expect(screen.queryByRole("menu")).toBeNull();
		fireEvent.keyDown(window, { key: "Alt", altKey: true });
		expect(document.querySelector("[data-layout-drag-ready]")).toBeNull();
		fireEvent.keyUp(window, { key: "Alt", altKey: false });
		fireEvent.click(screen.getByRole("tab", { name: "Export" }));
		const inspector = workbenchTabsets(desktop.root).find(
			(group) => group.id === "inspector",
		);
		if (!inspector) throw new Error("Missing inspector");
		inspector.selectedId = "export";
		await waitFor(() => expect(readWorkbenchLayout()).toEqual(desktop));
		act(() => {
			narrow = false;
			for (const listener of listeners) listener();
		});
		await waitFor(() =>
			expect(document.querySelector('[data-tabset-id="viewer"]')).toBeTruthy(),
		);
		expect(readWorkbenchLayout()).toEqual(desktop);
		expect(screen.getByLabelText("Test media")).toBe(media);
		expect(onMount).toHaveBeenCalledTimes(1);
	});
});
