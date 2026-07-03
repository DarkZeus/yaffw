/* @vitest-environment jsdom */

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import type {
	AudioMix,
	MediaTimeUs,
	ReadyMediaAsset,
	Selection,
} from "@/editor-core/model";
import type { PreviewAudioEngineMeterSnapshot } from "./preview-audio-engine";

type MockMediaPlayerProps = Record<string, unknown> & {
	children?: ReactNode;
	className?: string;
	crossOrigin?: boolean;
	src?: unknown;
};

const adapterMockState = vi.hoisted(() => ({
	mediaPlayerRenderCount: 0,
	previewAudioEngineCreate: vi.fn(),
	previewAudioEngines: [] as Array<{
		destroy: ReturnType<typeof vi.fn>;
		getCurrentTime: ReturnType<typeof vi.fn>;
		pause: ReturnType<typeof vi.fn>;
		play: ReturnType<typeof vi.fn>;
		readMeterSnapshot: ReturnType<typeof vi.fn>;
		setOutputGain: ReturnType<typeof vi.fn>;
		setPlaybackRate: ReturnType<typeof vi.fn>;
		setCurrentTimeSeconds: (nextCurrentTimeSeconds: number) => void;
		setTime: ReturnType<typeof vi.fn>;
		setTrackChannelMode: ReturnType<typeof vi.fn>;
		setTrackMonitorGain: ReturnType<typeof vi.fn>;
		setTrackVolumeGain: ReturnType<typeof vi.fn>;
	}>,
}));

vi.mock("@vidstack/react", async () => {
	const React = await import("react");
	const MediaPlayer = React.forwardRef<HTMLVideoElement, MockMediaPlayerProps>(
		function MockMediaPlayer(
			{
				children,
				className,
				crossOrigin,
				onProviderChange: _onProviderChange,
				src,
				title: _title,
				viewType: _viewType,
				...props
			},
			ref,
		) {
			adapterMockState.mediaPlayerRenderCount += 1;

			return React.createElement(
				"div",
				{
					className,
					"data-testid": "mock-vidstack-player",
				},
				React.createElement("video", {
					...props,
					className: "h-full w-full bg-black object-contain",
					crossOrigin: crossOrigin ? "" : undefined,
					ref,
					src: normalizeMockPlayerSrc(src),
				}),
				children as ReactNode,
			);
		},
	);

	return {
		MediaPlayer,
		MediaProvider: ({ children }: { children?: React.ReactNode }) =>
			React.createElement(React.Fragment, null, children),
		Menu: {
			Button: ({
				children,
				...props
			}: React.PropsWithChildren<Record<string, unknown>>) =>
				React.createElement("button", props, children),
			Items: ({
				children,
				...props
			}: React.PropsWithChildren<Record<string, unknown>>) =>
				React.createElement("div", props, children),
			Radio: ({
				children,
				onSelect,
				...props
			}: React.PropsWithChildren<{
				onSelect?: (event: Event) => void;
				[key: string]: unknown;
			}>) =>
				React.createElement(
					"button",
					{
						...props,
						onClick: (event: React.MouseEvent<HTMLButtonElement>) =>
							onSelect?.(event.nativeEvent),
					},
					children,
				),
			RadioGroup: ({
				children,
				...props
			}: React.PropsWithChildren<Record<string, unknown>>) =>
				React.createElement("div", props, children),
			Root: ({
				children,
				...props
			}: React.PropsWithChildren<Record<string, unknown>>) =>
				React.createElement("div", props, children),
		},
		Poster: (props: Record<string, unknown>) =>
			React.createElement("img", props),
		isHLSProvider: () => false,
		useChapterOptions: () => Object.assign([], { selectedValue: undefined }),
		useMediaStore: () => ({ duration: 0 }),
	};
});

vi.mock("@vidstack/react/player/layouts/default", async () => {
	const React = await import("react");
	const Chapters = (props: Record<string, unknown>) =>
		React.createElement("svg", props);

	return {
		DefaultTooltip: ({ children }: { children?: React.ReactNode }) =>
			React.createElement(React.Fragment, null, children),
		DefaultVideoLayout: ({
			slots,
		}: {
			slots?: Record<string, unknown>;
		}) =>
			React.createElement("div", {
				"data-large-mute-button-hidden": String(
					(slots?.largeLayout as Record<string, unknown> | undefined)
						?.muteButton === null,
				),
				"data-large-volume-slider-hidden": String(
					(slots?.largeLayout as Record<string, unknown> | undefined)
						?.volumeSlider === null,
				),
				"data-mute-button-hidden": String(slots?.muteButton === null),
				"data-small-mute-button-hidden": String(
					(slots?.smallLayout as Record<string, unknown> | undefined)
						?.muteButton === null,
				),
				"data-small-volume-slider-hidden": String(
					(slots?.smallLayout as Record<string, unknown> | undefined)
						?.volumeSlider === null,
				),
				"data-testid": "mock-default-video-layout",
				"data-volume-slider-hidden": String(slots?.volumeSlider === null),
			}),
		defaultLayoutIcons: {
			Menu: {
				Chapters,
			},
		},
		useDefaultLayoutContext: () => ({ showMenuDelay: 0 }),
	};
});

vi.mock("./preview-audio-engine", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("./preview-audio-engine")>();

	return {
		...actual,
		canUsePreviewAudioEngine: () => true,
		createPreviewAudioEngine: adapterMockState.previewAudioEngineCreate,
	};
});

vi.mock("./browser-audio-preview-sources", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("./browser-audio-preview-sources")>();

	return {
		...actual,
		prepareBrowserAudioPreviewSources: vi.fn(),
	};
});

