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

import { EditorNextRouteTestHarness } from "./editor-next-route-test-harness";

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

const previewRenderStats = vi.hoisted(() => ({
	audioPanelRenderCount: 0,
	nativePreviewRenderCount: 0,
}));

vi.mock("../../preview/player/native-preview-player", async () => {
	const React = await import("react");

	return {
		NativePreviewPlayer: React.memo(function MockNativePreviewPlayer(props: {
			asset: { label: string };
			onPreviewPlayheadChange?: (playheadUs: number) => void;
		}) {
			previewRenderStats.nativePreviewRenderCount += 1;

			return React.createElement(
				"section",
				{ "aria-label": `Preview for ${props.asset.label}` },
				React.createElement(
					"button",
					{
						onClick: () => props.onPreviewPlayheadChange?.(1_000_000),
						type: "button",
					},
					"Report preview playhead",
				),
			);
		}),
	};
});

vi.mock("../../audio/panel/audio-panel", async () => {
	const React = await import("react");

	return {
		AudioPanel: React.memo(function MockAudioPanel() {
			previewRenderStats.audioPanelRenderCount += 1;

			return React.createElement("section", {
				"aria-label": "Audio panel",
			});
		}),
	};
});

beforeEach(() => {
	previewRenderStats.audioPanelRenderCount = 0;
	previewRenderStats.nativePreviewRenderCount = 0;
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
	vi.restoreAllMocks();
	restoreObjectUrl("createObjectURL", originalCreateObjectURL);
	restoreObjectUrl("revokeObjectURL", originalRevokeObjectURL);
});

describe("EditorNextRoute preview render isolation", () => {
	it("does not re-render preview or Audio panel children for top-bar playhead updates", async () => {
		render(
			<EditorNextRouteTestHarness
				createAssetId={() => "asset-preview-render-isolation"}
				createDraftId={() => "draft-preview-render-isolation"}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => supportedInspection}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Local media file"), {
			target: {
				files: [
					new File(["video"], "render-isolation.mp4", {
						type: "video/mp4",
					}),
				],
			},
		});

		await waitFor(() => {
			expect(
				screen.getByLabelText("Preview for render-isolation.mp4"),
			).toBeTruthy();
		});

		openAudioTab();
		await waitFor(() => {
			expect(screen.getByLabelText("Audio panel")).toBeTruthy();
		});

		const nativePreviewRenderCount =
			previewRenderStats.nativePreviewRenderCount;
		const audioPanelRenderCount = previewRenderStats.audioPanelRenderCount;

		fireEvent.click(
			screen.getByRole("button", { name: "Report preview playhead" }),
		);

		await waitFor(() => {
			expect(
				screen.getByLabelText("Top bar media-time readouts").textContent,
			).toContain("00:00:01.000");
		});

		expect(previewRenderStats.nativePreviewRenderCount).toBe(
			nativePreviewRenderCount,
		);
		expect(previewRenderStats.audioPanelRenderCount).toBe(
			audioPanelRenderCount,
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
	durationUs: 12_000_000,
	frameTiming: {
		fps: 30,
		frameDurationUs: 33_333,
		source: "known",
	},
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

function openAudioTab() {
	const tab = screen.getByRole("tab", { name: "Audio" });
	fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
	fireEvent.click(tab);
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
