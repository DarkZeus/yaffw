/* @vitest-environment jsdom */

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalMediaAssetInspection } from "@/editor-core/local-file-analysis";
import { evaluateRuntimeSupport } from "@/editor-core/runtime-capabilities";
import type {
	DefaultExportRunner,
	DefaultExportRunnerResult,
} from "../../export/types/default-export-runner.types";
import { EditorNextRouteTestHarness } from "./editor-next-route-test-harness";

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
	window.localStorage.clear();
	vi.restoreAllMocks();
	restoreObjectUrl("createObjectURL", originalCreateObjectURL);
	restoreObjectUrl("revokeObjectURL", originalRevokeObjectURL);
});

describe("editor-next export recovery", () => {
	it("handles failure from an uncancellable runner and starts a fresh job after editing", async () => {
		const first = deferredExport();
		const second = deferredExport();
		const exportRun = vi
			.fn<DefaultExportRunner["run"]>()
			.mockReturnValueOnce(first.promise)
			.mockReturnValueOnce(second.promise);

		render(
			<EditorNextRouteTestHarness
				createAssetId={() => "asset-export-failure"}
				createDraftId={() => "draft-export-failure"}
				createExportJobId={() => "export-failure"}
				defaultExportRunner={{
					cancelSupported: false,
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

		await screen.findByLabelText("Preview for failure.mp4");

		openExportTab();
		fireEvent.click(screen.getByRole("button", { name: "Start export" }));
		const firstRequest = exportRun.mock.calls[0][0];
		expect(screen.queryByRole("button", { name: "Cancel export" })).toBeNull();
		expect(screen.getByText("Cancellation unavailable")).toBeTruthy();
		await act(async () => {
			first.reject(
				new DOMException("Encoder rejected the source video.", "AbortError"),
			);
		});
		expect(screen.getByText("Default export failed.")).toBeTruthy();
		expect(firstRequest.signal.aborted).toBe(false);

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
		expect(screen.getByRole("button", { name: "Retry export" })).toBeTruthy();

		fireEvent.click(
			screen.getByRole("button", { name: "Seek forward 1 second" }),
		);
		fireEvent.keyDown(window, { code: "BracketLeft", key: "[" });
		fireEvent.click(screen.getByRole("button", { name: "Start export" }));
		const secondRequest = exportRun.mock.calls[1][0];
		expect(secondRequest.selection.startUs).toBe(1_000_000);
		act(() => {
			secondRequest.onProgress({ completedRatio: 0.2, phase: "encoding" });
			firstRequest.onProgress({ completedRatio: 0.95, phase: "muxing" });
		});
		expect(
			screen
				.getByRole("progressbar", { name: "Export progress" })
				.getAttribute("aria-valuenow"),
		).toBe("20");
		await act(async () => {
			second.resolve({ blob: new Blob(["retry output"]) });
		});
		expect(
			screen.getByRole("button", { name: "Download export" }),
		).toBeTruthy();
	});

	it("keeps cancellation pending until settlement and ignores late progress after retry", async () => {
		const first = deferredExport();
		const second = deferredExport();
		const exportRun = vi
			.fn<DefaultExportRunner["run"]>()
			.mockReturnValueOnce(first.promise)
			.mockReturnValueOnce(second.promise);

		render(
			<EditorNextRouteTestHarness
				createAssetId={() => "asset-export-cancelled"}
				createDraftId={() => "draft-export-cancelled"}
				createExportJobId={() => "same-job-id"}
				defaultExportRunner={{ cancelSupported: true, run: exportRun }}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => supportedInspection}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Local media file"), {
			target: {
				files: [new File(["video"], "cancel.mp4", { type: "video/mp4" })],
			},
		});
		await screen.findByLabelText("Preview for cancel.mp4");

		fireEvent.click(
			screen.getByRole("button", { name: "Seek forward 1 second" }),
		);
		fireEvent.keyDown(window, { code: "BracketLeft", key: "[" });
		openExportTab();
		fireEvent.click(screen.getByRole("button", { name: "Start export" }));
		const firstRequest = exportRun.mock.calls[0][0];
		expect(firstRequest.selection.startUs).toBe(1_000_000);
		fireEvent.click(screen.getByRole("button", { name: "Cancel export" }));

		expect(firstRequest.signal.aborted).toBe(true);
		expect(screen.getByText("Cancelling export…")).toBeTruthy();
		expect(
			screen.getByRole<HTMLButtonElement>("button", { name: "Cancel export" })
				.disabled,
		).toBe(true);
		expect(
			screen.getByRole<HTMLButtonElement>("button", { name: "Output settings" })
				.disabled,
		).toBe(true);
		expect(
			screen.getByRole<HTMLButtonElement>("button", { name: "Close file" })
				.disabled,
		).toBe(true);
		expect(screen.queryByRole("button", { name: "Retry export" })).toBeNull();

		act(() => {
			firstRequest.onProgress({ completedRatio: 0.95, phase: "muxing" });
		});
		expect(screen.getByText("Cancelling export…")).toBeTruthy();
		expect(
			screen
				.getByRole("progressbar", { name: "Export progress" })
				.getAttribute("aria-valuenow"),
		).not.toBe("95");

		await act(async () => {
			// A runner can still resolve after cancellation was requested.
			first.resolve({ blob: new Blob(["cancelled output"]) });
		});
		expect(screen.getByText("Export cancelled.")).toBeTruthy();
		expect(screen.getByLabelText("Preview for cancel.mp4")).toBeTruthy();
		expect(
			screen.getByRole<HTMLButtonElement>("button", { name: "Output settings" })
				.disabled,
		).toBe(false);
		expect(
			screen.getByRole<HTMLButtonElement>("button", { name: "Close file" })
				.disabled,
		).toBe(false);

		fireEvent.click(screen.getByRole("button", { name: "Retry export" }));
		const secondRequest = exportRun.mock.calls[1][0];
		expect(secondRequest.selection).toEqual(firstRequest.selection);
		act(() => {
			secondRequest.onProgress({ completedRatio: 0.2, phase: "encoding" });
			firstRequest.onProgress({ completedRatio: 0.95, phase: "muxing" });
		});
		expect(
			screen
				.getByRole("progressbar", { name: "Export progress" })
				.getAttribute("aria-valuenow"),
		).toBe("20");
		await act(async () => {
			second.resolve({ blob: new Blob(["retry output"]) });
		});
		expect(
			screen.getByRole("button", { name: "Download export" }),
		).toBeTruthy();
	});
});

function deferredExport() {
	let resolve: (value: DefaultExportRunnerResult) => void = () => {};
	let reject: (error: Error) => void = () => {};
	const promise = new Promise<DefaultExportRunnerResult>(
		(onResolve, onReject) => {
			resolve = onResolve;
			reject = onReject;
		},
	);
	return { promise, reject, resolve };
}

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
		analysis: {
			averageFrameRate: 30,
			frameRateIsConstant: true,
			maxFrameRate: 30,
			medianFrameRate: 30,
			minFrameRate: 30,
			probedPacketCount: 256,
			underlyingFrameRate: 30,
		},
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
