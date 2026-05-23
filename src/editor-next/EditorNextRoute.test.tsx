/* @vitest-environment jsdom */

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
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
		value: vi.fn(() => "blob:editor-next-preview"),
	});
	Object.defineProperty(URL, "revokeObjectURL", {
		configurable: true,
		value: vi.fn(),
	});
});

afterEach(() => {
	cleanup();
	restoreObjectUrl("createObjectURL", originalCreateObjectURL);
	restoreObjectUrl("revokeObjectURL", originalRevokeObjectURL);
});

describe("EditorNextRoute", () => {
	it("renders the empty local import shell when the runtime is supported", () => {
		render(
			<EditorNextRoute
				initialRuntime={evaluateRuntimeSupport({
					fileApi: true,
					mediaSource: true,
					objectUrl: true,
					videoDecoder: true,
					videoEncoder: true,
				})}
			/>,
		);

		expect(screen.getByText("Editor-next")).toBeTruthy();
		expect(screen.getByLabelText("Local video file")).toBeTruthy();
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("renders the unsupported runtime state before exposing local import", () => {
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

		const alert = screen.getByRole("alert");

		expect(alert.textContent).toContain("WebCodecs");
		expect(screen.queryByLabelText("Local video file")).toBeNull();
	});

	it("imports a local file from the file picker into the ready editor state", async () => {
		render(
			<EditorNextRoute
				createAssetId={() => "asset-picked"}
				createDraftId={() => "draft-picked"}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => supportedInspection}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Local video file"), {
			target: {
				files: [new File(["video"], "picked.mp4", { type: "video/mp4" })],
			},
		});

		await waitFor(() => {
			expect(screen.getByText("Ready media asset")).toBeTruthy();
		});

		expect(screen.getAllByText("picked.mp4").length).toBeGreaterThan(0);
		expect(screen.getByLabelText("Preview for picked.mp4")).toBeTruthy();
		expect(screen.getByText("Duration: 00:00:12.000")).toBeTruthy();
		expect(screen.getByText("Video tracks: 1")).toBeTruthy();
		expect(screen.getByText("Audio tracks: 1")).toBeTruthy();
		expect(screen.getByLabelText("Media analytics")).toBeTruthy();
		expect(screen.getByText("File info")).toBeTruthy();
		expect(screen.getByText("Video track")).toBeTruthy();
		expect(screen.getByText("Audio track")).toBeTruthy();
		expect(screen.getByText("1920x1080")).toBeTruthy();
		expect(screen.getByText("Full HD")).toBeTruthy();
		expect(screen.getByText("16:9")).toBeTruthy();
		expect(screen.getByText("30 fps")).toBeTruthy();
		expect(screen.getByText("Stereo")).toBeTruthy();
		expect(screen.getByText("48 kHz")).toBeTruthy();
		expect(screen.getByText("Coverage")).toBeTruthy();

		fireEvent.keyDown(window, { code: "KeyL", key: "l" });
		fireEvent.keyDown(window, { code: "BracketLeft", key: "[" });

		await waitFor(() => {
			expect(screen.getByText("00:00:10.000 - 00:00:12.000")).toBeTruthy();
		});
	});

	it("renders a shared selection timeline with progressive waveform lanes and commits handle drags through the session", async () => {
		mockTimelineGeometry();
		render(
			<EditorNextRoute
				createAssetId={() => "asset-timeline"}
				createDraftId={() => "draft-timeline"}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => supportedInspection}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Local video file"), {
			target: {
				files: [new File(["video"], "timeline.mp4", { type: "video/mp4" })],
			},
		});

		await waitFor(() => {
			expect(screen.getByLabelText("Selection timeline")).toBeTruthy();
		});

		expect(screen.getByText("Voice")).toBeTruthy();
		expect(screen.getAllByText("eng").length).toBeGreaterThan(0);
		expect(screen.getByText("Selection duration")).toBeTruthy();
		expect(screen.getAllByText("00:00:12.000").length).toBeGreaterThan(0);

		fireEvent.mouseDown(screen.getByLabelText("Selection start handle"), {
			clientX: 0,
		});
		fireEvent.mouseMove(window, { clientX: 600 });
		fireEvent.mouseUp(window, { clientX: 600 });

		await waitFor(() => {
			expect(screen.getByText("00:00:06.000 - 00:00:12.000")).toBeTruthy();
		});
		expect(screen.getAllByText("00:00:06.000").length).toBeGreaterThan(0);

		fireEvent.click(screen.getByRole("button", { name: "Reset selection" }));

		await waitFor(() => {
			expect(screen.getByText("00:00:00.000 - 00:00:12.000")).toBeTruthy();
		});
		expect(screen.getByText("Playhead")).toBeTruthy();
		expect(screen.getAllByText("00:00:06.000").length).toBeGreaterThan(0);
	});

	it("imports a local file from drag and drop into the ready editor state", async () => {
		render(
			<EditorNextRoute
				createAssetId={() => "asset-dropped"}
				createDraftId={() => "draft-dropped"}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => ({
					...supportedInspection,
					audioTracks: [],
				})}
			/>,
		);

		fireEvent.drop(screen.getByTestId("editor-next-drop-zone"), {
			dataTransfer: {
				files: [new File(["video"], "dropped.webm", { type: "video/webm" })],
			},
		});

		await waitFor(() => {
			expect(screen.getByText("Ready media asset")).toBeTruthy();
		});

		expect(screen.getAllByText("dropped.webm").length).toBeGreaterThan(0);
		expect(screen.getByText("Audio tracks: 0")).toBeTruthy();
		expect(screen.getByLabelText("Media analytics")).toBeTruthy();
		expect(screen.getByText("None")).toBeTruthy();
	});

	it("shows unsupported-media failures with technical details on demand", async () => {
		render(
			<EditorNextRoute
				createAssetId={() => "asset-audio-only"}
				createDraftId={() => "draft-audio-only"}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => ({
					...supportedInspection,
					audioTracks: supportedInspection.audioTracks,
					videoTracks: [],
				})}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Local video file"), {
			target: {
				files: [new File(["audio"], "audio-only.mp4", { type: "video/mp4" })],
			},
		});

		await waitFor(() => {
			expect(screen.getByRole("alert").textContent).toContain("Audio-only");
		});

		expect(screen.getByText("Technical details")).toBeTruthy();
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
	defaultProfileExportable: true,
	durationUs: 12_000_000,
	frameTiming: {
		fps: 30,
		frameDurationUs: 33_333,
		source: "known",
	},
	previewable: true,
	videoTracks: [
		{
			codec: "avc",
			height: 1080,
			id: "video-1",
			label: "Main",
			width: 1920,
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

function mockTimelineGeometry() {
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
		function getBoundingClientRect(this: HTMLElement) {
			if (
				this instanceof HTMLElement &&
				this.dataset.testid === "selection-timeline-track"
			) {
				return {
					bottom: 80,
					height: 80,
					left: 0,
					right: 1200,
					toJSON: () => ({}),
					top: 0,
					width: 1200,
					x: 0,
					y: 0,
				};
			}

			return {
				bottom: 0,
				height: 0,
				left: 0,
				right: 0,
				toJSON: () => ({}),
				top: 0,
				width: 0,
				x: 0,
				y: 0,
			};
		},
	);
}
