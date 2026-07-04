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
import type { ExportProgress } from "@/editor-core/model";
import { evaluateRuntimeSupport } from "@/editor-core/runtime-capabilities";

import { EditorNextRoute } from "../entry/EditorNextRoute";

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

beforeEach(() => {
	Object.defineProperty(URL, "createObjectURL", {
		configurable: true,
		value: vi.fn(() => "blob:editor-next-final-smoke"),
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

describe("editor-next final first-slice smoke coverage", () => {
	it("blocks unsupported runtimes before exposing local import", () => {
		render(
			<EditorNextRoute
				initialRuntime={evaluateRuntimeSupport({
					fileApi: true,
					mediaSource: true,
					objectUrl: true,
					videoDecoder: false,
					videoEncoder: false,
				})}
			/>,
		);

		expect(screen.getAllByText("Runtime blocked").length).toBeGreaterThan(0);
		expect(screen.getByRole("alert").textContent).toContain("WebCodecs");
		expect(screen.queryByLabelText("Local media file")).toBeNull();
	});

	it("smokes local import, selection, export progress, explicit delivery, and close cleanup", async () => {
		const generatedBlob = new Blob(["generated media"], { type: "video/mp4" });
		const exportDeferred = createDeferred<{
			blob: Blob;
			mimeType: string;
		}>();
		const exportRun = vi.fn(({ onProgress }) => {
			const progress: ExportProgress[] = [
				{ phase: "preparing" },
				{ completedRatio: 0.75, phase: "muxing" },
			];

			for (const event of progress) {
				onProgress(event);
			}

			return exportDeferred.promise;
		});
		const deliverGeneratedMedia = vi.fn();
		vi.spyOn(window, "confirm").mockReturnValue(true);

		render(
			<EditorNextRoute
				createAssetId={() => "asset-final-smoke"}
				createDraftId={() => "draft-final-smoke"}
				createExportJobId={() => "export-final-smoke"}
				createGeneratedMediaId={() => "generated-final-smoke"}
				defaultExportRunner={{
					cancelSupported: true,
					run: exportRun,
				}}
				deliverGeneratedMedia={deliverGeneratedMedia}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => supportedInspection}
				now={() => 1_717_171_717}
			/>,
		);

		expect(dispatchBeforeUnload()).toBe(false);

		fireEvent.change(screen.getByLabelText("Local media file"), {
			target: {
				files: [new File(["video"], "final-smoke.mp4", { type: "video/mp4" })],
			},
		});

		await waitFor(() => {
			expect(screen.getByLabelText("Preview for final-smoke.mp4")).toBeTruthy();
		});

		await waitFor(() => {
			expect(dispatchBeforeUnload()).toBe(true);
		});
		expect(screen.getByLabelText("Selection timeline")).toBeTruthy();
		expect(screen.getAllByText("Start").length).toBeGreaterThan(0);
		expect(screen.getAllByText("End").length).toBeGreaterThan(0);
		expect(
			within(screen.getByLabelText("Workbench selection region")).getByText(
				"Selection",
			),
		).toBeTruthy();
		expect(screen.getByLabelText("Timeline zoom")).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Zoom in timeline" }),
		).toBeTruthy();

		openExportTab();
		expect(screen.getByLabelText("Export review")).toBeTruthy();

		expect(screen.getByText("Format")).toBeTruthy();
		expect(screen.getByText("MP4 / H.264 video / AAC audio")).toBeTruthy();
		expect(screen.getAllByText("Export").length).toBeGreaterThan(0);
		expect(screen.getByText("Whole file export")).toBeTruthy();
		expect(screen.getByText("Range")).toBeTruthy();
		expect(screen.getAllByText("Whole file").length).toBeGreaterThan(0);
		expect(screen.queryByLabelText("Export strategy")).toBeNull();
		expect(screen.queryByText("URL import")).toBeNull();
		expect(screen.queryByText("Custom output")).toBeNull();
		expect(screen.queryByText("Target bitrate")).toBeNull();

		const localFileInput = screen.queryByLabelText("Local media file");
		if (localFileInput instanceof HTMLElement) {
			fireEvent.blur(localFileInput);
		}

		fireEvent.keyDown(window, { code: "KeyL", key: "l" });
		fireEvent.keyDown(window, { code: "BracketLeft", key: "[" });

		await waitFor(() => {
			expect(screen.getByText("Standard export")).toBeTruthy();
		});

		fireEvent.click(screen.getByRole("button", { name: "Start export" }));

		await waitFor(() => {
			expect(exportRun).toHaveBeenCalledTimes(1);
		});
		await waitFor(() => {
			expect(screen.getByText("Muxing")).toBeTruthy();
		});

		exportDeferred.resolve({
			blob: generatedBlob,
			mimeType: "video/mp4",
		});

		await waitFor(() => {
			expect(screen.getByText("Export complete")).toBeTruthy();
		});

		expect(deliverGeneratedMedia).not.toHaveBeenCalled();
		expect(screen.queryByRole("button", { name: /use generated/i })).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "Download export" }));

		expect(deliverGeneratedMedia).toHaveBeenCalledWith({
			blob: generatedBlob,
			generatedMedia: expect.objectContaining({
				assetId: "asset-final-smoke",
				fileName: "final-smoke-export.mp4",
				id: "generated-final-smoke",
				mimeType: "video/mp4",
				selection: {
					endUs: 2_000_000,
					startUs: 2_000_000 - supportedInspection.frameTiming.frameDurationUs,
				},
			}),
		});

		openMediaTab();
		fireEvent.click(screen.getByRole("button", { name: "Close file" }));

		await waitFor(() => {
			expect(screen.getByText("Waiting for a media asset draft.")).toBeTruthy();
		});
		expect(dispatchBeforeUnload()).toBe(false);
		expect(URL.revokeObjectURL).toHaveBeenCalledWith(
			"blob:editor-next-final-smoke",
		);
	});

	it("smokes drag-and-drop video-only readiness and on-demand unsupported-media details", async () => {
		const { unmount } = render(
			<EditorNextRoute
				createAssetId={() => "asset-video-only"}
				createDraftId={() => "draft-video-only"}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => ({
					...supportedInspection,
					audioTracks: [],
				})}
			/>,
		);

		fireEvent.drop(screen.getByTestId("editor-next-drop-zone"), {
			dataTransfer: {
				files: [new File(["video"], "video-only.mp4", { type: "video/mp4" })],
			},
		});

		await waitFor(() => {
			expect(screen.getByLabelText("Preview for video-only.mp4")).toBeTruthy();
		});
		expect(
			screen.getByText("No audio tracks available for waveform lanes."),
		).toBeTruthy();
		expect(screen.getByText("No audio tracks")).toBeTruthy();
		expect(screen.queryByText("none")).toBeNull();

		unmount();

		render(
			<EditorNextRoute
				createAssetId={() => "asset-audio-only"}
				createDraftId={() => "draft-audio-only"}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => ({
					...supportedInspection,
					videoTracks: [],
				})}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Local media file"), {
			target: {
				files: [new File(["audio"], "audio-only.mp4", { type: "video/mp4" })],
			},
		});

		await waitFor(() => {
			expect(screen.getByRole("alert").textContent).toContain("Audio-only");
		});

		const details = screen
			.getByText("Technical details")
			.closest("details") as HTMLDetailsElement;

		expect(details.open).toBe(false);
		fireEvent.click(screen.getByText("Technical details"));
		expect(details.open).toBe(true);
		expect(details.textContent).toContain(
			"Analysis found audio tracks but no video track.",
		);
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

function dispatchBeforeUnload() {
	const event = new Event("beforeunload", {
		cancelable: true,
	}) as BeforeUnloadEvent;

	window.dispatchEvent(event);

	return event.defaultPrevented;
}

function openExportTab() {
	activateTab(screen.getByRole("tab", { name: "Export" }));
}

function openMediaTab() {
	activateTab(screen.getByRole("tab", { name: "Media" }));
}

function activateTab(tab: HTMLElement) {
	fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
	fireEvent.click(tab);
}

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		resolve = promiseResolve;
		reject = promiseReject;
	});

	return {
		promise,
		reject,
		resolve,
	};
}

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
