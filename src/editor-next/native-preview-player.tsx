import {
	CircleDot,
	FastForward,
	Maximize2,
	Pause,
	Play,
	Rewind,
	SkipBack,
	SkipForward,
	TimerReset,
	Volume2,
	VolumeX,
} from "lucide-react";
import {
	type ChangeEvent,
	type KeyboardEvent as ReactKeyboardEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

import { Button } from "@/components/ui/button";
import type {
	MediaTimeUs,
	ReadyMediaAsset,
	Selection,
} from "@/editor-core/model";
import { SelectionTimeline } from "./selection-timeline";

type NativePreviewPlayerProps = {
	asset: ReadyMediaAsset;
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
	const playheadRef = useRef<MediaTimeUs>(0);
	const playheadAnimationFrameRef = useRef<number | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [muted, setMuted] = useState(false);
	const [playbackRate, setPlaybackRate] = useState(1);
	const [playheadUs, setPlayheadUsState] = useState<MediaTimeUs>(0);
	const [previewUrl, setPreviewUrl] = useState("");
	const [volume, setVolume] = useState(1);

	useEffect(() => {
		const objectUrl = URL.createObjectURL(source);
		setPreviewUrl(objectUrl);
		playheadRef.current = 0;
		setPlayheadUsState(0);
		setIsPlaying(false);

		return () => {
			URL.revokeObjectURL(objectUrl);
		};
	}, [source]);

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

	const seekToUs = useCallback(
		(nextPlayheadUs: MediaTimeUs) => {
			const video = videoRef.current;
			const clampedPlayheadUs = clampMediaTime(
				Math.round(nextPlayheadUs),
				0,
				asset.durationUs,
			);

			if (video) {
				video.currentTime = clampedPlayheadUs / 1_000_000;
			}

			setPlayheadUs(clampedPlayheadUs);
		},
		[asset.durationUs, setPlayheadUs],
	);

	const seekByUs = useCallback(
		(deltaUs: MediaTimeUs) => {
			seekToUs(playheadRef.current + deltaUs);
		},
		[seekToUs],
	);

	const stepFrame = useCallback(
		(direction: -1 | 1) => {
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
			video.pause();
			setIsPlaying(false);
			return;
		}

		try {
			await video.play();
			setIsPlaying(true);
		} catch {
			setIsPlaying(false);
		}
	}, [isPlaying]);

	const updatePlaybackRate = useCallback(
		(event: ChangeEvent<HTMLSelectElement>) => {
			const nextPlaybackRate = Number.parseFloat(event.currentTarget.value);
			const video = videoRef.current;

			if (video) {
				video.playbackRate = nextPlaybackRate;
			}

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

	const requestFullscreen = useCallback(() => {
		void videoRef.current?.requestFullscreen?.();
	}, []);

	const syncPlayheadWithNativeVideo = useCallback(() => {
		const video = videoRef.current;

		if (!video) {
			return;
		}

		setPlayheadUs(secondsToMicroseconds(video.currentTime));
	}, [setPlayheadUs]);

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
		setIsPlaying(false);
		setPlayheadUs(asset.durationUs);
	}, [asset.durationUs, setPlayheadUs]);

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
						<div className="flex min-w-0 items-center gap-2 text-muted-foreground">
							<CircleDot
								aria-hidden="true"
								className={`size-3 shrink-0 ${
									isPlaying ? "text-workbench-progress" : "text-workbench-playhead"
								}`}
							/>
							<span className="font-medium text-foreground">Program viewer</span>
							<span className="font-mono text-muted-foreground/70">
								{playbackRate}x
							</span>
						</div>
						<p className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
							{asset.label}
						</p>
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
					<div
						aria-label="Preview viewer surface"
						className="grid min-h-0 flex-1 place-items-center overflow-hidden bg-workbench-viewer p-3 xl:p-4"
						role="group"
					>
						<div
							aria-label="Preview aperture"
							className="relative aspect-video w-full max-w-5xl overflow-hidden border border-workbench-border-strong bg-black shadow-2xl"
							role="group"
						>
							<video
								aria-label={`Preview for ${asset.label}`}
								className="h-full w-full bg-black object-cover"
								onEnded={handleEnded}
								onPause={() => setIsPlaying(false)}
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
						</div>
					</div>
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
					asset={asset}
					onPlayheadSeekRequested={seekToUs}
					onSelectionEndCommitRequested={onSelectionEndRequested}
					onSelectionRangeMoveRequested={onSelectionRangeMoveRequested}
					onSelectionResetRequested={onSelectionResetRequested}
					onSelectionStartCommitRequested={onSelectionStartRequested}
					playheadUs={playheadUs}
					playheadUpdatesAreLive={isPlaying}
					selection={selection}
					selectionEditingDisabled={selectionEditingDisabled}
					source={source}
				/>
			</section>
		</>
	);
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