import { createActiveMediaAssetCleanupScopeController } from "./active-media-asset-cleanup-scope";
import { prepareBrowserAudioPreviewSources } from "./browser-audio-preview-sources";
import type {
	BrowserAudioPreviewSource,
	BrowserAudioPreviewSourcesResult,
} from "./browser-audio-preview-sources.types";
import { EXPORT_CORRECTNESS_FIXTURES } from "./export-correctness-fixtures";
import { NativePreviewPlayer } from "./native-preview-player";

function normalizeMockPlayerSrc(src: unknown): string | undefined {
	if (typeof src === "string") {
		return src;
	}

	if (Array.isArray(src)) {
		return normalizeMockPlayerSrc(src[0]);
	}

	if (src && typeof src === "object" && "src" in src) {
		const nestedSrc = (src as { src?: unknown }).src;

		return typeof nestedSrc === "string" ? nestedSrc : undefined;
	}

	return undefined;
}

const createObjectURL = vi.fn(() => "blob:preview-source");
const revokeObjectURL = vi.fn();
const play = vi.fn().mockResolvedValue(undefined);
const pause = vi.fn();
const prepareBrowserAudioPreviewSourcesMock = vi.mocked(
	prepareBrowserAudioPreviewSources,
);
type PrepareAudioPreviewSourcesRequest = Parameters<
	typeof prepareBrowserAudioPreviewSources
>[0];

