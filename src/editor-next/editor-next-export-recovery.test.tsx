/* @vitest-environment jsdom */

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LocalMediaAssetInspection } from "@/editor-core/local-file-analysis";
import { evaluateRuntimeSupport } from "@/editor-core/runtime-capabilities";

import { EditorNextRoute } from "./EditorNextRoute";

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

beforeEach(() => {
	Object.defineProperty(URL, "createObjectURL", {
		configurable: true,
		value: vi.fn(() => "blob:editor-next-export-recovery"),
	});
	Object.defineProperty(URL, "revokeObjectURL", {
		configurable: true,
		value: vi.fn(),
	});
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	restoreObjectUrl("createObjectURL", originalCreateObjectURL);
	restoreObjectUrl("revokeObjectURL", originalRevokeObjectURL);
});

describe("editor-next export recovery", () => {
	it("keeps the active media asset editable after a default export failure", async () => {
		const exportRun = vi.fn(() =>
			Promise.reject(new Error("Encoder rejected the source video.")),
		);

		render(
			<EditorNextRoute
				createAssetId={() => "asset-export-failure"}
				createDraftId={() => "draft-export-failure"}
				createExportJobId={() => "export-failure"}
				defaultExportRunner={{
					cancelSupported: true,
					run: exportRun,
				}}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => supportedInspection}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Local media file"), {
			target: {
				files: [new File(["video"], "failure.mp4", { type: "video/mp4" })],
			},
		});

		await waitFor(() => {
			expect(screen.getByLabelText("Preview for failure.mp4")).toBeTruthy();
		});

		openExportTab();
		fireEvent.click(screen.getByRole("button", { name: "Start export" }));

		await waitFor(() => {
			expect(screen.getByText("Default export failed.")).toBeTruthy();
		});

		const technicalDetails = screen
			.getByText("Technical details")
			.closest("details");
		expect(technicalDetails).toBeTruthy();
		expect(technicalDetails?.open).toBe(false);
		expect(technicalDetails?.textContent).toContain(
			"Encoder rejected the source video.",
		);
		fireEvent.click(
			within(technicalDetails as HTMLElement).getByText("Technical details"),
		);
		expect(technicalDetails?.open).toBe(true);
		expect(screen.getByLabelText("Preview for failure.mp4")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Start export" })).toBeTruthy();

		const localFileInput = screen.queryByLabelText("Local media file");
		if (localFileInput instanceof HTMLElement) {
			fireEvent.blur(localFileInput);
		}

		fireEvent.keyDown(window, { code: "KeyL", key: "l" });
		fireEvent.keyDown(window, { code: "BracketLeft", key: "[" });

		await waitFor(() => {
			expect(screen.getByText("Standard export")).toBeTruthy();
		});
		expect(screen.queryByText("Default export failed.")).toBeNull();
	});

	it("cancels a supported export without clearing the active media asset", async () => {
		const exportRun = vi.fn(
			({ signal }: { signal: AbortSignal }) =>
				new Promise<{ blob: Blob }>((_resolve, reject) => {
					signal.addEventListener(
						"abort",
						() => {
							const error = new Error("Export was aborted.");
							error.name = "AbortError";
							reject(error);
						},
						{ once: true },
					);
				}),
		);

		render(
			<EditorNextRoute
				createAssetId={() => "asset-export-cancelled"}
				createDraftId={() => "draft-export-cancelled"}
				createExportJobId={() => "export-cancelled"}
				defaultExportRunner={{
					cancelSupported: true,
					run: exportRun,
				}}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => supportedInspection}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Local media file"), {
			target: {
				files: [new File(["video"], "cancel.mp4", { type: "video/mp4" })],
			},
		});

		await waitFor(() => {
			expect(screen.getByLabelText("Preview for cancel.mp4")).toBeTruthy();
		});

		openExportTab();
		fireEvent.click(screen.getByRole("button", { name: "Start export" }));

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: "Cancel export" }),
			).toBeTruthy();
		});
		fireEvent.click(screen.getByRole("button", { name: "Cancel export" }));

		await waitFor(() => {
			expect(screen.getByText("Export cancelled.")).toBeTruthy();
		});

		expect(screen.getByLabelText("Preview for cancel.mp4")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Start export" })).toBeTruthy();
		expect(exportRun).toHaveBeenCalledTimes(1);
	});
});

const supportedRuntime = evaluateRuntimeSupport({
	fileApi: true,
	mediaSource: true,
	objectUrl: true,
	videoDecoder: true,
	videoEncoder: true,
});

const supportedInspection = {
	audioTracks: [
		{
			channels: 2,
			codec: "aac",
			id: "audio-1",
			language: "eng",
			label: "Voice",
			sampleRate: 48_000,
		},
	],
	durationUs: 2_000_000,
	frameTiming: {
		fps: 30,
		frameDurationUs: 33_333,
		source: "known",
	},
	videoTracks: [
		{
			codec: "avc",
			height: 180,
			id: "video-1",
			label: "Main",
			width: 320,
		},
	],
} satisfies LocalMediaAssetInspection;

function restoreObjectUrl(
	key: "createObjectURL" | "revokeObjectURL",
	value: typeof URL.createObjectURL | typeof URL.revokeObjectURL | undefined,
) {
	if (value) {
		Object.defineProperty(URL, key, {
			configurable: true,
			value,
		});
		return;
	}

	delete URL[key];
}

function openExportTab() {
	activateTab(screen.getByRole("tab", { name: "Export" }));
}

function activateTab(tab: HTMLElement) {
	fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
	fireEvent.click(tab);
}
