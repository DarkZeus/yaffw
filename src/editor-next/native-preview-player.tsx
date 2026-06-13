import {
	CircleDot,
	FastForward,
	Maximize2,
	Pause,
	Play,
	Repeat2,
	Rewind,
	SkipBack,
	SkipForward,
	TimerReset,
	Volume2,
	VolumeX,
} from "lucide-react";
import {
	type CSSProperties,
	type ChangeEvent,
	type KeyboardEvent as ReactKeyboardEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import type MultiTrack from "wavesurfer-multitrack";
import type { TrackOptions } from "wavesurfer-multitrack";

import { Button } from "@/components/ui/button";
import {
	audioTrackVolumePercentToGain,
	createDefaultAudioMix,
} from "@/editor-core/audio-mix";
import type {
	AudioMix,
	AudioTrackChannelMode,
	MediaTimeUs,
	ReadyMediaAsset,
	Selection,
} from "@/editor-core/model";
import type { BrowserAudioPreviewSource } from "./browser-audio-preview-sources";
import { SelectionTimeline } from "./selection-timeline";
import { useBrowserAudioPreviewSources } from "./use-browser-audio-preview-sources";

type NativePreviewPlayerProps = {
	asset: ReadyMediaAsset;
	audioMix?: AudioMix;
	onAudioTrackChannelModeChange?: (
		trackId: string,
		channelMode: AudioTrackChannelMode,
	) => void;
	onAudioTrackIncludedChange?: (trackId: string, include: boolean) => void;
	onAudioTrackVolumePercentChange?: (
		trackId: string,
		volumePercent: number,
	) => void;
	onSelectionEndRequested: (playheadUs: MediaTimeUs) => void;
	onSelectionRangeMoveRequested: (deltaUs: MediaTimeUs) => void;
	onSelectionResetRequested: () => void;
	onSelectionStartRequested: (playheadUs: MediaTimeUs) => void;
	previewPosterSrc?: string;
	selection: Selection;
	selectionEditingDisabled?: boolean;
	shortcutsDisabled?: boolean;
	source: Blob;
};

type ShortcutSuppressionOptions = {
	event: KeyboardEvent;
	shortcutsDisabled: boolean;
};

const playbackSpeeds = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export function NativePreviewPlayer({
	asset,
	audioMix = createDefaultAudioMix(asset),
	onAudioTrackChannelModeChange,
	onAudioTrackIncludedChange,
	onAudioTrackVolumePercentChange,
	onSelectionEndRequested,
	onSelectionRangeMoveRequested,
	onSelectionResetRequested,
	onSelectionStartRequested,
	previewPosterSrc,
	selection,
	selectionEditingDisabled = false,
	shortcutsDisabled = false,
	source,
}: NativePreviewPlayerProps) {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const multitrackContainerRef = useRef<HTMLDivElement | null>(null);
	const multitrackRef = useRef<MultiTrack | null>(null);
	const previewSurfaceRef = useRef<HTMLElement | null>(null);
	const playheadRef = useRef<MediaTimeUs>(0);
	const playbackRateRef = useRef(1);
	const playheadAnimationFrameRef = useRef<number | null>(null);
	const selectionLoopEnteredRef = useRef(false);
	const [isPlaying, setIsPlaying] = useState(false);
	const [muted, setMuted] = useState(false);
	const [playbackRate, setPlaybackRate] = useState(1);
	const [playheadUs, setPlayheadUsState] = useState<MediaTimeUs>(0);
	const [previewSurfaceSize, setPreviewSurfaceSize] =
		useState<PreviewSurfaceSize | null>(null);
	const [previewUrl, setPreviewUrl] = useState("");
	const [selectionLoopEnabled, setSelectionLoopEnabled] = useState(false);
	const [multitrackReady, setMultitrackReady] = useState(false);
	const [soloedAudioTrackId, setSoloedAudioTrackId] = useState<string | null>(
		null,
	);
	const [volume, setVolume] = useState(1);

	useEffect(() => {
		const objectUrl = URL.createObjectURL(source);
		setPreviewUrl(objectUrl);
		playheadRef.current = 0;
		selectionLoopEnteredRef.current = false;
		setPlayheadUsState(0);
		setIsPlaying(false);
		setSoloedAudioTrackId(null);
		setSelectionLoopEnabled(false);

		return () => {
			URL.revokeObjectURL(objectUrl);
		};
	}, [source]);

	const audioPreviewSources = useBrowserAudioPreviewSources({
		audioMix,
		asset,
		enabled: canUseBrowserAudioPreviewTransport(asset),
		source,
	});
	const audioTransportReady =
		audioPreviewSources.status === "ready" && multitrackReady;

	const setPlayheadUs = useCallback(
		(nextPlayheadUs: MediaTimeUs) => {
			const clampedPlayheadUs = clampMediaTime(
				Math.round(nextPlayheadUs),
				0,
				asset.durationUs,
			);

			playheadRef.current = clampedPlayheadUs;
			setPlayheadUsState(clampedPlayheadUs);
		},
		[asset.durationUs],
	);

	const setPreviewTransportTime = useCallback(
		(nextPlayheadUs: MediaTimeUs) => {
			const nextTimeSeconds = nextPlayheadUs / 1_000_000;
			const video = videoRef.current;

			if (video) {
				video.currentTime = nextTimeSeconds;
			}

			if (audioTransportReady) {
				multitrackRef.current?.setTime(nextTimeSeconds);
			}
		},
		[audioTransportReady],
	);

	const updateSelectionLoopEntryFromPlayhead = useCallback(
		(nextPlayheadUs: MediaTimeUs) => {
			selectionLoopEnteredRef.current =
				selectionLoopEnabled &&
				isMediaTimeInsideSelection(nextPlayheadUs, selection);
		},
		[selection, selectionLoopEnabled],
	);

	const seekToUs = useCallback(
		(nextPlayheadUs: MediaTimeUs) => {
			const clampedPlayheadUs = clampMediaTime(
				Math.round(nextPlayheadUs),
				0,
				asset.durationUs,
			);

			setPreviewTransportTime(clampedPlayheadUs);
			updateSelectionLoopEntryFromPlayhead(clampedPlayheadUs);
			setPlayheadUs(clampedPlayheadUs);
		},
		[
			asset.durationUs,
			setPlayheadUs,
			setPreviewTransportTime,
			updateSelectionLoopEntryFromPlayhead,
		],
	);

	const seekByUs = useCallback(
		(deltaUs: MediaTimeUs) => {
			seekToUs(playheadRef.current + deltaUs);
		},
		[seekToUs],
	);

	const stepFrame = useCallback(
		(direction: -1 | 1) => {
			multitrackRef.current?.pause();
			videoRef.current?.pause();
			setIsPlaying(false);
			seekByUs(direction * asset.frameTiming.frameDurationUs);
		},
		[asset.frameTiming.frameDurationUs, seekByUs],
	);

	const togglePlayback = useCallback(async () => {
		const video = videoRef.current;

		if (!video) {
			return;
		}

		if (isPlaying) {
			multitrackRef.current?.pause();
			video.pause();
			setIsPlaying(false);
			return;
		}

		try {
			if (audioTransportReady) {
				video.muted = true;
				multitrackRef.current?.setTime(playheadRef.current / 1_000_000);
			}
			await video.play();
			if (audioTransportReady) {
				multitrackRef.current?.play();
			}
			setIsPlaying(true);
		} catch {
			multitrackRef.current?.pause();
			setIsPlaying(false);
		}
	}, [audioTransportReady, isPlaying]);

	const updatePlaybackRate = useCallback(
		(event: ChangeEvent<HTMLSelectElement>) => {
			const nextPlaybackRate = Number.parseFloat(event.currentTarget.value);
			const video = videoRef.current;

			if (video) {
				video.playbackRate = nextPlaybackRate;
			}

			setMultitrackPreviewPlaybackRate(multitrackRef.current, nextPlaybackRate);
			playbackRateRef.current = nextPlaybackRate;
			setPlaybackRate(nextPlaybackRate);
		},
		[],
	);

	const updateVolume = useCallback((event: ChangeEvent<HTMLInputElement>) => {
		const nextVolume = Number.parseInt(event.currentTarget.value, 10) / 100;
		const video = videoRef.current;

		if (video) {
			video.volume = nextVolume;
		}

		setVolume(nextVolume);
	}, []);

	const toggleMuted = useCallback(() => {
		const nextMuted = !muted;
		const video = videoRef.current;

		if (video) {
			video.muted = nextMuted;
		}

		setMuted(nextMuted);
	}, [muted]);

	useEffect(() => {
		const container = multitrackContainerRef.current;

		if (
			audioPreviewSources.status !== "ready" ||
			audioPreviewSources.sources.length === 0 ||
			!container
		) {
			multitrackRef.current?.destroy();
			multitrackRef.current = null;
			setMultitrackReady(false);
			container?.replaceChildren();
			return;
		}

		let disposed = false;
		let multitrack: MultiTrack | null = null;
		let unsubscribeCanPlay: (() => void) | undefined;

		setMultitrackReady(false);
		container.replaceChildren();

		void import("wavesurfer-multitrack")
			.then(({ default: Multitrack }) => {
				if (disposed) {
					return;
				}

				multitrack = Multitrack.create(
					createMultitrackPreviewTracks(audioPreviewSources.sources),
					{
						container,
						cursorColor: "transparent",
						cursorWidth: 0,
						minPxPerSec: 1,
						trackBackground: "transparent",
						trackBorderColor: "transparent",
					},
				);
				multitrackRef.current = multitrack;
				unsubscribeCanPlay = multitrack.on("canplay", () => {
					if (disposed) {
						return;
					}

					multitrack?.setTime(playheadRef.current / 1_000_000);
					setMultitrackPreviewPlaybackRate(multitrack, playbackRateRef.current);
					setMultitrackReady(true);
				});
			})
			.catch(() => {
				if (!disposed) {
					multitrackRef.current = null;
					setMultitrackReady(false);
				}
			});

		return () => {
			disposed = true;
			unsubscribeCanPlay?.();
			if (multitrackRef.current === multitrack) {
				multitrackRef.current = null;
			}
			multitrack?.destroy();
			setMultitrackReady(false);
			container.replaceChildren();
		};
	}, [audioPreviewSources]);

	useEffect(() => {
		if (
			audioPreviewSources.status !== "ready" ||
			!audioTransportReady ||
			!multitrackRef.current
		) {
			return;
		}

		applyMultitrackPreviewVolumes({
			audioMix,
			multitrack: multitrackRef.current,
			muted,
			soloedAudioTrackId,
			sources: audioPreviewSources.sources,
			volume,
		});
	}, [
		audioMix,
		audioPreviewSources,
		audioTransportReady,
		muted,
		soloedAudioTrackId,
		volume,
	]);

	useEffect(() => {
		const video = videoRef.current;

		if (!video) {
			return;
		}

		video.muted = audioTransportReady || muted;
	}, [audioTransportReady, muted]);

	useEffect(() => {
		if (!audioTransportReady || !isPlaying) {
			return;
		}

		const video = videoRef.current;
		if (video) {
			video.muted = true;
		}
		multitrackRef.current?.setTime(playheadRef.current / 1_000_000);
		multitrackRef.current?.play();
	}, [audioTransportReady, isPlaying]);

	const toggleSelectionLoop = useCallback(() => {
		setSelectionLoopEnabled((currentSelectionLoopEnabled) => {
			const nextSelectionLoopEnabled = !currentSelectionLoopEnabled;
			selectionLoopEnteredRef.current =
				nextSelectionLoopEnabled &&
				isMediaTimeInsideSelection(playheadRef.current, selection);

			return nextSelectionLoopEnabled;
		});
	}, [selection]);

	const requestFullscreen = useCallback(() => {
		void videoRef.current?.requestFullscreen?.();
	}, []);

	const syncPlayheadWithNativeVideo = useCallback(() => {
		const video = videoRef.current;

		if (!video) {
			return;
		}

		const previousPlayheadUs = playheadRef.current;
		const transportTimeSeconds =
			audioTransportReady && multitrackRef.current
				? multitrackRef.current.getCurrentTime()
				: video.currentTime;
		const nativePlayheadUs = secondsToMicroseconds(transportTimeSeconds);

		if (
			audioTransportReady &&
			Number.isFinite(transportTimeSeconds) &&
			Math.abs(video.currentTime - transportTimeSeconds) > 0.25
		) {
			video.currentTime = transportTimeSeconds;
		}

		if (!isPlaying) {
			updateSelectionLoopEntryFromPlayhead(nativePlayheadUs);
			setPlayheadUs(nativePlayheadUs);
			return;
		}

		if (
			selectionLoopEnabled &&
			shouldLoopSelectionPlayback({
				currentPlayheadUs: nativePlayheadUs,
				previousPlayheadUs,
				selection,
				selectionEntered: selectionLoopEnteredRef.current,
			})
		) {
			selectionLoopEnteredRef.current = true;
			setPreviewTransportTime(selection.startUs);
			setPlayheadUs(selection.startUs);
			return;
		}

		if (
			selectionLoopEnabled &&
			hasPlaybackEnteredSelection({
				currentPlayheadUs: nativePlayheadUs,
				previousPlayheadUs,
				selection,
			})
		) {
			selectionLoopEnteredRef.current = true;
		}

		setPlayheadUs(nativePlayheadUs);
	}, [
		audioTransportReady,
		isPlaying,
		selection,
		selectionLoopEnabled,
		setPlayheadUs,
		setPreviewTransportTime,
		updateSelectionLoopEntryFromPlayhead,
	]);

	useEffect(() => {
		selectionLoopEnteredRef.current =
			selectionLoopEnabled &&
			isMediaTimeInsideSelection(playheadRef.current, selection);
	}, [selection, selectionLoopEnabled]);

	useEffect(() => {
		if (!isPlaying) {
			if (playheadAnimationFrameRef.current !== null) {
				cancelPreviewFrame(playheadAnimationFrameRef.current);
				playheadAnimationFrameRef.current = null;
			}
			return;
		}

		let cancelled = false;

		function syncOnAnimationFrame() {
			if (cancelled) {
				return;
			}

			syncPlayheadWithNativeVideo();
			playheadAnimationFrameRef.current =
				requestPreviewFrame(syncOnAnimationFrame);
		}

		playheadAnimationFrameRef.current =
			requestPreviewFrame(syncOnAnimationFrame);

		return () => {
			cancelled = true;

			if (playheadAnimationFrameRef.current !== null) {
				cancelPreviewFrame(playheadAnimationFrameRef.current);
				playheadAnimationFrameRef.current = null;
			}
		};
	}, [isPlaying, syncPlayheadWithNativeVideo]);

	const handleEnded = useCallback(() => {
		const video = videoRef.current;

		if (
			video &&
			selectionLoopEnabled &&
			selectionLoopEnteredRef.current &&
			selection.endUs >= asset.durationUs
		) {
			setPreviewTransportTime(selection.startUs);
			setPlayheadUs(selection.startUs);
			setIsPlaying(true);
			void video.play().catch(() => {
				setIsPlaying(false);
			});
			if (audioTransportReady) {
				multitrackRef.current?.play();
			}
			return;
		}

		multitrackRef.current?.pause();
		setIsPlaying(false);
		setPlayheadUs(asset.durationUs);
	}, [
		audioTransportReady,
		asset.durationUs,
		selection.endUs,
		selection.startUs,
		selectionLoopEnabled,
		setPlayheadUs,
		setPreviewTransportTime,
	]);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			if (
				isPreviewShortcutSuppressed({
					event,
					shortcutsDisabled,
				})
			) {
				return;
			}

			const handled = handlePreviewShortcut(event, {
				onFrameBack: () => stepFrame(-1),
				onFrameForward: () => stepFrame(1),
				onSeekBackward: () => seekByUs(-1_000_000),
				onSeekBackwardLarge: () => seekByUs(-10_000_000),
				onSeekForward: () => seekByUs(1_000_000),
				onSeekForwardLarge: () => seekByUs(10_000_000),
				onSelectionEnd: () => onSelectionEndRequested(playheadRef.current),
				onSelectionStart: () => onSelectionStartRequested(playheadRef.current),
				onTogglePlayback: () => {
					void togglePlayback();
				},
			});

			if (handled) {
				event.preventDefault();
			}
		},
		[
			onSelectionEndRequested,
			onSelectionStartRequested,
			seekByUs,
			shortcutsDisabled,
			stepFrame,
			togglePlayback,
		],
	);

	useEffect(() => {
		window.addEventListener("keydown", handleKeyDown);

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [handleKeyDown]);

	const canFullscreen =
		typeof videoRef.current?.requestFullscreen === "function" ||
		typeof HTMLVideoElement.prototype.requestFullscreen === "function";
	const previewAspectRatio = getPreviewAspectRatio(asset);
	const previewApertureStyle = createPreviewApertureStyle(
		previewAspectRatio,
		previewSurfaceSize,
	);

	useLayoutEffect(() => {
		const previewSurface = previewSurfaceRef.current;

		if (!previewSurface) {
			return;
		}

		function measurePreviewSurface() {
			if (!previewSurface) {
				return;
			}

			const rect = previewSurface.getBoundingClientRect();
			const style = window.getComputedStyle(previewSurface);
			const width = Math.max(
				0,
				rect.width -
					parseCssPixels(style.paddingLeft) -
					parseCssPixels(style.paddingRight),
			);
			const height = Math.max(
				0,
				rect.height -
					parseCssPixels(style.paddingTop) -
					parseCssPixels(style.paddingBottom),
			);

			setPreviewSurfaceSize((currentSize) =>
				currentSize &&
				Math.abs(currentSize.width - width) < 0.5 &&
				Math.abs(currentSize.height - height) < 0.5
					? currentSize
					: { height, width },
			);
		}

		measurePreviewSurface();

		if (typeof ResizeObserver === "undefined") {
			window.addEventListener("resize", measurePreviewSurface);
			return () => {
				window.removeEventListener("resize", measurePreviewSurface);
			};
		}

		const resizeObserver = new ResizeObserver(measurePreviewSurface);
		resizeObserver.observe(previewSurface);

		return () => {
			resizeObserver.disconnect();
		};
	}, []);

	return (
		<>
			<section
				aria-label="Workbench center region"
				className="min-h-[24rem] overflow-hidden rounded-md border border-workbench-border-strong bg-workbench-viewer xl:col-start-2 xl:row-start-1 xl:min-h-0 xl:rounded-none xl:border-y-0"
			>
				<section
					aria-label="Native preview player"
					className="flex min-h-full flex-col bg-workbench-viewer"
				>
					<div
						aria-label="Preview viewer header"
						className="flex h-8 shrink-0 items-center justify-between gap-3 border-b border-workbench-border bg-workbench px-3 text-[11px]"
					>
						<div className="flex shrink-0 items-center gap-2 whitespace-nowrap text-muted-foreground">
							<CircleDot
								aria-hidden="true"
								className={`size-3 shrink-0 ${
									isPlaying
										? "text-workbench-progress"
										: "text-workbench-playhead"
								}`}
							/>
							<span className="font-medium text-foreground">
								Program viewer
							</span>
							<span className="font-mono text-muted-foreground/70">
								{playbackRate}x
							</span>
						</div>
						<div className="flex shrink-0 items-center gap-2">
							<span
								aria-label="Preview playhead time"
								className="font-mono text-[11px] leading-none"
							>
								{formatMediaTime(playheadUs)}
							</span>
							<Button
								aria-label="Open fullscreen preview"
								className="size-7 border-0 bg-transparent text-muted-foreground shadow-none hover:bg-workbench-hover hover:text-foreground"
								disabled={!canFullscreen}
								onClick={requestFullscreen}
								size="icon"
								type="button"
								variant="ghost"
							>
								<Maximize2 data-icon="inline-start" />
							</Button>
						</div>
					</div>
					<section
						aria-label="Preview viewer surface"
						className="grid min-h-0 flex-1 place-items-center overflow-hidden bg-workbench-viewer p-3 xl:p-4"
						ref={previewSurfaceRef}
					>
						<section
							aria-label="Preview aperture"
							className="relative max-h-full w-full max-w-5xl overflow-hidden border border-workbench-border-strong bg-black shadow-2xl"
							style={previewApertureStyle}
						>
							<video
								aria-label={`Preview for ${asset.label}`}
								className="h-full w-full bg-black object-contain"
								onEnded={handleEnded}
								onPause={() => {
									multitrackRef.current?.pause();
									setIsPlaying(false);
								}}
								onPlay={() => setIsPlaying(true)}
								onSeeked={syncPlayheadWithNativeVideo}
								onTimeUpdate={syncPlayheadWithNativeVideo}
								poster={previewPosterSrc}
								preload="metadata"
								ref={videoRef}
								src={previewUrl || undefined}
							>
								<track kind="captions" />
							</video>
							<div
								aria-hidden="true"
								className="pointer-events-none absolute inset-x-0 bottom-0 h-px overflow-hidden opacity-0"
								data-testid="multitrack-preview-transport"
								ref={multitrackContainerRef}
							/>
						</section>
					</section>
				</section>
			</section>

			<section
				aria-label="Workbench transport region"
				className="min-h-10 rounded-md border border-workbench-border bg-workbench-transport xl:col-span-3 xl:row-start-2 xl:min-h-0 xl:overflow-hidden xl:rounded-none xl:border-x-0"
			>
				<div
					aria-label="Preview transport controls"
					className="grid min-h-10 min-w-0 grid-cols-1 items-center gap-2 px-3 py-1 text-[11px] text-muted-foreground md:grid-cols-[1fr_auto_1fr] xl:h-full xl:min-h-0 xl:overflow-hidden xl:py-0"
				>
					<dl
						aria-label="Preview media-time readouts"
						className="flex min-w-0 items-center gap-2 font-mono"
					>
						<dt className="sr-only">Playhead</dt>
						<dd>{formatMediaTime(playheadUs)}</dd>
						<span aria-hidden="true">/</span>
						<dt className="sr-only">Duration</dt>
						<dd>{formatMediaTime(asset.durationUs)}</dd>
					</dl>

					<div
						aria-label="Primary preview controls"
						className="flex min-w-0 flex-wrap items-center justify-center gap-1 md:flex-nowrap"
					>
						<Button
							aria-label={isPlaying ? "Pause" : "Play"}
							className="size-8 rounded border-workbench-progress/40 bg-workbench-progress text-workbench-selected-foreground hover:bg-workbench-progress/90"
							onClick={() => {
								void togglePlayback();
							}}
							size="icon"
							type="button"
						>
							{isPlaying ? (
								<Pause data-icon="inline-start" />
							) : (
								<Play data-icon="inline-start" />
							)}
						</Button>
						<PreviewIconButton
							label="Seek backward 10 seconds"
							onClick={() => seekByUs(-10_000_000)}
						>
							<Rewind data-icon="inline-start" />
						</PreviewIconButton>
						<PreviewIconButton
							label="Seek backward 1 second"
							onClick={() => seekByUs(-1_000_000)}
						>
							<SkipBack data-icon="inline-start" />
						</PreviewIconButton>
						<PreviewIconButton
							label="Step backward one frame"
							onClick={() => stepFrame(-1)}
						>
							<SkipBack data-icon="inline-start" />
						</PreviewIconButton>
						<PreviewIconButton
							label="Step forward one frame"
							onClick={() => stepFrame(1)}
						>
							<SkipForward data-icon="inline-start" />
						</PreviewIconButton>
						<PreviewIconButton
							label="Seek forward 1 second"
							onClick={() => seekByUs(1_000_000)}
						>
							<SkipForward data-icon="inline-start" />
						</PreviewIconButton>
						<PreviewIconButton
							label="Seek forward 10 seconds"
							onClick={() => seekByUs(10_000_000)}
						>
							<FastForward data-icon="inline-start" />
						</PreviewIconButton>
						<PreviewToggleButton
							label="Loop selection"
							onClick={toggleSelectionLoop}
							pressed={selectionLoopEnabled}
						>
							<Repeat2 data-icon="inline-start" />
						</PreviewToggleButton>
					</div>

					<div
						aria-label="Preview playback settings"
						className="flex min-w-0 flex-wrap items-center justify-start gap-3 md:justify-end"
					>
						<span className="whitespace-nowrap font-mono text-foreground">
							Selection {formatMediaTime(selection.endUs - selection.startUs)}
						</span>
						<label className="flex items-center gap-1">
							<Volume2 aria-hidden="true" className="size-3.5" />
							<span className="sr-only">Preview volume</span>
							<input
								aria-label="Preview volume"
								className="h-5 w-24 accent-primary"
								max="100"
								min="0"
								onChange={updateVolume}
								type="range"
								value={Math.round(volume * 100)}
							/>
						</label>
						<label className="flex items-center gap-1">
							<TimerReset aria-hidden="true" className="size-3.5" />
							<span className="sr-only">Playback speed</span>
							<select
								aria-label="Playback speed"
								className="h-7 rounded border border-input bg-workbench px-2 text-xs shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
								onChange={updatePlaybackRate}
								value={String(playbackRate)}
							>
								{playbackSpeeds.map((speed) => (
									<option key={speed} value={speed}>
										{speed}x
									</option>
								))}
							</select>
						</label>

						<Button
							aria-label={muted ? "Unmute preview audio" : "Mute preview audio"}
							className="size-7 rounded border-workbench-border bg-workbench-viewer text-muted-foreground hover:bg-workbench-hover hover:text-foreground"
							onClick={toggleMuted}
							size="icon"
							type="button"
							variant="outline"
						>
							{muted ? (
								<VolumeX data-icon="inline-start" />
							) : (
								<Volume2 data-icon="inline-start" />
							)}
						</Button>
					</div>
				</div>
			</section>

			<section
				aria-label="Workbench selection region"
				className="min-h-[22rem] overflow-x-hidden overscroll-contain xl:col-span-3 xl:row-start-3 xl:min-h-0 xl:overflow-y-auto xl:border-t xl:border-workbench-border-strong xl:bg-workbench-timeline"
			>
				<SelectionTimeline
					audioMix={audioMix}
					asset={asset}
					onAudioTrackChannelModeChange={onAudioTrackChannelModeChange}
					onAudioTrackIncludedChange={onAudioTrackIncludedChange}
					onAudioTrackVolumePercentChange={onAudioTrackVolumePercentChange}
					onPlayheadSeekRequested={seekToUs}
					onSoloedAudioTrackChange={setSoloedAudioTrackId}
					onSelectionEndCommitRequested={onSelectionEndRequested}
					onSelectionRangeMoveRequested={onSelectionRangeMoveRequested}
					onSelectionResetRequested={onSelectionResetRequested}
					onSelectionStartCommitRequested={onSelectionStartRequested}
					playheadUs={playheadUs}
					playheadUpdatesAreLive={isPlaying}
					selection={selection}
					selectionEditingDisabled={selectionEditingDisabled}
					soloedAudioTrackId={soloedAudioTrackId}
					source={source}
				/>
			</section>
		</>
	);
}