beforeEach(() => {
	vi.stubGlobal("URL", {
		createObjectURL,
		revokeObjectURL,
	});
	adapterMockState.previewAudioEngines.length = 0;
	adapterMockState.mediaPlayerRenderCount = 0;
	adapterMockState.previewAudioEngineCreate.mockReset();
	adapterMockState.previewAudioEngineCreate.mockImplementation(async () => {
		let currentTimeSeconds = 0;
		const previewAudioEngine = {
			destroy: vi.fn(),
			getCurrentTime: vi.fn(() => currentTimeSeconds),
			pause: vi.fn(),
			play: vi.fn(),
			readMeterSnapshot: vi.fn(() => emptyMeterSnapshot),
			setPlaybackRate: vi.fn(),
			setCurrentTimeSeconds(nextCurrentTimeSeconds: number) {
				currentTimeSeconds = nextCurrentTimeSeconds;
			},
			setOutputGain: vi.fn(),
			setTime: vi.fn(),
			setTrackChannelMode: vi.fn(),
			setTrackMonitorGain: vi.fn(),
			setTrackVolumeGain: vi.fn(),
		};
		adapterMockState.previewAudioEngines.push(previewAudioEngine);

		return previewAudioEngine;
	});
	Object.defineProperty(HTMLMediaElement.prototype, "play", {
		configurable: true,
		value: play,
	});
	Object.defineProperty(HTMLMediaElement.prototype, "pause", {
		configurable: true,
		value: pause,
	});
	createObjectURL.mockClear();
	revokeObjectURL.mockClear();
	play.mockClear();
	pause.mockClear();
	prepareBrowserAudioPreviewSourcesMock.mockReset();
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("NativePreviewPlayer", () => {
	it("does not rerender the media player when parent state changes but player props are stable", async () => {
		const stableCallbacks = {
			onSelectionEndRequested: vi.fn(),
			onSelectionRangeMoveRequested: vi.fn(),
			onSelectionResetRequested: vi.fn(),
			onSelectionStartRequested: vi.fn(),
		};
		const view = renderPlayer(stableCallbacks);

		await waitFor(() => {
			expect(screen.getByLabelText("Preview for clip.mp4")).toBeTruthy();
		});
		const renderCountAfterMount = adapterMockState.mediaPlayerRenderCount;

		view.rerender(createPlayerElement(stableCallbacks));

		expect(adapterMockState.mediaPlayerRenderCount).toBe(renderCountAfterMount);
	});

	it("owns the preview object URL and native video element lifecycle", () => {
		const { unmount } = renderPlayer();

		const video = screen.getByLabelText("Preview for clip.mp4");

		expect(createObjectURL).toHaveBeenCalledWith(previewSource);
		expect(video).toBeInstanceOf(HTMLVideoElement);
		expect(video.getAttribute("src")).toBe("blob:preview-source");

		unmount();

		expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview-source");
	});

	it("registers the preview object URL with the active Media asset cleanup scope", () => {
		const controller = createActiveMediaAssetCleanupScopeController();
		const activeMediaAssetCleanupScope = controller.replaceCurrentScope(
			readyAsset.id,
		);

		renderPlayer({ activeMediaAssetCleanupScope });

		expect(createObjectURL).toHaveBeenCalledWith(previewSource);

		controller.disposeCurrentScope();
		controller.disposeCurrentScope();

		expect(revokeObjectURL).toHaveBeenCalledTimes(1);
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview-source");
	});

	it("renders preview and transport as separate workbench chrome regions", async () => {
		const getBoundingClientRect = vi
			.spyOn(HTMLElement.prototype, "getBoundingClientRect")
			.mockImplementation(function getElementRect(this: HTMLElement) {
				if (this.getAttribute("aria-label") === "Preview viewer surface") {
					return createTestDomRect({ height: 300, width: 900 });
				}

				return createTestDomRect({ height: 0, width: 0 });
			});

		try {
			renderPlayer();

			const previewLayout = screen.getByLabelText(
				"Preview and selection layout",
			);
			expect(previewLayout.getAttribute("data-panel-group-direction")).toBe(
				"vertical",
			);
			expect(previewLayout.className).toContain("xl:h-full");
			expect(
				screen.getByLabelText("Resize selection region").className,
			).toContain("bg-workbench-border-strong");

			const centerRegion = screen.getByLabelText("Workbench center region");
			const nativePreview = within(centerRegion).getByLabelText(
				"Native preview player",
			);
			const viewerHeader = within(nativePreview).getByLabelText(
				"Preview viewer header",
			);
			const viewerSurface = within(nativePreview).getByLabelText(
				"Preview viewer surface",
			);
			const aperture = within(viewerSurface).getByLabelText("Preview aperture");
			const transportRegion = screen.getByLabelText(
				"Workbench transport region",
			);
			const transportControls = within(transportRegion).getByLabelText(
				"Preview transport controls",
			);
			const primaryControls = within(transportControls).getByLabelText(
				"Primary preview controls",
			);
			const playbackSettings = within(transportControls).getByLabelText(
				"Preview playback settings",
			);

			expect(centerRegion.className).toContain("bg-workbench-viewer");
			expect(nativePreview.className).toContain("h-full");
			expect(nativePreview.className).toContain("min-h-0");
			expect(nativePreview.className).not.toContain("min-h-full");
			expect(viewerHeader.className).toContain("border-workbench-border");
			expect(viewerHeader.textContent).not.toContain("clip.mp4");
			expect(within(viewerHeader).queryByText("Program viewer")).toBeNull();
			expect(
				within(viewerHeader).getByText("1x").parentElement?.className,
			).toContain("whitespace-nowrap");
			expect(viewerSurface.className).toContain("bg-workbench-viewer");
			expect(aperture.className).toContain("border-workbench-border-strong");
			expect(aperture.className).toContain("max-h-full");
			expect(aperture.className).not.toContain("max-w-5xl");
			expect(aperture.style.aspectRatio).toBe(String(16 / 9));
			await waitFor(() => {
				expect(aperture.style.width).toBe("533.333333px");
				expect(aperture.style.height).toBe("300px");
			});
			expect(
				within(aperture).getByLabelText("Preview for clip.mp4").className,
			).toContain("object-contain");
			expect(
				within(aperture).getByLabelText("Preview for clip.mp4").className,
			).not.toContain("object-cover");
			expect(transportRegion.className).toContain("bg-workbench-transport");
			expect(transportRegion.className).not.toContain("xl:row-start-2");
			expect(transportRegion.className).not.toContain("xl:col-span-2");
			expect(transportControls.className).toContain("grid");
			expect(primaryControls.className).toContain("justify-start");
			expect(
				within(primaryControls)
					.getByRole("button", { name: "Loop selection" })
					.getAttribute("aria-pressed"),
			).toBe("false");
			expect(
				within(transportControls).queryByLabelText(
					"Preview media-time readouts",
				),
			).toBeNull();
			expect(playbackSettings.className).toContain("justify-end");
			expect(
				within(centerRegion).queryByLabelText("Preview transport controls"),
			).toBeNull();
			expect(
				screen.getByLabelText("Workbench selection region").className,
			).not.toContain("xl:row-start-3");
			expect(
				within(centerRegion)
					.getByTestId("mock-default-video-layout")
					.getAttribute("data-mute-button-hidden"),
			).toBe("true");
			expect(
				within(centerRegion)
					.getByTestId("mock-default-video-layout")
					.getAttribute("data-volume-slider-hidden"),
			).toBe("true");
			expect(
				within(centerRegion)
					.getByTestId("mock-default-video-layout")
					.getAttribute("data-large-mute-button-hidden"),
			).toBe("true");
			expect(
				within(centerRegion)
					.getByTestId("mock-default-video-layout")
					.getAttribute("data-large-volume-slider-hidden"),
			).toBe("true");
			expect(
				within(centerRegion)
					.getByTestId("mock-default-video-layout")
					.getAttribute("data-small-mute-button-hidden"),
			).toBe("true");
			expect(
				within(centerRegion)
					.getByTestId("mock-default-video-layout")
					.getAttribute("data-small-volume-slider-hidden"),
			).toBe("true");
			expect(
				within(viewerHeader).getByRole("button", {
					name: "Open fullscreen preview",
				}),
			).toBeTruthy();
		} finally {
			getBoundingClientRect.mockRestore();
		}
	});

	it("drives play, pause, seek, speed, volume, mute, and frame-step through native video commands", async () => {
		renderPlayer();

		const video = screen.getByLabelText(
			"Preview for clip.mp4",
		) as HTMLVideoElement;

		fireEvent.click(screen.getByRole("button", { name: "Play" }));
		await waitFor(() => {
			expect(play).toHaveBeenCalledTimes(1);
		});

		fireEvent.click(screen.getByRole("button", { name: "Pause" }));
		expect(pause).toHaveBeenCalledTimes(1);

		fireEvent.click(
			screen.getByRole("button", { name: "Seek forward 10 seconds" }),
		);
		expect(video.currentTime).toBe(10);

		fireEvent.click(
			screen.getByRole("button", { name: "Step forward one frame" }),
		);
		expect(video.currentTime).toBeCloseTo(10.033333, 5);

		fireEvent.click(
			screen.getByRole("button", { name: "Seek backward 1 second" }),
		);
		expect(video.currentTime).toBeCloseTo(9.033333, 5);

		fireEvent.change(screen.getByLabelText("Playback speed"), {
			target: { value: "1.5" },
		});
		expect(video.playbackRate).toBe(1.5);

		fireEvent.change(screen.getByLabelText("Preview volume"), {
			target: { value: "25" },
		});
		expect(video.volume).toBe(0.25);

		fireEvent.click(screen.getByRole("button", { name: "Mute preview audio" }));
		expect(video.muted).toBe(true);
	});

	it("keeps audio preview preparation visible while blocking pending audio-master playback", async () => {
		const pendingAudioPreview =
			createDeferred<BrowserAudioPreviewSourcesResult>();
		prepareBrowserAudioPreviewSourcesMock.mockReturnValueOnce(
			pendingAudioPreview.promise,
		);
		vi.stubGlobal("AudioContext", class AudioContext {});

		renderPlayer({ asset: readyAssetWithAudio });

		await waitFor(() => {
			expect(prepareBrowserAudioPreviewSourcesMock).toHaveBeenCalledTimes(1);
		});
		expect(screen.getByText("Preparing audio")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Play" }));

		expect(play).not.toHaveBeenCalled();
		expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
	});

	it("blocks playback while required custom audio monitoring is pending", async () => {
		const pendingAudioPreview =
			createDeferred<BrowserAudioPreviewSourcesResult>();
		prepareBrowserAudioPreviewSourcesMock.mockReturnValueOnce(
			pendingAudioPreview.promise,
		);
		vi.stubGlobal("AudioContext", class AudioContext {});

		render(<AudioMasterPlayerProbe asset={readyAssetWithAudio} />);

		await waitFor(() => {
			expect(prepareBrowserAudioPreviewSourcesMock).toHaveBeenCalledTimes(1);
		});

		fireEvent.click(
			screen.getByRole("button", {
				name: "Set Voice track volume to 50%",
			}),
		);
		fireEvent.click(screen.getByRole("button", { name: "Play" }));

		expect(play).not.toHaveBeenCalled();
		expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
	});

	it("applies preview and audio mix controls through the Preview audio engine", async () => {
		vi.stubGlobal("AudioContext", class AudioContext {});
		prepareBrowserAudioPreviewSourcesMock.mockImplementation(async (request) =>
			createPreparedAudioPreviewSourcesForRequest(request),
		);

		render(<AudioMasterPlayerProbe />);

		const video = screen.getByLabelText(
			"Preview for clip.mp4",
		) as HTMLVideoElement;

		await waitFor(() => {
			expect(adapterMockState.previewAudioEngines).toHaveLength(1);
		});
		const previewAudioEngine = adapterMockState.previewAudioEngines[0];

		await waitFor(() => {
			expect(lastTrackGain(previewAudioEngine, 0)).toBe(1);
			expect(lastTrackGain(previewAudioEngine, 1)).toBe(1);
		});
		expect(lastOutputGain(previewAudioEngine)).toBe(1);
		expect(video.muted).toBe(true);
		expect(readAudioMixSnapshot()).toBe(
			"audio-1:true:preserve:100|audio-2:true:preserve:100",
		);

		fireEvent.change(screen.getByLabelText("Preview volume"), {
			target: { value: "50" },
		});

		await waitFor(() => {
			expect(lastOutputGain(previewAudioEngine)).toBeCloseTo(0.5);
		});
		expect(lastTrackGain(previewAudioEngine, 0)).toBe(1);
		expect(lastTrackGain(previewAudioEngine, 1)).toBe(1);

		fireEvent.change(screen.getByLabelText("Playback speed"), {
			target: { value: "1.5" },
		});

		expect(video.playbackRate).toBe(1.5);
		expect(previewAudioEngine.setPlaybackRate).toHaveBeenCalledWith(1.5);

		fireEvent.click(screen.getByRole("button", { name: "Mute preview audio" }));

		await waitFor(() => {
			expect(lastOutputGain(previewAudioEngine)).toBe(0);
		});
		expect(lastTrackGain(previewAudioEngine, 0)).toBe(1);
		expect(lastTrackGain(previewAudioEngine, 1)).toBe(1);
		expect(video.muted).toBe(true);
		expect(readAudioMixSnapshot()).toBe(
			"audio-1:true:preserve:100|audio-2:true:preserve:100",
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Unmute preview audio" }),
		);
		fireEvent.click(
			screen.getByRole("button", {
				name: "Set Voice track volume to 50%",
			}),
		);

		await waitFor(() => {
			expect(lastOutputGain(previewAudioEngine)).toBeCloseTo(0.5);
			expect(lastTrackGain(previewAudioEngine, 0)).toBeCloseTo(0.25);
			expect(lastTrackGain(previewAudioEngine, 1)).toBe(1);
		});
		expect(readAudioMixSnapshot()).toBe(
			"audio-1:true:preserve:50|audio-2:true:preserve:100",
		);
		expect(video.muted).toBe(true);

		fireEvent.click(
			screen.getByRole("button", { name: "Exclude Voice from output" }),
		);

		await waitFor(() => {
			expect(lastTrackGain(previewAudioEngine, 0)).toBe(0);
			expect(lastTrackGain(previewAudioEngine, 1)).toBe(1);
		});

		fireEvent.click(
			screen.getByRole("button", { name: "Solo Voice for preview" }),
		);

		await waitFor(() => {
			expect(lastTrackGain(previewAudioEngine, 0)).toBeCloseTo(0.25);
			expect(lastTrackGain(previewAudioEngine, 1)).toBe(0);
		});
		expect(readAudioMixSnapshot()).toBe(
			"audio-1:false:preserve:50|audio-2:true:preserve:100",
		);
		expect(prepareBrowserAudioPreviewSourcesMock).toHaveBeenCalledTimes(1);

		fireEvent.click(
			screen.getByRole("button", {
				name: "Set Voice channel handling to left mono",
			}),
		);

		await waitFor(() => {
			expect(previewAudioEngine.setTrackChannelMode).toHaveBeenCalledWith(
				0,
				"use-left-as-mono",
			);
		});
		expect(prepareBrowserAudioPreviewSourcesMock).toHaveBeenCalledTimes(1);
	});

	it("keeps sync fixture preview aligned after audio mix changes", async () => {
		const { frameCallbacks, requestAnimationFrame } =
			stubPreviewAnimationFrames();
		const syncFixture = syncFlashClickFixture();
		const syncEvent = syncFixture.expected.syncEventsUs?.[2];
		const onPreviewPlayheadChange = vi.fn();

		if (!syncEvent) {
			throw new Error("Expected the sync fixture to define a third event.");
		}

		vi.stubGlobal("AudioContext", class AudioContext {});
		prepareBrowserAudioPreviewSourcesMock.mockImplementation(async (request) =>
			createPreparedAudioPreviewSourcesForRequest(request),
		);

		render(
			<AudioMasterPlayerProbe
				asset={readySyncAssetWithTwoAudioTracks}
				onPreviewPlayheadChange={onPreviewPlayheadChange}
				selection={syncFixture.selections.full}
				source={syncPreviewSource}
			/>,
		);

		await waitFor(() => {
			expect(adapterMockState.previewAudioEngines).toHaveLength(1);
		});

		fireEvent.click(
			screen.getByRole("button", {
				name: "Set Voice track volume to 50%",
			}),
		);
		fireEvent.click(
			screen.getByRole("button", { name: "Exclude Voice from output" }),
		);
		fireEvent.click(
			screen.getByRole("button", { name: "Solo Voice for preview" }),
		);
		fireEvent.click(
			screen.getByRole("button", {
				name: "Set Voice channel handling to left mono",
			}),
		);

		await waitFor(() => {
			expect(
				adapterMockState.previewAudioEngines[0]?.setTrackChannelMode,
			).toHaveBeenCalledWith(0, "use-left-as-mono");
		});
		expect(prepareBrowserAudioPreviewSourcesMock).toHaveBeenCalledTimes(1);
		expect(adapterMockState.previewAudioEngines).toHaveLength(1);

		const previewAudioEngine = adapterMockState.previewAudioEngines[0];

		const video = screen.getByLabelText(
			"Preview for sync-flash-click.mp4",
		) as HTMLVideoElement;

		fireEvent.click(screen.getByRole("button", { name: "Play" }));
		await waitFor(() => {
			expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
		});

		video.currentTime = 0;
		previewAudioEngine.setCurrentTimeSeconds(
			syncEvent.audioClickUs / 1_000_000,
		);
		runNextPreviewFrame(frameCallbacks);

		expect(video.currentTime).toBe(syncEvent.visualFlashUs / 1_000_000);
		expect(screen.getByLabelText("Preview playhead time").textContent).toBe(
			"00:00:03.000",
		);
		expect(onPreviewPlayheadChange).toHaveBeenCalledWith(
			syncEvent.audioClickUs,
		);
	});

	it("keeps Playhead seek, Selection commit, and Selection range move channels separate in the lower region", () => {
		const onSelectionEndRequested = vi.fn();
		const onSelectionRangeMoveRequested = vi.fn();
		const onSelectionStartRequested = vi.fn();
		const getBoundingClientRect = vi
			.spyOn(HTMLElement.prototype, "getBoundingClientRect")
			.mockImplementation(function getElementRect(this: HTMLElement) {
				if (this.dataset.testid === "selection-timeline-track") {
					return createTestDomRect({ height: 80, width: 1200 });
				}

				return createTestDomRect({ height: 0, width: 0 });
			});

		try {
			renderPlayer({
				onSelectionEndRequested,
				onSelectionRangeMoveRequested,
				onSelectionStartRequested,
				selection: {
					endUs: 8_000_000,
					startUs: 2_000_000,
				},
			});

			const video = screen.getByLabelText(
				"Preview for clip.mp4",
			) as HTMLVideoElement;

			fireEvent.mouseDown(screen.getByLabelText("Seek timeline ruler"), {
				clientX: 600,
			});
			expect(video.currentTime).toBe(6);
			expect(onSelectionStartRequested).not.toHaveBeenCalled();
			expect(onSelectionEndRequested).not.toHaveBeenCalled();
			expect(onSelectionRangeMoveRequested).not.toHaveBeenCalled();

			fireEvent.mouseDown(screen.getByLabelText("Selection start handle"), {
				clientX: 200,
			});
			fireEvent.mouseUp(window, { clientX: 300 });
			expect(video.currentTime).toBe(3);
			expect(onSelectionStartRequested).toHaveBeenCalledWith(3_000_000);
			expect(onSelectionEndRequested).not.toHaveBeenCalled();
			expect(onSelectionRangeMoveRequested).not.toHaveBeenCalled();

			fireEvent.mouseDown(screen.getByLabelText("Selection end handle"), {
				clientX: 800,
			});
			fireEvent.mouseUp(window, { clientX: 900 });
			expect(video.currentTime).toBe(9);
			expect(onSelectionEndRequested).toHaveBeenCalledWith(9_000_000);
			expect(onSelectionRangeMoveRequested).not.toHaveBeenCalled();

			fireEvent.mouseDown(screen.getByLabelText("Move selection range"), {
				clientX: 200,
			});
			fireEvent.mouseUp(window, { clientX: 500 });
			expect(onSelectionRangeMoveRequested).toHaveBeenCalledWith(3_000_000);
		} finally {
			getBoundingClientRect.mockRestore();
		}
	});

	it("loops inside the selection only after playback enters the selected range", async () => {
		const { frameCallbacks, requestAnimationFrame } =
			stubPreviewAnimationFrames();
		renderPlayer({
			selection: {
				endUs: 8_000_000,
				startUs: 4_000_000,
			},
		});

		const video = screen.getByLabelText(
			"Preview for clip.mp4",
		) as HTMLVideoElement;
		const loopButton = screen.getByRole("button", {
			name: "Loop selection",
		});

		expect(loopButton.getAttribute("aria-pressed")).toBe("false");
		fireEvent.click(loopButton);
		expect(loopButton.getAttribute("aria-pressed")).toBe("true");

		video.currentTime = 2;
		fireEvent.click(screen.getByRole("button", { name: "Play" }));

		await waitFor(() => {
			expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
		});
		runNextPreviewFrame(frameCallbacks);
		expect(video.currentTime).toBe(2);
		expect(screen.getByLabelText("Preview playhead time").textContent).toBe(
			"00:00:02.000",
		);

		video.currentTime = 4.5;
		runNextPreviewFrame(frameCallbacks);
		expect(video.currentTime).toBe(4.5);

		video.currentTime = 8.1;
		runNextPreviewFrame(frameCallbacks);
		expect(video.currentTime).toBe(4);
		expect(screen.getByLabelText("Preview playhead time").textContent).toBe(
			"00:00:04.000",
		);
	});

	it("does not jump backward when playback starts after the selection", async () => {
		const { frameCallbacks, requestAnimationFrame } =
			stubPreviewAnimationFrames();
		renderPlayer({
			selection: {
				endUs: 8_000_000,
				startUs: 4_000_000,
			},
		});

		const video = screen.getByLabelText(
			"Preview for clip.mp4",
		) as HTMLVideoElement;

		fireEvent.click(screen.getByRole("button", { name: "Loop selection" }));
		fireEvent.click(
			screen.getByRole("button", { name: "Seek forward 10 seconds" }),
		);
		expect(video.currentTime).toBe(10);
		fireEvent.click(screen.getByRole("button", { name: "Play" }));

		await waitFor(() => {
			expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
		});
		runNextPreviewFrame(frameCallbacks);

		expect(video.currentTime).toBe(10);

		video.currentTime = 12;
		fireEvent.ended(video);

		expect(video.currentTime).toBe(12);
		expect(play).toHaveBeenCalledTimes(1);
		expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
	});

	it("re-evaluates loop entry when the selection changes", async () => {
		const { frameCallbacks, requestAnimationFrame } =
			stubPreviewAnimationFrames();
		const view = renderPlayer({
			selection: {
				endUs: 8_000_000,
				startUs: 4_000_000,
			},
		});

		const video = screen.getByLabelText(
			"Preview for clip.mp4",
		) as HTMLVideoElement;

		fireEvent.click(screen.getByRole("button", { name: "Loop selection" }));
		video.currentTime = 4.5;
		fireEvent.click(screen.getByRole("button", { name: "Play" }));

		await waitFor(() => {
			expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
		});
		runNextPreviewFrame(frameCallbacks);
		expect(video.currentTime).toBe(4.5);

		view.rerender(
			createPlayerElement({
				selection: {
					endUs: 11_000_000,
					startUs: 9_000_000,
				},
			}),
		);
		expect(
			screen
				.getByRole("button", { name: "Loop selection" })
				.getAttribute("aria-pressed"),
		).toBe("true");

		video.currentTime = 8.5;
		runNextPreviewFrame(frameCallbacks);
		expect(video.currentTime).toBe(8.5);

		video.currentTime = 11.2;
		runNextPreviewFrame(frameCallbacks);
		expect(video.currentTime).toBe(9);
	});

	it("resets selection loop for each preview source", async () => {
		const nextSource = new File(["next video"], "next.mp4", {
			type: "video/mp4",
		});
		const view = renderPlayer();

		fireEvent.click(screen.getByRole("button", { name: "Loop selection" }));
		expect(
			screen
				.getByRole("button", { name: "Loop selection" })
				.getAttribute("aria-pressed"),
		).toBe("true");

		view.rerender(createPlayerElement({ source: nextSource }));

		await waitFor(() => {
			expect(
				screen
					.getByRole("button", { name: "Loop selection" })
					.getAttribute("aria-pressed"),
			).toBe("false");
		});
		expect(createObjectURL).toHaveBeenCalledWith(nextSource);
	});

	it("samples the native video clock on animation frames while playing", async () => {
		const { frameCallbacks, requestAnimationFrame } =
			stubPreviewAnimationFrames();

		renderPlayer();

		const video = screen.getByLabelText(
			"Preview for clip.mp4",
		) as HTMLVideoElement;

		fireEvent.click(screen.getByRole("button", { name: "Play" }));

		await waitFor(() => {
			expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
		});
		expect(screen.getByLabelText("Playhead handle").className).toContain(
			"transition-none",
		);

		video.currentTime = 1.25;
		runNextPreviewFrame(frameCallbacks);

		expect(screen.getByLabelText("Preview playhead time").textContent).toBe(
			"00:00:01.250",
		);
		expect(screen.getAllByText("00:00:01.250").length).toBe(1);
		expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
	});

	it("does not rerender the media player for playback ticks after a timeline seek", async () => {
		const { frameCallbacks, requestAnimationFrame } =
			stubPreviewAnimationFrames();
		const getBoundingClientRect = vi
			.spyOn(HTMLElement.prototype, "getBoundingClientRect")
			.mockImplementation(function getElementRect(this: HTMLElement) {
				if (this.dataset.testid === "selection-timeline-track") {
					return createTestDomRect({ height: 80, width: 1200 });
				}

				return createTestDomRect({ height: 0, width: 0 });
			});

		try {
			renderPlayer();

			const video = screen.getByLabelText(
				"Preview for clip.mp4",
			) as HTMLVideoElement;

			fireEvent.mouseDown(screen.getByLabelText("Seek timeline ruler"), {
				clientX: 600,
			});
			expect(video.currentTime).toBe(6);

			fireEvent.click(screen.getByRole("button", { name: "Play" }));

			await waitFor(() => {
				expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
			});
			const mediaPlayerRenderCountAfterPlaybackStart =
				adapterMockState.mediaPlayerRenderCount;

			video.currentTime = 6.25;
			runNextPreviewFrame(frameCallbacks);

			expect(screen.getByLabelText("Preview playhead time").textContent).toBe(
				"00:00:06.250",
			);
			expect(adapterMockState.mediaPlayerRenderCount).toBe(
				mediaPlayerRenderCountAfterPlaybackStart,
			);
		} finally {
			getBoundingClientRect.mockRestore();
		}
	});

	it("requests fullscreen when the native video API is available", () => {
		const requestFullscreen = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(HTMLVideoElement.prototype, "requestFullscreen", {
			configurable: true,
			value: requestFullscreen,
		});

		renderPlayer();

		const fullscreenButton = screen.getByRole("button", {
			name: "Open fullscreen preview",
		});

		expect(fullscreenButton.hasAttribute("disabled")).toBe(false);
		fireEvent.click(fullscreenButton);

		expect(requestFullscreen).toHaveBeenCalledTimes(1);
	});

	it("dispatches page-level shortcuts without moving the playhead for bracket selection commands", async () => {
		const onSelectionStartRequested = vi.fn();
		const onSelectionEndRequested = vi.fn();
		renderPlayer({
			onSelectionEndRequested,
			onSelectionStartRequested,
		});

		const video = screen.getByLabelText(
			"Preview for clip.mp4",
		) as HTMLVideoElement;

		fireEvent.keyDown(window, { code: "KeyL", key: "l" });
		expect(video.currentTime).toBe(10);

		fireEvent.keyDown(window, { code: "BracketLeft", key: "[" });
		expect(onSelectionStartRequested).toHaveBeenCalledWith(10_000_000);
		expect(video.currentTime).toBe(10);

		fireEvent.keyDown(window, { code: "BracketRight", key: "]" });
		expect(onSelectionEndRequested).toHaveBeenCalledWith(10_000_000);

		fireEvent.keyDown(window, {
			code: "ArrowRight",
			key: "ArrowRight",
			shiftKey: true,
		});
		expect(video.currentTime).toBeCloseTo(10.033333, 5);
	});
});

const previewSource = new File(["video"], "clip.mp4", { type: "video/mp4" });

function renderPlayer(
	props: Partial<React.ComponentProps<typeof NativePreviewPlayer>> = {},
) {
	return render(createPlayerElement(props));
}

function createPlayerElement(
	props: Partial<React.ComponentProps<typeof NativePreviewPlayer>> = {},
) {
	return (
		<NativePreviewPlayer
			asset={readyAsset}
			onSelectionEndRequested={() => {}}
			onSelectionRangeMoveRequested={() => {}}
			onSelectionResetRequested={() => {}}
			onSelectionStartRequested={() => {}}
			selection={selection}
			source={previewSource}
			{...props}
		/>
	);
}

function AudioMasterPlayerProbe({
	asset = readyAssetWithTwoAudioTracks,
	onPreviewPlayheadChange,
	selection: playerSelection = selection,
	source = previewSource,
}: {
	asset?: ReadyMediaAsset;
	onPreviewPlayheadChange?: (playheadUs: MediaTimeUs) => void;
	selection?: Selection;
	source?: Blob;
} = {}) {
	const [audioMix, setAudioMix] = useState(() => createDefaultAudioMix(asset));

	return (
		<>
			<NativePreviewPlayer
				asset={asset}
				audioMix={audioMix}
				onAudioTrackIncludedChange={(trackId, include) => {
					setAudioMix((currentAudioMix) =>
						updateAudioMixTrack(currentAudioMix, trackId, { include }),
					);
				}}
				onPreviewPlayheadChange={onPreviewPlayheadChange}
				onSelectionEndRequested={() => {}}
				onSelectionRangeMoveRequested={() => {}}
				onSelectionResetRequested={() => {}}
				onSelectionStartRequested={() => {}}
				selection={playerSelection}
				source={source}
			/>
			<button
				onClick={() => {
					setAudioMix((currentAudioMix) =>
						updateAudioMixTrack(currentAudioMix, "audio-1", {
							volumePercent: 50,
						}),
					);
				}}
				type="button"
			>
				Set Voice track volume to 50%
			</button>
			<button
				onClick={() => {
					setAudioMix((currentAudioMix) =>
						updateAudioMixTrack(currentAudioMix, "audio-1", {
							channelMode: "use-left-as-mono",
						}),
					);
				}}
				type="button"
			>
				Set Voice channel handling to left mono
			</button>
			<output aria-label="audio mix snapshot">
				{formatAudioMixSnapshot(audioMix)}
			</output>
		</>
	);
}

function updateAudioMixTrack(
	audioMix: AudioMix,
	trackId: string,
	patch: Partial<AudioMix["tracks"][string]>,
): AudioMix {
	const currentDecision = audioMix.tracks[trackId];

	if (!currentDecision) {
		return audioMix;
	}

	return {
		...audioMix,
		tracks: {
			...audioMix.tracks,
			[trackId]: {
				...currentDecision,
				...patch,
			},
		},
	};
}

function formatAudioMixSnapshot(audioMix: AudioMix) {
	return Object.values(audioMix.tracks)
		.map(
			(decision) =>
				`${decision.trackId}:${decision.include}:${decision.channelMode}:${decision.volumePercent}`,
		)
		.join("|");
}

function readAudioMixSnapshot() {
	return screen.getByLabelText("audio mix snapshot").textContent ?? "";
}

const emptyMeterSnapshot: PreviewAudioEngineMeterSnapshot = {
	combinedState: {
		channels: [],
		partial: false,
		status: "ready",
	},
	trackStates: {},
};

function lastTrackGain(
	previewAudioEngine: (typeof adapterMockState.previewAudioEngines)[number],
	trackIndex: number,
) {
	return (
		lastTrackVolumeGain(previewAudioEngine, trackIndex) *
		lastTrackMonitorGain(previewAudioEngine, trackIndex)
	);
}

function lastTrackVolumeGain(
	previewAudioEngine: (typeof adapterMockState.previewAudioEngines)[number],
	trackIndex: number,
) {
	const calls = previewAudioEngine.setTrackVolumeGain.mock.calls.filter(
		([candidateTrackIndex]) => candidateTrackIndex === trackIndex,
	);
	const lastCall = calls.at(-1);

	if (!lastCall) {
		throw new Error(`No volume gain call found for track ${trackIndex}.`);
	}

	return lastCall[1];
}

function lastTrackMonitorGain(
	previewAudioEngine: (typeof adapterMockState.previewAudioEngines)[number],
	trackIndex: number,
) {
	const calls = previewAudioEngine.setTrackMonitorGain.mock.calls.filter(
		([candidateTrackIndex]) => candidateTrackIndex === trackIndex,
	);
	const lastCall = calls.at(-1);

	if (!lastCall) {
		throw new Error(`No monitor gain call found for track ${trackIndex}.`);
	}

	return lastCall[1];
}

function lastOutputGain(
	previewAudioEngine: (typeof adapterMockState.previewAudioEngines)[number],
) {
	const lastCall = previewAudioEngine.setOutputGain.mock.calls.at(-1);

	if (!lastCall) {
		throw new Error("No output gain call found.");
	}

	return lastCall[0];
}

function stubPreviewAnimationFrames() {
	const frameCallbacks: FrameRequestCallback[] = [];
	const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
		frameCallbacks.push(callback);
		return frameCallbacks.length;
	});
	const cancelAnimationFrame = vi.fn();
	vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
	vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);

	return {
		cancelAnimationFrame,
		frameCallbacks,
		requestAnimationFrame,
	};
}

