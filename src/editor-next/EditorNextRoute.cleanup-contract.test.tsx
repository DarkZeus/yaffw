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
import { prepareBrowserAudioPreviewSources } from "./browser-audio-preview-sources";
import type {
	BrowserAudioPreviewSource,
	BrowserAudioPreviewSourcesResult,
} from "./browser-audio-preview-sources.types";
import { loadBrowserWaveformLane } from "./selection-waveform-lanes";

const adapterMockState = vi.hoisted(() => ({
	previewAudioEngineCreate: vi.fn(),
	previewAudioEngines: [] as Array<{
		destroy: ReturnType<typeof vi.fn>;
		getCurrentTime: ReturnType<typeof vi.fn>;
		pause: ReturnType<typeof vi.fn>;
		play: ReturnType<typeof vi.fn>;
		setOutputGain: ReturnType<typeof vi.fn>;
		setPlaybackRate: ReturnType<typeof vi.fn>;
		setTime: ReturnType<typeof vi.fn>;
		setTrackChannelMode: ReturnType<typeof vi.fn>;
		setTrackGain: ReturnType<typeof vi.fn>;
	}>,
	wavesurferCreate: vi.fn(),
	wavesurfers: [] as Array<{
		destroy: ReturnType<typeof vi.fn>;
		on: ReturnType<typeof vi.fn>;
	}>,
}));

vi.mock("./browser-audio-preview-sources", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("./browser-audio-preview-sources")>();

	return {
		...actual,
		prepareBrowserAudioPreviewSources: vi.fn(),
	};
});

vi.mock("./selection-waveform-lanes", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("./selection-waveform-lanes")>();

	return {
		...actual,
		loadBrowserWaveformLane: vi.fn(),
	};
});

vi.mock("./preview-audio-engine", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./preview-audio-engine")>();

	return {
		...actual,
		canUsePreviewAudioEngine: () => true,
		createPreviewAudioEngine: adapterMockState.previewAudioEngineCreate,
	};
});

vi.mock("wavesurfer.js", () => ({
	default: {
		create: adapterMockState.wavesurferCreate,
	},
}));

vi.mock("wavesurfer.js/plugins/regions", () => ({
	default: {
		create: () => ({
			addRegion: vi.fn(() => ({
				end: 12,
				setOptions: vi.fn(),
				start: 0,
			})),
			on: vi.fn(() => vi.fn()),
		}),
	},
}));

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

const prepareBrowserAudioPreviewSourcesMock = vi.mocked(
	prepareBrowserAudioPreviewSources,
);
const loadBrowserWaveformLaneMock = vi.mocked(loadBrowserWaveformLane);

beforeEach(() => {
	Object.defineProperty(URL, "createObjectURL", {
		configurable: true,
		value: vi.fn((source: Blob) => {
			if (source instanceof File) {
				return `blob:preview:${source.name}`;
			}

			return "blob:preview:anonymous";
		}),
	});
	Object.defineProperty(URL, "revokeObjectURL", {
		configurable: true,
		value: vi.fn(),
	});
	vi.stubGlobal("AudioContext", vi.fn());
	adapterMockState.previewAudioEngines.length = 0;
	adapterMockState.wavesurfers.length = 0;
	adapterMockState.previewAudioEngineCreate.mockImplementation(async () => {
		const previewAudioEngine = {
			destroy: vi.fn(),
			getCurrentTime: vi.fn(() => 0),
			pause: vi.fn(),
			play: vi.fn(),
			setOutputGain: vi.fn(),
			setPlaybackRate: vi.fn(),
			setTime: vi.fn(),
			setTrackChannelMode: vi.fn(),
			setTrackGain: vi.fn(),
		};
		adapterMockState.previewAudioEngines.push(previewAudioEngine);

		return previewAudioEngine;
	});
	adapterMockState.wavesurferCreate.mockImplementation(() => {
		const wavesurfer = {
			destroy: vi.fn(),
			on: vi.fn(() => vi.fn()),
		};
		adapterMockState.wavesurfers.push(wavesurfer);

		return wavesurfer;
	});
	prepareBrowserAudioPreviewSourcesMock.mockImplementation(async (request) =>
		createPreparedAudioPreviewSources(request.asset.id),
	);
	loadBrowserWaveformLaneMock.mockResolvedValue({
		samples: [0.2, 0.7, 0.4],
		status: "ready",
	});
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	vi.unstubAllGlobals();
	restoreObjectUrl("createObjectURL", originalCreateObjectURL);
	restoreObjectUrl("revokeObjectURL", originalRevokeObjectURL);
});

