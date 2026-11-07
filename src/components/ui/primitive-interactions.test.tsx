/* @vitest-environment jsdom */

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Badge } from "./badge";
import { Button } from "./button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "./dialog";
import { Progress } from "./progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

beforeEach(() => {
	// jsdom has no PointerEvent; Base UI dispatches one for keyboard activation.
	vi.stubGlobal("PointerEvent", MouseEvent);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("shared UI interaction contracts", () => {
	it("keeps disabled buttons inactive and supports keyboard activation of custom elements", () => {
		const disabledAction = vi.fn();
		const customAction = vi.fn();
		render(
			<>
				<Button disabled onClick={disabledAction}>
					Unavailable
				</Button>
				<Button
					nativeButton={false}
					render={<div />}
					onClick={(event) => {
						event.preventDefault();
						customAction();
					}}
				>
					Help
				</Button>
			</>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Unavailable" }));
		expect(disabledAction).not.toHaveBeenCalled();
		const customButton = screen.getByRole("button", { name: "Help" });
		fireEvent.keyDown(customButton, { key: "Enter" });
		expect(customAction).toHaveBeenCalledTimes(1);
	});

	it("merges badge rendering props and forwards its ref without adding a wrapper", () => {
		const ref = createRef<HTMLSpanElement>();
		const onClick = vi.fn();
		render(
			<Badge ref={ref} render={<a href="#source">Source</a>} onClick={onClick}>
				Source
			</Badge>,
		);
		const link = screen.getByRole("link", { name: "Source" });
		expect(ref.current).toBe(link);
		expect(link.getAttribute("data-slot")).toBe("badge");
		fireEvent.click(link);
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	it("keeps progress fill and accessible values in sync, including indeterminate progress", () => {
		const view = render(
			<Progress aria-label="Export progress" value={50} max={200} />,
		);
		const progress = screen.getByRole("progressbar", {
			name: "Export progress",
		});
		expect(progress.getAttribute("aria-valuenow")).toBe("50");
		expect(progress.getAttribute("aria-valuemax")).toBe("200");
		expect(
			progress.querySelector<HTMLElement>('[data-slot="progress-indicator"]')
				?.style.width,
		).toBe("25%");
		view.rerender(<Progress aria-label="Export progress" value={null} />);
		expect(progress.hasAttribute("aria-valuenow")).toBe(false);
		expect(progress.hasAttribute("data-indeterminate")).toBe(true);
		expect(
			progress.querySelector<HTMLElement>('[data-slot="progress-indicator"]')
				?.style.width,
		).toBe("");
	});

	it("preserves automatic keyboard tab activation without activating disabled categories", async () => {
		render(
			<Tabs defaultValue="general">
				<TabsList aria-label="Categories">
					<TabsTrigger value="general">General</TabsTrigger>
					<TabsTrigger value="video">Video</TabsTrigger>
					<TabsTrigger value="future" disabled>
						Future
					</TabsTrigger>
					<TabsTrigger value="audio">Audio</TabsTrigger>
				</TabsList>
				<TabsContent value="general">General settings</TabsContent>
				<TabsContent value="video">Video settings</TabsContent>
				<TabsContent value="audio">Audio settings</TabsContent>
			</Tabs>,
		);
		const general = screen.getByRole("tab", { name: "General" });
		act(() => general.focus());
		fireEvent.keyDown(general, { key: "ArrowRight" });
		await waitFor(() =>
			expect(
				screen.getByRole("tab", { name: "Video", selected: true }),
			).toBeTruthy(),
		);
		fireEvent.keyDown(screen.getByRole("tab", { name: "Video" }), {
			key: "ArrowRight",
		});
		const disabledTab = screen.getByRole("tab", { name: "Future" });
		await waitFor(() => expect(document.activeElement).toBe(disabledTab));
		fireEvent.keyDown(disabledTab, { key: "Enter" });
		expect(
			screen.getByRole("tab", { name: "Video", selected: true }),
		).toBeTruthy();
		fireEvent.keyDown(disabledTab, { key: "ArrowRight" });
		await waitFor(() =>
			expect(
				screen.getByRole("tab", { name: "Audio", selected: true }),
			).toBeTruthy(),
		);
		expect(screen.getByRole("tabpanel").textContent).toBe("Audio settings");
	});

	it("opens a labelled dialog and restores focus to its trigger after Escape", async () => {
		render(
			<Dialog>
				<DialogTrigger render={<Button />}>Open settings</DialogTrigger>
				<DialogContent>
					<DialogTitle>Settings</DialogTitle>
					<DialogDescription>Configure output.</DialogDescription>
					<Button>Apply</Button>
				</DialogContent>
			</Dialog>,
		);
		const trigger = screen.getByRole("button", { name: "Open settings" });
		act(() => trigger.focus());
		fireEvent.click(trigger);
		const dialog = await screen.findByRole("dialog", { name: "Settings" });
		await waitFor(() =>
			expect(document.activeElement).toBe(
				screen.getByRole("button", { name: "Apply" }),
			),
		);
		fireEvent.keyDown(dialog, { key: "Escape" });
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(trigger));
	});

	it("shows failure details from a keyboard-focusable badge tooltip", async () => {
		render(
			<Tooltip>
				<TooltipTrigger
					aria-label="Failed: Audio waveform is unavailable."
					render={<Badge tabIndex={0} />}
				>
					Failed
				</TooltipTrigger>
				<TooltipContent>Audio waveform is unavailable.</TooltipContent>
			</Tooltip>,
		);
		const trigger = screen.getByLabelText(
			"Failed: Audio waveform is unavailable.",
		);
		fireEvent.keyDown(document, { key: "Tab" });
		act(() => trigger.focus());
		expect(
			await screen.findByText("Audio waveform is unavailable."),
		).toBeTruthy();
		expect(trigger.tagName).toBe("SPAN");
		act(() => trigger.blur());
		await waitFor(() =>
			expect(screen.queryByText("Audio waveform is unavailable.")).toBeNull(),
		);
	});
});
