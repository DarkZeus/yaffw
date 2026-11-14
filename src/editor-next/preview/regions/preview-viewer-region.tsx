import { Video, VideoPlayer } from "@videojs/react/video";
import { CircleDot, FileX2, Maximize2 } from "lucide-react";
import { type ReactEventHandler, type Ref, type RefObject, memo } from "react";
import { Button } from "@/components/ui/button";
import type {
	MediaTimeUs,
	ReadyMediaAsset,
	Selection,
} from "@/editor-core/model";
import { formatMediaTime } from "../../media-time/format/media-time-presentation";
import { usePreviewApertureLayout } from "../layout/preview-aperture-layout";
import { PreviewVideoSkin } from "../player/preview-video-skin";

export type PreviewViewerRegionProps = {
	asset: ReadyMediaAsset;
	closeFileDisabled?: boolean;
	onCloseFileRequested?: () => void;
	canFullscreen: boolean;
	isPlaying: boolean;
	mediaMuted: boolean;
	onChapterSelectionRequested?: (selection: Selection) => void;
	onEnded: () => void;
	onNativePause: () => void;
	onNativePlay: () => void;
	onNativePlaying: () => void;
	onNativeWaiting: () => void;
	onNativeSeeked: ReactEventHandler<HTMLVideoElement>;
	onRequestFullscreen: () => void;
	onSyncPlayhead: () => void;
	playbackRate: number;
	playbackDisabled: boolean;
	playbackRequested: boolean;
	playheadUs: MediaTimeUs;
	previewUrl: string;
	scrubCanvasRef: RefObject<HTMLCanvasElement | null>;
	scrubFrameVisible: boolean;
	videoRef: Ref<HTMLVideoElement>;
	fullscreenRef: RefObject<HTMLDivElement | null>;
	onTogglePlayback: () => void;
	onPlayheadSeekRequested: (timeUs: MediaTimeUs) => void;
};

export function PreviewViewerRegion({
	asset,
	closeFileDisabled = false,
	onCloseFileRequested,
	canFullscreen,
	fullscreenRef,
	isPlaying,
	mediaMuted,
	onChapterSelectionRequested,
	onEnded,
	onNativePause,
	onNativePlay,
	onNativePlaying,
	onNativeWaiting,
	onNativeSeeked,
	onRequestFullscreen,
	onTogglePlayback,
	onPlayheadSeekRequested,
	onSyncPlayhead,
	playbackRate,
	playbackDisabled,
	playbackRequested,
	playheadUs,
	previewUrl,
	scrubCanvasRef,
	scrubFrameVisible,
	videoRef,
}: PreviewViewerRegionProps) {
	return (
		<section
			aria-label="Workbench center region"
			className="h-full min-h-0 overflow-hidden"
		>
			<section
				aria-label="Native preview player"
				className="flex h-full min-h-0 flex-col"
			>
				<div
					aria-label="Preview viewer header"
					className="flex h-[38px] shrink-0 items-center justify-between gap-3 px-4 text-[11px]"
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
						<span className="text-muted-foreground tabular-nums">
							{playbackRate}x
						</span>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<span
							aria-label="Preview playhead time"
							className="text-[11px] leading-none tabular-nums"
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
						{onCloseFileRequested ? (
							<Button
								aria-label="Close file"
								className="size-7 text-muted-foreground"
								disabled={closeFileDisabled}
								onClick={onCloseFileRequested}
								size="icon"
								title="Close file"
								type="button"
								variant="ghost"
							>
								<FileX2 data-icon="inline-start" />
							</Button>
						) : null}
					</div>
				</div>
				<PreviewMediaSurface
					asset={asset}
					mediaMuted={mediaMuted}
					onChapterSelectionRequested={onChapterSelectionRequested}
					onEnded={onEnded}
					onNativePause={onNativePause}
					onNativePlay={onNativePlay}
					onNativePlaying={onNativePlaying}
					onNativeWaiting={onNativeWaiting}
					onNativeSeeked={onNativeSeeked}
					onSyncPlayhead={onSyncPlayhead}
					previewUrl={previewUrl}
					fullscreenRef={fullscreenRef}
					playbackDisabled={playbackDisabled}
					playbackRequested={playbackRequested}
					playheadUs={playheadUs}
					onTogglePlayback={onTogglePlayback}
					onPlayheadSeekRequested={onPlayheadSeekRequested}
					scrubCanvasRef={scrubCanvasRef}
					scrubFrameVisible={scrubFrameVisible}
					videoRef={videoRef}
				/>
			</section>
		</section>
	);
}