function runNextPreviewFrame(frameCallbacks: FrameRequestCallback[]) {
	act(() => {
		frameCallbacks.shift()?.(16);
	});
}

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});

	return {
		promise,
		reject,
		resolve,
	};
}

function createTestDomRect({
	height,
	width,
}: {
	height: number;
	width: number;
}): DOMRect {
	return {
		bottom: height,
		height,
		left: 0,
		right: width,
		toJSON: () => ({}),
		top: 0,
		width,
		x: 0,
		y: 0,
	} as DOMRect;
}

function createPreparedAudioPreviewSourcesForRequest(
	request: PrepareAudioPreviewSourcesRequest,
): BrowserAudioPreviewSourcesResult {
	const requestedTrackIds = request.trackIds
		? Array.from(request.trackIds)
		: request.asset.tracks.audio.map((track) => track.id);

	return {
		failures: [],
		sources: requestedTrackIds.map((trackId, sourceIndex) => {
			const track = request.asset.tracks.audio.find(
				(candidateTrack) => candidateTrack.id === trackId,
			);
			const channelMode =
				request.audioMix.tracks[trackId]?.channelMode ?? "preserve";

			if (!track) {
				throw new Error(`Expected audio track ${trackId}.`);
			}

			return {
				blob: new Blob(["audio"], { type: "audio/mp4" }),
				byteLength: 5,
				downloadName: `${trackId}.m4a`,
				mimeType: "audio/mp4",
				startPositionSeconds: 0,
				strategy: "same-codec-remux",
				track,
				trackId,
				trackIndex: sourceIndex,
				url: `blob:audio:${request.asset.id}:${trackId}:${channelMode}`,
			} satisfies BrowserAudioPreviewSource;
		}),
	};
}

