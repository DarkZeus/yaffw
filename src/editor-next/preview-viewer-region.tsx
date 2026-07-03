import { CircleDot, Maximize2 } from "lucide-react";
import { memo, useMemo } from "react";

import {
	type ChapterOption,
	MediaPlayer,
	MediaProvider,
	type MediaProviderAdapter,
	Menu,
	type PlayerSrc,
	Poster,
	isHLSProvider,
	useChapterOptions,
	useMediaStore,
} from "@vidstack/react";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/audio.css";
import "@vidstack/react/player/styles/default/layouts/video.css";
import {
	DefaultTooltip,
	DefaultVideoLayout,
	defaultLayoutIcons,
	useDefaultLayoutContext,
} from "@vidstack/react/player/layouts/default";

import { Button } from "@/components/ui/button";
import type {
	MediaTimeUs,
	ReadyMediaAsset,
	Selection,
} from "@/editor-core/model";

import { formatMediaTime } from "./media-time-presentation";
import type { PreviewViewerRegionProps } from "./preview-viewer-region.types";

export function PreviewViewerRegion({
	asset,
	canFullscreen,
	isPlaying,
	mediaMuted,
	multitrackContainerRef,
	onChapterSelectionRequested,
	onEnded,
	onNativePause,
	onNativePlay,
	onRequestFullscreen,
	onSyncPlayhead,
	playbackRate,
	playheadUs,
	previewApertureStyle,
	previewPosterSrc,
	previewSourceMimeType,
	previewSurfaceRef,
	previewUrl,
	videoRef,
}: PreviewViewerRegionProps) {
	const playerSrc = useMemo(
		() => createPreviewPlayerSrc(previewUrl, previewSourceMimeType, asset),
		[asset, previewSourceMimeType, previewUrl],
	);

	return (
		<section
			aria-label="Workbench center region"
			className="min-h-[24rem] overflow-hidden rounded-md border border-workbench-border-strong bg-workbench-viewer xl:h-full xl:min-h-0 xl:rounded-none xl:border-y-0"
		>
			<section
				aria-label="Native preview player"
				className="flex h-full min-h-0 flex-col bg-workbench-viewer"
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
						<span className="sr-only">Preview</span>
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
							onClick={onRequestFullscreen}
							size="icon"
							type="button"
							variant="ghost"
						>
							<Maximize2 data-icon="inline-start" />
						</Button>
					</div>
				</div>
				<PreviewMediaSurface
					asset={asset}
					mediaMuted={mediaMuted}
					multitrackContainerRef={multitrackContainerRef}
					onChapterSelectionRequested={onChapterSelectionRequested}
					onEnded={onEnded}
					onNativePause={onNativePause}
					onNativePlay={onNativePlay}
					onSyncPlayhead={onSyncPlayhead}
					playerSrc={playerSrc}
					previewApertureStyle={previewApertureStyle}
					previewPosterSrc={previewPosterSrc}
					previewSurfaceRef={previewSurfaceRef}
					videoRef={videoRef}
				/>
			</section>
		</section>
	);
}

const PreviewMediaSurface = memo(function PreviewMediaSurface({
	asset,
	mediaMuted,
	multitrackContainerRef,
	onChapterSelectionRequested,
	onEnded,
	onNativePause,
	onNativePlay,
	onSyncPlayhead,
	playerSrc,
	previewApertureStyle,
	previewPosterSrc,
	previewSurfaceRef,
	videoRef,
}: {
	asset: ReadyMediaAsset;
	mediaMuted: boolean;
	multitrackContainerRef: PreviewViewerRegionProps["multitrackContainerRef"];
	onChapterSelectionRequested?: (selection: Selection) => void;
	onEnded: () => void;
	onNativePause: () => void;
	onNativePlay: () => void;
	onSyncPlayhead: () => void;
	playerSrc: PlayerSrc | undefined;
	previewApertureStyle: PreviewViewerRegionProps["previewApertureStyle"];
	previewPosterSrc?: string;
	previewSurfaceRef: PreviewViewerRegionProps["previewSurfaceRef"];
	videoRef: PreviewViewerRegionProps["videoRef"];
}) {
	return (
		<section
			aria-label="Preview viewer surface"
			className="grid min-h-0 flex-1 place-items-center overflow-hidden bg-workbench-viewer p-3 xl:p-4"
			ref={previewSurfaceRef}
		>
			<section
				aria-label="Preview aperture"
				className="relative max-h-full w-full overflow-hidden border border-workbench-border-strong bg-black shadow-2xl"
				style={previewApertureStyle}
			>
				<MediaPlayer
					aria-label={`Preview for ${asset.label}`}
					className="h-full w-full bg-black text-white"
					crossOrigin
					muted={mediaMuted}
					onEnded={onEnded}
					onPause={onNativePause}
					onPlay={onNativePlay}
					onSeeked={onSyncPlayhead}
					onTimeUpdate={onSyncPlayhead}
					onProviderChange={handlePreviewProviderChange}
					playsInline
					preload="metadata"
					ref={videoRef}
					src={playerSrc}
					title={asset.label}
					viewType={asset.tracks.video.length > 0 ? "video" : "audio"}
				>
					<MediaProvider
						mediaProps={{
							className: "h-full w-full bg-black object-contain",
						}}
					>
						{previewPosterSrc ? (
							<Poster
								alt=""
								className="vds-poster h-full w-full object-contain"
								src={previewPosterSrc}
							/>
						) : null}
					</MediaProvider>
					<DefaultVideoLayout
						icons={defaultLayoutIcons}
						slots={{
							chaptersMenu: (
								<PreviewChaptersMenu
									onChapterSelected={onChapterSelectionRequested}
								/>
							),
							largeLayout: {
								muteButton: null,
								volumeSlider: null,
							},
							muteButton: null,
							smallLayout: {
								muteButton: null,
								volumeSlider: null,
							},
							volumeSlider: null,
						}}
					/>
				</MediaPlayer>
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-x-0 bottom-0 h-px overflow-hidden opacity-0"
					data-testid="multitrack-preview-transport"
					ref={multitrackContainerRef}
				/>
			</section>
		</section>
	);
});