const PreviewMediaSurface = memo(function PreviewMediaSurface({
	asset,
	mediaMuted,
	onChapterSelectionRequested,
	onEnded,
	onNativePause,
	onNativePlay,
	onNativePlaying,
	onNativeWaiting,
	onNativeSeeked,
	onSyncPlayhead,
	previewUrl,
	fullscreenRef,
	playbackDisabled,
	playbackRequested,
	playheadUs,
	onTogglePlayback,
	onPlayheadSeekRequested,
	scrubCanvasRef,
	scrubFrameVisible,
	videoRef,
}: {
	asset: ReadyMediaAsset;
	mediaMuted: boolean;
	onChapterSelectionRequested?: (selection: Selection) => void;
	onEnded: () => void;
	onNativePause: () => void;
	onNativePlay: () => void;
	onNativePlaying: () => void;
	onNativeWaiting: () => void;
	onNativeSeeked: PreviewViewerRegionProps["onNativeSeeked"];
	onSyncPlayhead: () => void;
	previewUrl: string;
	fullscreenRef: PreviewViewerRegionProps["fullscreenRef"];
	playbackDisabled: boolean;
	playbackRequested: boolean;
	playheadUs: MediaTimeUs;
	onTogglePlayback: () => void;
	onPlayheadSeekRequested: (timeUs: MediaTimeUs) => void;
	scrubCanvasRef: PreviewViewerRegionProps["scrubCanvasRef"];
	scrubFrameVisible: boolean;
	videoRef: PreviewViewerRegionProps["videoRef"];
}) {
	const { previewApertureStyle, previewSurfaceRef } =
		usePreviewApertureLayout(asset);
	return (
		<section
			aria-label="Preview viewer surface"
			className="cinema-viewer-surface"
			ref={previewSurfaceRef}
		>
			<section
				aria-label="Preview aperture"
				className="relative isolate max-h-full w-full overflow-hidden bg-black"
				style={previewApertureStyle}
			>
				<VideoPlayer title={asset.label}>
					<PreviewVideoSkin
						durationUs={asset.durationUs}
						fullscreenRef={fullscreenRef}
						playbackDisabled={playbackDisabled}
						playbackRequested={playbackRequested}
						onChapterSelected={onChapterSelectionRequested}
						onSeek={onPlayheadSeekRequested}
						onTogglePlayback={onTogglePlayback}
						playheadUs={playheadUs}
					>
						<PreviewVideo
							aria-label={`Preview for ${asset.label}`}
							className="h-full w-full bg-black object-contain"
							crossOrigin="anonymous"
							muted={mediaMuted}
							onEnded={onEnded}
							onPause={onNativePause}
							onPlay={onNativePlay}
							onPlaying={onNativePlaying}
							onWaiting={onNativeWaiting}
							onSeeked={onNativeSeeked}
							onTimeUpdate={onSyncPlayhead}
							playsInline
							preload="metadata"
							ref={videoRef}
							src={previewUrl || undefined}
						/>

						<canvas
							className={`pointer-events-none absolute inset-0 z-[1] h-full w-full bg-black object-contain ${
								scrubFrameVisible ? "block" : "hidden"
							}`}
							data-testid="scrub-preview-canvas"
							ref={scrubCanvasRef}
						/>
					</PreviewVideoSkin>
				</VideoPlayer>
			</section>
		</section>
	);
});

const PreviewVideo = memo(Video);