type PreviewSurfaceSize = {
	height: number;
	width: number;
};

export function canUseBrowserAudioPreviewTransport(asset: ReadyMediaAsset) {
	return (
		asset.tracks.audio.length > 0 &&
		typeof window !== "undefined" &&
		typeof AudioContext !== "undefined" &&
		typeof HTMLAudioElement !== "undefined" &&
		typeof URL.createObjectURL === "function"
	);
}

export function createMultitrackPreviewTracks(
	sources: BrowserAudioPreviewSource[],
): TrackOptions[] {
	return sources.map((source) => ({
		id: source.trackId,
		options: {
			barGap: 0,
			barWidth: 1,
			height: 0,
			progressColor: "transparent",
			waveColor: "transparent",
		},
		startPosition: source.startPositionSeconds,
		url: source.url,
		volume: 0,
	}));
}

export function previewVolumeForAudioTrackSource({
	audioMix,
	muted,
	soloedAudioTrackId,
	source,
	volume,
}: {
	audioMix: AudioMix;
	muted: boolean;
	soloedAudioTrackId?: string | null;
	source: BrowserAudioPreviewSource;
	volume: number;
}) {
	const decision = audioMix.tracks[source.trackId];

	if (muted) {
		return 0;
	}

	if (soloedAudioTrackId && source.trackId !== soloedAudioTrackId) {
		return 0;
	}

	if (!soloedAudioTrackId && decision?.include === false) {
		return 0;
	}

	return (
		clampPreviewVolume(volume) *
		audioTrackVolumePercentToGain(decision?.volumePercent ?? 100)
	);
}