const readyAsset = {
	durationUs: 12_000_000,
	exportCapability: {
		profile: {
			audioCodec: "aac",
			container: "mp4",
			videoCodec: "h264",
		},
		supported: true,
	},
	frameTiming: {
		fps: 30,
		frameDurationUs: 33_333,
		source: "known",
	},
	id: "asset-1",
	label: "clip.mp4",
	provenance: {
		fileName: "clip.mp4",
		mimeType: "video/mp4",
		sizeBytes: 1_024,
	},
	tracks: {
		audio: [],
		video: [
			{
				id: "video-1",
				kind: "video",
			},
		],
	},
} satisfies ReadyMediaAsset;

const readyAssetWithTwoAudioTracks = {
	...readyAsset,
	tracks: {
		...readyAsset.tracks,
		audio: [
			{
				codec: "aac",
				id: "audio-1",
				kind: "audio",
				label: "Voice",
			},
			{
				codec: "aac",
				id: "audio-2",
				kind: "audio",
				label: "Desktop",
			},
		],
	},
} satisfies ReadyMediaAsset;

const readyAssetWithAudio = {
	...readyAsset,
	tracks: {
		...readyAsset.tracks,
		audio: [
			{
				codec: "aac",
				id: "audio-1",
				kind: "audio",
				label: "Voice",
			},
		],
	},
} satisfies ReadyMediaAsset;

const readySyncAssetWithTwoAudioTracks = {
	...readyAssetWithTwoAudioTracks,
	durationUs: syncFlashClickFixture().expected.durationUs,
	id: "sync-asset",
	label: "sync-flash-click.mp4",
	provenance: {
		fileName: "sync-flash-click.mp4",
		mimeType: "video/mp4",
		sizeBytes: 1_024,
	},
} satisfies ReadyMediaAsset;

const selection = {
	endUs: 12_000_000,
	startUs: 0,
} satisfies Selection;

const syncPreviewSource = new File(["sync video"], "sync-flash-click.mp4", {
	type: "video/mp4",
});

function syncFlashClickFixture() {
	const fixture = EXPORT_CORRECTNESS_FIXTURES.find(
		(candidate) => candidate.id === "mp4-sync-flash-click",
	);

	if (!fixture) {
		throw new Error("Expected the sync flash/click fixture to be registered.");
	}

	return fixture;
}