describe("EditorNextRoute cleanup contract", () => {
	it("releases active Media asset preview resources and Generated media delivery on confirmed Close file", async () => {
		const generatedBlob = new Blob(["generated media"], {
			type: "video/mp4",
		});
		const deliverGeneratedMedia = vi.fn();
		vi.spyOn(window, "confirm").mockReturnValue(true);

		render(
			<EditorNextRoute
				createAssetId={() => "asset-close-contract"}
				createDraftId={() => "draft-close-contract"}
				createExportJobId={() => "export-close-contract"}
				createGeneratedMediaId={() => "generated-close-contract"}
				defaultExportRunner={{
					cancelSupported: true,
					run: vi.fn(() => Promise.resolve({ blob: generatedBlob })),
				}}
				deliverGeneratedMedia={deliverGeneratedMedia}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => supportedInspection}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Local media file"), {
			target: {
				files: [
					new File(["video"], "close-contract.mp4", {
						type: "video/mp4",
					}),
				],
			},
		});

		await waitFor(() => {
			expect(
				screen.getByLabelText("Preview for close-contract.mp4"),
			).toBeTruthy();
		});
		await waitFor(() => {
			expect(prepareBrowserAudioPreviewSourcesMock).toHaveBeenCalledTimes(1);
			expect(loadBrowserWaveformLaneMock).toHaveBeenCalledTimes(1);
			expect(adapterMockState.previewAudioEngines).toHaveLength(1);
			expect(adapterMockState.wavesurfers).toHaveLength(1);
		});

		openExportTab();
		fireEvent.click(screen.getByRole("button", { name: "Start export" }));

		await waitFor(() => {
			expect(screen.getByText("Export complete")).toBeTruthy();
		});

		fireEvent.click(
			within(screen.getByLabelText("Generated media status")).getByRole(
				"button",
				{ name: "Download export" },
			),
		);

		expect(deliverGeneratedMedia).toHaveBeenCalledWith({
			blob: generatedBlob,
			generatedMedia: expect.objectContaining({
				assetId: "asset-close-contract",
				fileName: "close-contract-export.mp4",
				id: "generated-close-contract",
			}),
		});

		openMediaTab();
		fireEvent.click(screen.getByRole("button", { name: "Close file" }));

		await waitFor(() => {
			expect(screen.getByText("Waiting for a media asset draft.")).toBeTruthy();
		});

		expect(URL.revokeObjectURL).toHaveBeenCalledWith(
			"blob:preview:close-contract.mp4",
		);
		expect(URL.revokeObjectURL).toHaveBeenCalledWith(
			"blob:audio:asset-close-contract:audio-1",
		);
		expect(
			adapterMockState.previewAudioEngines[0]?.destroy,
		).toHaveBeenCalledTimes(1);
		expect(adapterMockState.wavesurfers[0]?.destroy).toHaveBeenCalledTimes(1);
		expect(
			screen.queryByLabelText("Preview for close-contract.mp4"),
		).toBeNull();
		expect(screen.queryByLabelText("Selection timeline")).toBeNull();
		expect(
			screen.queryByRole("button", { name: "Download export" }),
		).toBeNull();
		expect(deliverGeneratedMedia).toHaveBeenCalledTimes(1);
	}, 10_000);

	it("keeps the next Media asset current when stale preview async work resolves after Close file and re-import", async () => {
		const audioRuns: Array<{
			assetId: string;
			deferred: Deferred<BrowserAudioPreviewSourcesResult>;
		}> = [];
		const waveformRuns: Array<{
			deferred: Deferred<Awaited<ReturnType<typeof loadBrowserWaveformLane>>>;
			sourceName: string;
		}> = [];
		const assetIds = ["asset-replace-first", "asset-replace-second"];
		const draftIds = ["draft-replace-first", "draft-replace-second"];
		let nextAssetId = 0;
		let nextDraftId = 0;
		vi.spyOn(window, "confirm").mockReturnValue(true);
		prepareBrowserAudioPreviewSourcesMock.mockImplementation((request) => {
			const deferred = createDeferred<BrowserAudioPreviewSourcesResult>();
			audioRuns.push({
				assetId: request.asset.id,
				deferred,
			});

			return deferred.promise;
		});
		loadBrowserWaveformLaneMock.mockImplementation((request) => {
			const deferred =
				createDeferred<Awaited<ReturnType<typeof loadBrowserWaveformLane>>>();
			waveformRuns.push({
				deferred,
				sourceName:
					request.source instanceof File ? request.source.name : "unknown",
			});

			return deferred.promise;
		});

		const view = render(
			<EditorNextRoute
				createAssetId={() => assetIds[nextAssetId++] ?? "asset-replace-extra"}
				createDraftId={() => draftIds[nextDraftId++] ?? "draft-replace-extra"}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => supportedInspection}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Local media file"), {
			target: {
				files: [
					new File(["first video"], "replace-first.mp4", {
						type: "video/mp4",
					}),
				],
			},
		});

		await waitFor(() => {
			expect(
				screen.getByLabelText("Preview for replace-first.mp4"),
			).toBeTruthy();
			expect(audioRuns).toHaveLength(1);
			expect(waveformRuns).toHaveLength(1);
		});

		fireEvent.click(screen.getByRole("button", { name: "Close file" }));

		await waitFor(() => {
			expect(screen.getByLabelText("Local media file")).toBeTruthy();
		});
		expect(URL.revokeObjectURL).toHaveBeenCalledWith(
			"blob:preview:replace-first.mp4",
		);

		fireEvent.change(screen.getByLabelText("Local media file"), {
			target: {
				files: [
					new File(["second video"], "replace-second.mp4", {
						type: "video/mp4",
					}),
				],
			},
		});

		await waitFor(() => {
			expect(
				screen.getByLabelText("Preview for replace-second.mp4"),
			).toBeTruthy();
			expect(audioRuns).toHaveLength(2);
			expect(waveformRuns).toHaveLength(2);
		});

		audioRuns[1]?.deferred.resolve(
			createPreparedAudioPreviewSources("asset-replace-second"),
		);
		waveformRuns[1]?.deferred.resolve({
			samples: [0.1, 0.8, 0.3],
			status: "ready",
		});

		await waitFor(() => {
			expect(adapterMockState.previewAudioEngines).toHaveLength(1);
			expect(adapterMockState.wavesurfers).toHaveLength(1);
		});

		audioRuns[0]?.deferred.resolve(
			createPreparedAudioPreviewSources("asset-replace-first"),
		);
		waveformRuns[0]?.deferred.resolve({
			samples: [0.9, 0.3, 0.2],
			status: "ready",
		});

		await waitFor(() => {
			expect(URL.revokeObjectURL).toHaveBeenCalledWith(
				"blob:audio:asset-replace-first:audio-1",
			);
		});
		expect(waveformRuns.map((run) => run.sourceName)).toEqual([
			"replace-first.mp4",
			"replace-second.mp4",
		]);
		expect(screen.queryByLabelText("Preview for replace-first.mp4")).toBeNull();
		expect(
			screen.getByLabelText("Preview for replace-second.mp4"),
		).toBeTruthy();
		expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(
			"blob:preview:replace-second.mp4",
		);
		expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(
			"blob:audio:asset-replace-second:audio-1",
		);
		expect(
			adapterMockState.previewAudioEngines[0]?.destroy,
		).not.toHaveBeenCalled();
		expect(adapterMockState.wavesurfers[0]?.destroy).not.toHaveBeenCalled();
		expect(adapterMockState.wavesurfers).toHaveLength(1);

		view.unmount();

		expect(URL.revokeObjectURL).toHaveBeenCalledWith(
			"blob:preview:replace-second.mp4",
		);
		expect(URL.revokeObjectURL).toHaveBeenCalledWith(
			"blob:audio:asset-replace-second:audio-1",
		);
		expect(
			adapterMockState.previewAudioEngines[0]?.destroy,
		).toHaveBeenCalledTimes(1);
		expect(adapterMockState.wavesurfers[0]?.destroy).toHaveBeenCalledTimes(1);
	});

	it("removes Generated media delivery after an editing decision invalidates the export result", async () => {
		const generatedBlob = new Blob(["generated media"], { type: "video/mp4" });
		const deliverGeneratedMedia = vi.fn();

		render(
			<EditorNextRoute
				createAssetId={() => "asset-generated-invalidation"}
				createDraftId={() => "draft-generated-invalidation"}
				createExportJobId={() => "export-generated-invalidation"}
				createGeneratedMediaId={() => "generated-invalidation"}
				defaultExportRunner={{
					cancelSupported: true,
					run: vi.fn(() => Promise.resolve({ blob: generatedBlob })),
				}}
				deliverGeneratedMedia={deliverGeneratedMedia}
				initialRuntime={supportedRuntime}
				inspectLocalAsset={async () => supportedInspection}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Local media file"), {
			target: {
				files: [
					new File(["video"], "generated-invalidation.mp4", {
						type: "video/mp4",
					}),
				],
			},
		});

		await waitFor(() => {
			expect(
				screen.getByLabelText("Preview for generated-invalidation.mp4"),
			).toBeTruthy();
		});
		openExportTab();
		expect(screen.getByRole("button", { name: "Start export" })).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Start export" }));

		await waitFor(() => {
			expect(screen.getByText("Export complete")).toBeTruthy();
		});

		expect(
			within(screen.getByLabelText("Generated media status")).getByRole(
				"button",
				{ name: "Download export" },
			),
		).toBeTruthy();

		fireEvent.click(
			screen.getByRole("button", { name: "Seek forward 10 seconds" }),
		);
		fireEvent.keyDown(window, { code: "BracketLeft", key: "[" });

		await waitFor(() => {
			expect(screen.queryByText("Export complete")).toBeNull();
			expect(
				screen.queryByRole("button", { name: "Download export" }),
			).toBeNull();
			expect(screen.getByText("Standard export")).toBeTruthy();
		});
		expect(deliverGeneratedMedia).not.toHaveBeenCalled();
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

function createPreparedAudioPreviewSources(
	assetId: string,
): BrowserAudioPreviewSourcesResult {
	return {
		failures: [],
		sources: [
			{
				blob: new Blob(["audio"], { type: "audio/mp4" }),
				byteLength: 5,
				downloadName: "audio-1.m4a",
				mimeType: "audio/mp4",
				startPositionSeconds: 0,
				strategy: "same-codec-remux",
				track: {
					codec: "aac",
					id: "audio-1",
					kind: "audio",
					label: "Voice",
				},
				trackId: "audio-1",
				trackIndex: 0,
				url: `blob:audio:${assetId}:audio-1`,
			} satisfies BrowserAudioPreviewSource,
		],
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

type Deferred<T> = {
	promise: Promise<T>;
	resolve: (value: T) => void;
};

function createDeferred<T>(): Deferred<T> {
	let resolve: (value: T) => void = () => {};
	const promise = new Promise<T>((promiseResolve) => {
		resolve = promiseResolve;
	});

	return {
		promise,
		resolve,
	};
}