function applyMultitrackPreviewVolumes({
	audioMix,
	multitrack,
	muted,
	soloedAudioTrackId,
	sources,
	volume,
}: {
	audioMix: AudioMix;
	multitrack: MultiTrack;
	muted: boolean;
	soloedAudioTrackId?: string | null;
	sources: BrowserAudioPreviewSource[];
	volume: number;
}) {
	sources.forEach((source, sourceIndex) => {
		multitrack.setTrackVolume(
			sourceIndex,
			previewVolumeForAudioTrackSource({
				audioMix,
				muted,
				soloedAudioTrackId,
				source,
				volume,
			}),
		);
	});
}

function setMultitrackPreviewPlaybackRate(
	multitrack: MultiTrack | null,
	playbackRate: number,
) {
	if (!multitrack) {
		return;
	}

	const transport = multitrack as unknown as {
		audios?: Array<{ playbackRate: number }>;
		setAudioRate?: (rate: number) => void;
	};

	if (typeof transport.setAudioRate === "function") {
		transport.setAudioRate(playbackRate);
		return;
	}

	for (const audio of transport.audios ?? []) {
		audio.playbackRate = playbackRate;
	}
}

function clampPreviewVolume(volume: number) {
	if (!Number.isFinite(volume)) {
		return 1;
	}

	return Math.max(0, Math.min(volume, 1));
}