function handlePreviewProviderChange(provider: MediaProviderAdapter | null) {
	if (isHLSProvider(provider)) {
		provider.config = {
			...provider.config,
			enableWorker: true,
		};
	}
}

type PreviewChapterSelection = Selection & {
	durationText: string;
	label: string;
	selected: boolean;
	startTimeText: string;
	value: string;
};

function PreviewChaptersMenu({
	onChapterSelected,
}: {
	onChapterSelected?: (selection: Selection) => void;
}) {
	const { showMenuDelay } = useDefaultLayoutContext();
	const chapterOptions = useChapterOptions();
	const store = useMediaStore();
	const chapters = useMemo(
		() => buildPreviewChapterSelections(chapterOptions, store.duration),
		[chapterOptions, store.duration],
	);

	if (chapters.length === 0) {
		return null;
	}

	return (
		<Menu.Root className="vds-chapters-menu vds-menu" showDelay={showMenuDelay}>
			<DefaultTooltip content="Chapters" placement="top">
				<Menu.Button
					aria-label="Chapters"
					className="vds-menu-button vds-button"
				>
					<defaultLayoutIcons.Menu.Chapters className="vds-icon" />
				</Menu.Button>
			</DefaultTooltip>
			<Menu.Items
				className="vds-chapters-menu-items vds-menu-items"
				placement="top end"
			>
				<Menu.RadioGroup
					className="vds-chapters-radio-group vds-radio-group"
					value={chapterOptions.selectedValue}
				>
					{chapters.map((chapter, index) => {
						const option = chapterOptions[index];

						return (
							<Menu.Radio
								className="vds-chapter-radio vds-radio"
								key={chapter.value}
								onSelect={(event) => {
									onChapterSelected?.({
										endUs: chapter.endUs,
										startUs: chapter.startUs,
									});
									option?.select(event);
								}}
								ref={option?.setProgressVar}
								value={chapter.value}
							>
								<div className="vds-chapter-radio-content">
									<span className="vds-chapter-radio-label">
										{chapter.label}
									</span>
									<span className="vds-chapter-radio-start-time">
										{chapter.startTimeText}
									</span>
									<span className="vds-chapter-radio-duration">
										{chapter.durationText}
									</span>
								</div>
							</Menu.Radio>
						);
					})}
				</Menu.RadioGroup>
			</Menu.Items>
		</Menu.Root>
	);
}

function buildPreviewChapterSelections(
	chapterOptions: readonly ChapterOption[],
	durationSeconds: number,
): PreviewChapterSelection[] {
	return chapterOptions.flatMap((option, index) => {
		const startSeconds = option.cue.startTime;
		const nextChapterStartSeconds = chapterOptions[index + 1]?.cue.startTime;
		const endSeconds = resolveChapterEndSeconds({
			cueEndSeconds: option.cue.endTime,
			durationSeconds,
			nextChapterStartSeconds,
			startSeconds,
		});

		if (!Number.isFinite(startSeconds) || endSeconds <= startSeconds) {
			return [];
		}

		return [
			{
				durationText: option.durationText,
				endUs: secondsToMicroseconds(endSeconds),
				label: option.label,
				selected: option.selected,
				startTimeText: option.startTimeText,
				startUs: secondsToMicroseconds(startSeconds),
				value: option.value,
			},
		];
	});
}

function resolveChapterEndSeconds({
	cueEndSeconds,
	durationSeconds,
	nextChapterStartSeconds,
	startSeconds,
}: {
	cueEndSeconds: number;
	durationSeconds: number;
	nextChapterStartSeconds?: number;
	startSeconds: number;
}): number {
	if (
		typeof nextChapterStartSeconds === "number" &&
		Number.isFinite(nextChapterStartSeconds) &&
		nextChapterStartSeconds > startSeconds
	) {
		return nextChapterStartSeconds;
	}

	if (Number.isFinite(durationSeconds) && durationSeconds > startSeconds) {
		return durationSeconds;
	}

	if (Number.isFinite(cueEndSeconds) && cueEndSeconds > startSeconds) {
		return cueEndSeconds;
	}

	return startSeconds;
}

function createPreviewPlayerSrc(
	previewUrl: string,
	mimeType: string,
	asset: ReadyMediaAsset,
): PlayerSrc | undefined {
	if (!previewUrl) {
		return undefined;
	}

	return {
		src: previewUrl,
		type:
			mimeType ||
			(asset.tracks.video.length > 0 ? "video/object" : "audio/object"),
	} as PlayerSrc;
}

function secondsToMicroseconds(seconds: number): MediaTimeUs {
	return Math.round(seconds * 1_000_000);
}
