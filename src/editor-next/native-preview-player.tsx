import {
	CircleDot,
	FastForward,
	Maximize2,
	Pause,
	Play,
	Rewind,
	SkipBack,
	SkipForward,
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
						className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-workbench-border bg-workbench px-3 text-xs"
					>
						<div className="flex min-w-0 items-center gap-2 text-muted-foreground">
							<CircleDot
								aria-hidden="true"
								className={`size-3 shrink-0 ${
									isPlaying ? "text-workbench-progress" : "text-workbench-playhead"
								}`}
							/>
							<span className="font-medium text-foreground">Preview</span>
							<span className="rounded border border-workbench-border bg-workbench-hover px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground">
								{playbackRate}x
							</span>
						</div>
						<p className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
							{asset.label}
						</p>
						<div className="flex shrink-0 items-center gap-2">
							<span
								aria-label="Preview playhead time"
								className="rounded border border-workbench-border bg-background px-2 py-1 font-mono text-[11px] leading-none"
							>
								{formatMediaTime(playheadUs)}
							</span>
							<Button
								aria-label="Open fullscreen preview"
								disabled={!canFullscreen}
								onClick={requestFullscreen}
								size="icon"
								type="button"
								variant="outline"
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
							className="relative aspect-video w-full max-w-5xl overflow-hidden rounded-sm border border-workbench-border-strong bg-workbench-viewer shadow-2xl"
							role="group"
						>
							<video
								aria-label={`Preview for ${asset.label}`}
								className="h-full w-full bg-workbench-viewer object-contain"
								onEnded={handleEnded}
								onPause={() => setIsPlaying(false)}
								onPlay={() => setIsPlaying(true)}
								onSeeked={syncPlayheadWithNativeVideo}
								onTimeUpdate={syncPlayheadWithNativeVideo}
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
				className="min-h-[3.25rem] rounded-md border border-workbench-border bg-workbench-transport xl:col-span-3 xl:row-start-2 xl:min-h-0 xl:overflow-hidden xl:rounded-none xl:border-x-0"
			>
				<div
					aria-label="Preview transport controls"
					className="grid min-h-[3.25rem] min-w-0 gap-2 px-2 py-1.5 lg:grid-cols-[auto_minmax(18rem,1fr)_minmax(18rem,auto)] lg:items-center xl:h-full xl:min-h-0 xl:overflow-hidden xl:py-0.5"
				>
					<div
						aria-label="Primary preview controls"
						className="flex min-w-0 flex-wrap items-center gap-1 rounded-md border border-workbench-border bg-background/55 p-1 lg:flex-nowrap xl:p-0.5"
					>
						<Button
							aria-label={isPlaying ? "Pause" : "Play"}
							className="bg-workbench-selected text-workbench-selected-foreground hover:bg-workbench-selected/90"
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

					<dl
						aria-label="Preview media-time readouts"
						className="grid min-w-0 grid-cols-2 gap-1 rounded-md border border-workbench-border bg-background/65 p-1 text-xs sm:grid-cols-4"
					>
						<PreviewFact label="Playhead" value={formatMediaTime(playheadUs)} />
						<PreviewFact
							label="Selection start"
							value={formatMediaTime(selection.startUs)}
						/>
						<PreviewFact
							label="Selection end"
							value={formatMediaTime(selection.endUs)}
						/>
						<PreviewFact
							label="Frame step"
							value={`${formatMediaTime(asset.frameTiming.frameDurationUs)} ${
								asset.frameTiming.source
							}`}
						/>
					</dl>

					<div
						aria-label="Preview playback settings"
						className="grid min-w-0 gap-2 rounded-md border border-workbench-border bg-background/55 p-1 sm:grid-cols-[auto_minmax(10rem,1fr)_auto]"
					>
						<label className="flex items-center gap-2 text-xs font-medium">
							<span className="whitespace-nowrap">Playback speed</span>
							<select
								aria-label="Playback speed"
								className="h-8 rounded-md border border-input bg-background px-2.5 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
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

						<label className="flex min-w-0 items-center gap-2 text-xs font-medium">
							<span className="whitespace-nowrap">Preview volume</span>
							<input
								aria-label="Preview volume"
								className="h-8 min-w-0 flex-1 accent-primary"
								max="100"
								min="0"
								onChange={updateVolume}
								type="range"
								value={Math.round(volume * 100)}
							/>
						</label>

						<Button
							aria-label={muted ? "Unmute preview audio" : "Mute preview audio"}
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
			onClick={onClick}
			size="icon"
			type="button"
			variant="outline"
		>
			{children}
		</Button>
	);
}

function PreviewFact({ label, value }: { label: string; value: string }) {
	return (
		<div className="grid min-w-0 gap-0.5 rounded-sm bg-background/45 px-2 py-1">
			<dt className="truncate text-[10px] uppercase leading-none text-muted-foreground">
				{label}
			</dt>
			<dd className="min-w-0 truncate font-mono text-xs leading-tight tabular-nums">
				{value}
			</dd>
		</div>
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