function getPreviewAspectRatio(asset: ReadyMediaAsset): number {
	const primaryVideo = asset.tracks.video[0];
	const width = primaryVideo?.width ?? 16;
	const height = primaryVideo?.height ?? 9;

	if (width <= 0 || height <= 0) {
		return 16 / 9;
	}

	return width / height;
}

function shouldLoopSelectionPlayback({
	currentPlayheadUs,
	previousPlayheadUs,
	selection,
	selectionEntered,
}: {
	currentPlayheadUs: MediaTimeUs;
	previousPlayheadUs: MediaTimeUs;
	selection: Selection;
	selectionEntered: boolean;
}): boolean {
	const enteredSelection =
		selectionEntered ||
		hasPlaybackEnteredSelection({
			currentPlayheadUs,
			previousPlayheadUs,
			selection,
		});

	return enteredSelection && currentPlayheadUs >= selection.endUs;
}

function hasPlaybackEnteredSelection({
	currentPlayheadUs,
	previousPlayheadUs,
	selection,
}: {
	currentPlayheadUs: MediaTimeUs;
	previousPlayheadUs: MediaTimeUs;
	selection: Selection;
}): boolean {
	return (
		isMediaTimeInsideSelection(currentPlayheadUs, selection) ||
		(previousPlayheadUs < selection.startUs &&
			currentPlayheadUs >= selection.startUs)
	);
}

