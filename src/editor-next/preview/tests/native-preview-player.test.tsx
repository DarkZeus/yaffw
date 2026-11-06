/* @vitest-environment jsdom */
import { createPreviewAudioProviderStub } from "../../audio/tests/preview-audio-test-fixtures";

import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
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
import { PreviewAudioMonitoringProvider } from "../../audio/engine/preview-audio-monitoring-provider";
import { PreviewMeteringProvider } from "../../audio/meters/preview-metering-provider";
import { AudioPanel } from "../../audio/panel/audio-panel";
import type { PreviewAudioEngineMeterSnapshot } from "../../audio/types/preview-audio-engine.types";

type MockMediaPlayerProps = Record<string, unknown> & {
	aspectRatio?: string;
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
		getPresentationTime: ReturnType<typeof vi.fn>;
		pause: ReturnType<typeof vi.fn>;
		play: ReturnType<typeof vi.fn>;
		getStatus: ReturnType<typeof vi.fn>;
		retryTrack: ReturnType<typeof vi.fn>;
		subscribe: ReturnType<typeof vi.fn>;
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

const scrubPreviewMockState = vi.hoisted(() => ({
	providers: [] as Array<{
		dispose: ReturnType<typeof vi.fn>;
		onFrame: (frame: {
			actualTimestampUs: number;
			canvas: HTMLCanvasElement;
			requestId: number;
			requestedAtMs: number;
			timestampUs: number;
		}) => void;
		requestFrame: ReturnType<typeof vi.fn>;
		warm: ReturnType<typeof vi.fn>;
	}>,
}));

vi.mock("../scrub/mediabunny-scrub-frame-provider", () => ({
	createMediabunnyScrubFrameProvider: (options: {
		onFrame: (frame: {
			actualTimestampUs: number;
			canvas: HTMLCanvasElement;
			requestId: number;
			requestedAtMs: number;
			timestampUs: number;
		}) => void;
	}) => {
		let requestId = 0;
		const provider = {
			dispose: vi.fn(),
			onFrame: options.onFrame,
			requestFrame: vi.fn(() => {
				requestId += 1;
				return requestId;
			}),
			warm: vi.fn(),
		};
		scrubPreviewMockState.providers.push(provider);
		return provider;
	},
}));

vi.mock("@vidstack/react", async () => {
	const React = await import("react");
	const MediaPlayer = React.forwardRef<HTMLVideoElement, MockMediaPlayerProps>(
		function MockMediaPlayer(
			{
				aspectRatio,
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
					"data-preview-aspect-ratio": aspectRatio,
					"data-testid": "mock-vidstack-player",
					"data-source-type":
						typeof src === "object" && src && "type" in src
							? String(src.type)
							: undefined,
				},
				React.createElement("video", {
					...props,
					className: "h-full w-full bg-black object-contain",
					crossOrigin: crossOrigin ? "" : undefined,
					ref: (video: HTMLVideoElement | null) => {
						if (video) {
							Object.defineProperty(video, "provider", {
								configurable: true,
								value: { play: () => video.play(), pause: () => video.pause() },
							});
							Object.defineProperty(video, "state", {
								configurable: true,
								get: () => ({ seeking: video.seeking }),
							});
						}
						if (typeof ref === "function") ref(video);
						else if (ref) ref.current = video;
					},
					src: normalizeMockPlayerSrc(src),
				}),
				children as ReactNode,
			);
		},
	);

	return {
		VideoProviderLoader: class {},
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

vi.mock("../../audio/engine/preview-audio-engine", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("../../audio/engine/preview-audio-engine")
		>();

	return {
		...actual,
		canUsePreviewAudioEngine: () => true,
		createPreviewAudioEngine: adapterMockState.previewAudioEngineCreate,
	};
});

vi.mock(
	"../../audio/engine/preview-audio-resources",
	async (importOriginal) => {
		const actual =
			await importOriginal<
				typeof import("../../audio/engine/preview-audio-resources")
			>();

		return {
			...actual,
			preparePreviewAudioResources: vi.fn(),
		};
	},
);

import {
	type PreviewAudioResourcesResult,
	preparePreviewAudioResources,
} from "../../audio/engine/preview-audio-resources";
import type { PreviewAudioResource } from "../../audio/types/preview-audio-resources.types";
import { NativePreviewPlayer } from "../player/native-preview-player";

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
const preparePreviewAudioResourcesMock = vi.mocked(
	preparePreviewAudioResources,
);
type PreparePreviewAudioResourcesRequest = Parameters<
	typeof preparePreviewAudioResources
>[0];

beforeEach(() => {
	vi.stubGlobal("URL", {
		createObjectURL,
		revokeObjectURL,
	});
	adapterMockState.previewAudioEngines.length = 0;
	adapterMockState.mediaPlayerRenderCount = 0;
	scrubPreviewMockState.providers.length = 0;
	adapterMockState.previewAudioEngineCreate.mockReset();
	adapterMockState.previewAudioEngineCreate.mockImplementation(async () => {
		let currentTimeSeconds = 0;
		let playbackState = "paused";
		const listeners = new Set<() => void>();
		const setPlaybackState = (state: string) => {
			playbackState = state;
			for (const listener of listeners) listener();
		};
		const previewAudioEngine = {
			destroy: vi.fn(),
			getCurrentTime: vi.fn(() => currentTimeSeconds),
			getPresentationTime: vi.fn(() => currentTimeSeconds),
			getStatus: vi.fn(() => "ready"),
			getPlaybackState: vi.fn(() => playbackState),
			getMetrics: vi.fn(),
			retryTrack: vi.fn(async () => {}),
			setPlaybackEnd: vi.fn(),
			subscribe: vi.fn((listener: () => void) => {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			}),
			pause: vi.fn(() => setPlaybackState("paused")),
			play: vi.fn(async () => setPlaybackState("playing")),
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
	preparePreviewAudioResourcesMock.mockReset();
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("NativePreviewPlayer", () => {
	it("keeps paused seek commands on the scrub preview and synchronizes native video on play", async () => {
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
		expect(video.currentTime).toBe(0);
		expect(
			scrubPreviewMockState.providers[0]?.requestFrame,
		).toHaveBeenCalledWith(10_000_000, { priority: "final" });

		fireEvent.click(
			screen.getByRole("button", { name: "Step forward one frame" }),
		);
		expect(video.currentTime).toBe(0);
		expect(
			scrubPreviewMockState.providers[0]?.requestFrame,
		).toHaveBeenCalledWith(10_033_333, { priority: "final" });

		fireEvent.click(
			screen.getByRole("button", { name: "Seek backward 1 second" }),
		);
		expect(video.currentTime).toBe(0);

		fireEvent.click(screen.getByRole("button", { name: "Play" }));
		expect(video.currentTime).toBeCloseTo(9.033333, 5);
		await waitFor(() => {
			expect(play).toHaveBeenCalledTimes(2);
		});

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

	it("retains the displayed scrub frame through a pending seek and native playback handoff", async () => {
		const context = {
			clearRect: vi.fn(),
			drawImage: vi.fn(),
		};
		const getContext = vi
			.spyOn(HTMLCanvasElement.prototype, "getContext")
			.mockReturnValue(context as unknown as CanvasRenderingContext2D);

		try {
			renderPlayer();
			const video = screen.getByLabelText(
				"Preview for clip.mp4",
			) as HTMLVideoElement;
			const overlay = screen.getByTestId("scrub-preview-canvas");

			fireEvent.click(
				screen.getByRole("button", { name: "Seek forward 10 seconds" }),
			);
			expect(video.currentTime).toBe(0);
			const provider = scrubPreviewMockState.providers[0];
			const decodedCanvas = document.createElement("canvas");
			decodedCanvas.width = 640;
			decodedCanvas.height = 360;

			act(() => {
				provider?.onFrame({
					actualTimestampUs: 10_000_000,
					canvas: decodedCanvas,
					requestId: 1,
					requestedAtMs: 0,
					timestampUs: 10_000_000,
				});
			});

			await waitFor(() => {
				expect(overlay.className).toContain("block");
				expect(overlay.className).not.toContain("hidden");
			});
			expect(context.drawImage).toHaveBeenCalled();
			context.drawImage.mockClear();
			context.clearRect.mockClear();

			fireEvent.click(
				screen.getByRole("button", { name: "Seek backward 1 second" }),
			);
			expect(provider?.requestFrame).toHaveBeenLastCalledWith(9_000_000, {
				priority: "final",
			});
			expect(video.currentTime).toBe(0);
			expect(overlay.className).toContain("block");
			expect(context.drawImage).not.toHaveBeenCalled();
			expect(context.clearRect).not.toHaveBeenCalled();

			const nextCanvas = document.createElement("canvas");
			nextCanvas.width = 640;
			nextCanvas.height = 360;
			act(() => {
				provider?.onFrame({
					actualTimestampUs: 9_000_000,
					canvas: nextCanvas,
					requestId: 2,
					requestedAtMs: 0,
					timestampUs: 9_000_000,
				});
			});
			expect(context.drawImage).toHaveBeenLastCalledWith(
				nextCanvas,
				0,
				0,
				640,
				360,
			);
			expect(overlay.className).toContain("block");

			fireEvent.click(screen.getByRole("button", { name: "Play" }));
			expect(video.currentTime).toBe(9);
			expect(overlay.className).toContain("block");

			fireEvent.playing(video);

			await waitFor(() => {
				expect(overlay.className).toContain("hidden");
			});
		} finally {
			getContext.mockRestore();
		}
	});

	it("retries a failed track through the existing engine without recreating asset resources", async () => {
		vi.stubGlobal("AudioContext", class AudioContext {});
		preparePreviewAudioResourcesMock.mockImplementation(async (request) =>
			createPreparedPreviewAudioResourcesForRequest(request),
		);

		render(<AudioMasterPlayerProbe showAudioPanel />);

		await waitFor(() => {
			expect(adapterMockState.previewAudioEngines).toHaveLength(1);
		});
		adapterMockState.previewAudioEngines[0]?.readMeterSnapshot.mockReturnValue({
			combinedState: {
				channels: [],
				partial: true,
				reason: "Desktop source failed",
				status: "ready",
			},
			trackStates: {
				"audio-1": {
					channels: [],
					status: "ready",
					trackId: "audio-1",
				},
				"audio-2": {
					reason: "Desktop source failed",
					status: "unavailable",
					trackId: "audio-2",
				},
			},
		});

		fireEvent.click(
			await screen.findByRole("button", {
				name: "Retry Desktop preview meter",
			}),
		);

		await waitFor(() => {
			expect(
				adapterMockState.previewAudioEngines[0]?.retryTrack,
			).toHaveBeenCalledWith("audio-2");
		});
		expect(preparePreviewAudioResourcesMock).toHaveBeenCalledTimes(1);
		expect(adapterMockState.previewAudioEngines).toHaveLength(1);
	});

	it("keeps paused timeline edits off native video until playback resumes", async () => {
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
			expect(video.currentTime).toBe(0);
			expect(onSelectionStartRequested).not.toHaveBeenCalled();
			expect(onSelectionEndRequested).not.toHaveBeenCalled();
			expect(onSelectionRangeMoveRequested).not.toHaveBeenCalled();

			fireEvent.mouseDown(screen.getByLabelText("Playhead handle"), {
				clientX: 600,
			});
			fireEvent.mouseMove(window, { clientX: 700 });
			await waitFor(() => {
				expect(
					scrubPreviewMockState.providers[0]?.requestFrame,
				).toHaveBeenLastCalledWith(7_000_000, {
					priority: "interactive",
				});
			});
			expect(video.currentTime).toBe(0);
			expect(screen.getByLabelText("Preview playhead time").textContent).toBe(
				"00:00:07.000",
			);
			fireEvent.mouseUp(window, { clientX: 800 });
			expect(video.currentTime).toBe(0);
			expect(
				scrubPreviewMockState.providers[0]?.requestFrame,
			).toHaveBeenLastCalledWith(8_000_000, { priority: "final" });

			fireEvent.mouseDown(screen.getByLabelText("Selection start handle"), {
				clientX: 200,
			});
			fireEvent.mouseUp(window, { clientX: 300 });
			expect(video.currentTime).toBe(0);
			expect(onSelectionStartRequested).toHaveBeenCalledWith(3_000_000);
			expect(onSelectionEndRequested).not.toHaveBeenCalled();
			expect(onSelectionRangeMoveRequested).not.toHaveBeenCalled();

			fireEvent.mouseDown(screen.getByLabelText("Selection end handle"), {
				clientX: 800,
			});
			fireEvent.mouseUp(window, { clientX: 900 });
			expect(video.currentTime).toBe(0);
			expect(onSelectionEndRequested).toHaveBeenCalledWith(9_000_000);
			expect(onSelectionRangeMoveRequested).not.toHaveBeenCalled();

			fireEvent.mouseDown(screen.getByLabelText("Move selection range"), {
				clientX: 200,
			});
			fireEvent.mouseUp(window, { clientX: 500 });
			expect(onSelectionRangeMoveRequested).toHaveBeenCalledWith(3_000_000);

			fireEvent.click(screen.getByRole("button", { name: "Play" }));
			expect(video.currentTime).toBe(9);
		} finally {
			getBoundingClientRect.mockRestore();
		}
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
	const asset = props.asset ?? readyAsset;
	const audioMix = props.audioMix ?? createDefaultAudioMix(asset);

	return (
		<PreviewAudioMonitoringProvider assetId={asset.id}>
			<PreviewMeteringProvider asset={asset} audioMix={audioMix}>
				<NativePreviewPlayer
					asset={asset}
					audioMix={audioMix}
					onSelectionEndRequested={() => {}}
					onSelectionRangeMoveRequested={() => {}}
					onSelectionResetRequested={() => {}}
					onSelectionStartRequested={() => {}}
					selection={selection}
					source={previewSource}
					{...props}
				/>
			</PreviewMeteringProvider>
		</PreviewAudioMonitoringProvider>
	);
}

function AudioMasterPlayerProbe({
	asset = readyAssetWithTwoAudioTracks,
	onPreviewPlayheadChange,
	selection: playerSelection = selection,
	showAudioPanel = false,
	source = previewSource,
}: {
	asset?: ReadyMediaAsset;
	onPreviewPlayheadChange?: (playheadUs: MediaTimeUs) => void;
	selection?: Selection;
	showAudioPanel?: boolean;
	source?: Blob;
} = {}) {
	const [audioMix, setAudioMix] = useState(() => createDefaultAudioMix(asset));

	return (
		<PreviewAudioMonitoringProvider assetId={asset.id}>
			<PreviewMeteringProvider asset={asset} audioMix={audioMix}>
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
				{showAudioPanel ? (
					<AudioPanel asset={asset} audioMix={audioMix} />
				) : null}
			</PreviewMeteringProvider>
		</PreviewAudioMonitoringProvider>
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

const emptyMeterSnapshot: PreviewAudioEngineMeterSnapshot = {
	combinedState: {
		channels: [],
		partial: false,
		status: "ready",
	},
	trackStates: {},
};

function stubPreviewAnimationFrames() {
	const frameCallbacks: FrameRequestCallback[] = [];
	const meterFrameCallbacks: FrameRequestCallback[] = [];
	const timelineFrameCallbacks: FrameRequestCallback[] = [];
	const requestPreviewAnimationFrame = vi.fn(
		(callback: FrameRequestCallback) => {
			frameCallbacks.push(callback);
			return frameCallbacks.length;
		},
	);
	const requestAnimationFrame = (callback: FrameRequestCallback) => {
		if (callback.name === "updateLivePlayheadHandle") {
			timelineFrameCallbacks.push(callback);
			return 10_000 + timelineFrameCallbacks.length;
		}
		if (callback.name === "animateLiveMeters") {
			meterFrameCallbacks.push(callback);
			return 20_000 + meterFrameCallbacks.length;
		}

		return requestPreviewAnimationFrame(callback);
	};
	const cancelAnimationFrame = vi.fn();
	vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
	vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);

	return {
		cancelAnimationFrame,
		frameCallbacks,
		meterFrameCallbacks,
		requestAnimationFrame: requestPreviewAnimationFrame,
	};
}

function runNextPreviewFrame(frameCallbacks: FrameRequestCallback[]) {
	act(() => {
		frameCallbacks.shift()?.(16);
	});
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

function createPreparedPreviewAudioResourcesForRequest(
	request: PreparePreviewAudioResourcesRequest,
): PreviewAudioResourcesResult {
	const requestedTrackIds = request.asset.tracks.audio.map((track) => track.id);

	return {
		provider: createPreviewAudioProviderStub(),
		resources: requestedTrackIds.map(
			(trackId) =>
				({
					numberOfChannels: 2,
					trackId,
				}) satisfies PreviewAudioResource,
		),
	};
}

const readyAsset = {
	durationUs: 12_000_000,
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

const selection = {
	endUs: 12_000_000,
	startUs: 0,
} satisfies Selection;
