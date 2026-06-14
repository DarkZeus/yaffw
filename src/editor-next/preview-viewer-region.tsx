import { CircleDot, Maximize2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { formatMediaTime } from "./media-time-presentation";
import type { PreviewViewerRegionProps } from "./preview-viewer-region.types";

export function PreviewViewerRegion({
	asset,
	canFullscreen,
	isPlaying,
	multitrackContainerRef,
	onEnded,
	onNativePause,
	onNativePlay,
	onRequestFullscreen,
	onSyncPlayhead,
	playbackRate,
	playheadUs,
	previewApertureStyle,
	previewPosterSrc,
	previewSurfaceRef,
	previewUrl,
	videoRef,
}: PreviewViewerRegionProps) {
	return (
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
						<span className="font-medium text-foreground">Program viewer</span>
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
							onEnded={onEnded}
							onPause={onNativePause}
							onPlay={onNativePlay}
							onSeeked={onSyncPlayhead}
							onTimeUpdate={onSyncPlayhead}
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
	);
}