function isMediaTimeInsideSelection(
	playheadUs: MediaTimeUs,
	selection: Selection,
): boolean {
	return playheadUs >= selection.startUs && playheadUs < selection.endUs;
}

function createPreviewApertureStyle(
	aspectRatio: number,
	surfaceSize: PreviewSurfaceSize | null,
): CSSProperties {
	if (!surfaceSize || surfaceSize.width <= 0 || surfaceSize.height <= 0) {
		return {
			aspectRatio: String(aspectRatio),
		};
	}

	const width = Math.min(surfaceSize.width, surfaceSize.height * aspectRatio);
	const height = width / aspectRatio;

	return {
		aspectRatio: String(aspectRatio),
		height: `${formatCssNumber(height)}px`,
		width: `${formatCssNumber(width)}px`,
	};
}

function parseCssPixels(value: string): number {
	const parsedValue = Number.parseFloat(value);

	return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function formatCssNumber(value: number): string {
	return Number.isInteger(value)
		? String(value)
		: value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function PreviewIconButton({
	children,
	label,
	onClick,
}: {
	children: ReactNode;
	label: string;
	onClick: () => void;
}) {
	return (
		<Button
			aria-label={label}
			className="size-8 rounded border-workbench-border bg-workbench-viewer text-muted-foreground hover:bg-workbench-hover hover:text-foreground"
			onClick={onClick}
			size="icon"
			type="button"
			variant="outline"
		>
			{children}
		</Button>
	);
}

function PreviewToggleButton({
	children,
	label,
	onClick,
	pressed,
}: {
	children: ReactNode;
	label: string;
	onClick: () => void;
	pressed: boolean;
}) {
	return (
		<Button
			aria-label={label}
			aria-pressed={pressed}
			className={
				pressed
					? "size-8 rounded border-workbench-progress/50 bg-workbench-progress/15 text-workbench-progress hover:bg-workbench-progress/20 hover:text-workbench-progress"
					: "size-8 rounded border-workbench-border bg-workbench-viewer text-muted-foreground hover:bg-workbench-hover hover:text-foreground"
			}
			onClick={onClick}
			size="icon"
			title={label}
			type="button"
			variant="outline"
		>
			{children}
		</Button>
	);
}

type PreviewShortcutHandlers = {
	onFrameBack: () => void;
	onFrameForward: () => void;
	onSeekBackward: () => void;
	onSeekBackwardLarge: () => void;
	onSeekForward: () => void;
	onSeekForwardLarge: () => void;
	onSelectionEnd: () => void;
	onSelectionStart: () => void;
	onTogglePlayback: () => void;
};

function handlePreviewShortcut(
	event: KeyboardEvent | ReactKeyboardEvent,
	handlers: PreviewShortcutHandlers,
): boolean {
	if (event.shiftKey && event.code === "ArrowLeft") {
		handlers.onFrameBack();
		return true;
	}

	if (event.shiftKey && event.code === "ArrowRight") {
		handlers.onFrameForward();
		return true;
	}

	switch (event.code) {
		case "ArrowLeft":
			handlers.onSeekBackward();
			return true;
		case "ArrowRight":
			handlers.onSeekForward();
			return true;
		case "BracketLeft":
			handlers.onSelectionStart();
			return true;
		case "BracketRight":
			handlers.onSelectionEnd();
			return true;
		case "KeyJ":
			handlers.onSeekBackwardLarge();
			return true;
		case "KeyK":
		case "Space":
			handlers.onTogglePlayback();
			return true;
		case "KeyL":
			handlers.onSeekForwardLarge();
			return true;
		default:
			return false;
	}
}

export function isPreviewShortcutSuppressed({
	event,
	shortcutsDisabled,
}: ShortcutSuppressionOptions): boolean {
	if (shortcutsDisabled || event.defaultPrevented) {
		return true;
	}

	const target =
		event.target instanceof Element ? event.target : document.activeElement;

	if (target?.isConnected && isEditableTarget(target)) {
		return true;
	}

	return document.querySelector('[role="dialog"]') !== null;
}

function isEditableTarget(target: Element): boolean {
	if (target.closest('[contenteditable="true"]')) {
		return true;
	}

	const tagName = target.tagName.toLowerCase();

	return tagName === "input" || tagName === "textarea" || tagName === "select";
}

function secondsToMicroseconds(seconds: number): MediaTimeUs {
	return Math.round(seconds * 1_000_000);
}

function clampMediaTime(
	valueUs: MediaTimeUs,
	minUs: MediaTimeUs,
	maxUs: MediaTimeUs,
): MediaTimeUs {
	return Math.min(Math.max(valueUs, minUs), maxUs);
}

function requestPreviewFrame(callback: FrameRequestCallback): number {
	if (typeof window.requestAnimationFrame === "function") {
		return window.requestAnimationFrame(callback);
	}

	return window.setTimeout(() => callback(window.performance.now()), 16);
}

function cancelPreviewFrame(frameId: number) {
	if (typeof window.cancelAnimationFrame === "function") {
		window.cancelAnimationFrame(frameId);
		return;
	}

	window.clearTimeout(frameId);
}

function formatMediaTime(timeUs: number): string {
	const totalMilliseconds = Math.floor(timeUs / 1_000);
	const milliseconds = totalMilliseconds % 1_000;
	const totalSeconds = Math.floor(totalMilliseconds / 1_000);
	const seconds = totalSeconds % 60;
	const totalMinutes = Math.floor(totalSeconds / 60);
	const minutes = totalMinutes % 60;
	const hours = Math.floor(totalMinutes / 60);

	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
		2,
		"0",
	)}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(
		3,
		"0",
	)}`;
}
