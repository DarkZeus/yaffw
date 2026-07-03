import { Headphones, Loader2, Volume2, VolumeX } from "lucide-react";
import { memo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

import type {
	WaveformLaneIdentityInput,
	WaveformLaneIdentityViewModel,
	WaveformLaneProps,
} from "./selection-waveform-lane.types";
import type { WaveformLaneState } from "./selection-waveform-lanes.types";
import { WaveformSurface } from "./selection-waveform-surface";

export const WaveformLane = memo(function WaveformLane({
	audioDecision,
	audioPreviewPreparing,
	durationUs,
	lane,
	laneHeaderWidthPx,
	minimumSelectionDurationUs,
	onAudioTrackIncludedChange,
	onPlayheadSeekRequested,
	onPointerDown,
	onSelectionCommitRequested,
	onSelectionPreviewRequested,
	onSoloedAudioTrackChange,
	selection,
	selectionEditingDisabled,
	selectionEditInProgress,
	soloedAudioTrackId = null,
	trackIndex,
}: WaveformLaneProps) {
	const identity = createWaveformLaneIdentityViewModel({
		status: lane.status,
		track: lane.track,
		trackIndex,
	});
	const metadataLabel = identity.metadata.join(" / ");
	const audioIncluded = audioDecision?.include ?? true;
	const soloActive = soloedAudioTrackId === lane.track.id;

	return (
		<div
			className="relative grid border-b border-workbench-border bg-workbench-lane"
			style={{
				gridTemplateColumns: `${laneHeaderWidthPx}px minmax(0, 1fr)`,
			}}
		>
			<div
				className="sticky left-0 z-40 grid min-h-14 min-w-0 grid-rows-[auto_auto] gap-1 border-r border-workbench-border bg-workbench-ruler/95 px-2 py-1.5 backdrop-blur"
				data-testid={`waveform-lane-header-${lane.track.id}`}
			>
				<div className="flex min-w-0 items-start justify-between gap-1">
					<div className="min-w-0">
						<div className="truncate text-xs font-medium leading-4 text-workbench-lane-foreground">
							{identity.title}
						</div>
						<div className="truncate font-mono text-[9px] leading-3 text-muted-foreground">
							{metadataLabel}
						</div>
					</div>
					<LaneStatus lane={lane} status={identity.status} />
				</div>
				<div className="flex min-w-0 items-center justify-between gap-1">
					<div className="flex min-w-0 items-center gap-1">
						<Button
							aria-label={
								audioIncluded
									? `Exclude ${identity.title} from output`
									: `Include ${identity.title} in output`
							}
							aria-pressed={audioIncluded}
							className={`size-5 rounded border-workbench-border bg-workbench-viewer hover:bg-workbench-hover ${
								audioIncluded
									? "text-workbench-lane-foreground"
									: "text-muted-foreground"
							}`}
							disabled={selectionEditingDisabled || !onAudioTrackIncludedChange}
							onClick={(event) => {
								event.stopPropagation();
								onAudioTrackIncludedChange?.(lane.track.id, !audioIncluded);
							}}
							onPointerDown={(event) => event.stopPropagation()}
							size="icon"
							type="button"
							variant="outline"
						>
							{audioIncluded ? (
								<Volume2 aria-hidden="true" className="size-3" />
							) : (
								<VolumeX aria-hidden="true" className="size-3" />
							)}
						</Button>
						<Button
							aria-label={
								soloActive
									? `Clear ${identity.title} preview solo`
									: `Solo ${identity.title} for preview`
							}
							aria-pressed={soloActive}
							className={`size-5 rounded border-workbench-border bg-workbench-viewer hover:bg-workbench-hover ${
								soloActive
									? "border-workbench-progress/50 bg-workbench-progress/15 text-workbench-progress"
									: "text-muted-foreground"
							}`}
							disabled={!onSoloedAudioTrackChange}
							onClick={(event) => {
								event.stopPropagation();
								onSoloedAudioTrackChange?.(soloActive ? null : lane.track.id);
							}}
							onPointerDown={(event) => event.stopPropagation()}
							size="icon"
							type="button"
							variant="outline"
						>
							<Headphones aria-hidden="true" className="size-3" />
						</Button>
					</div>
					{audioPreviewPreparing ? (
						<Badge
							className="h-5 max-w-[5.75rem] gap-1 truncate border-workbench-progress/45 bg-workbench-progress/15 px-1 text-[9px] leading-none text-workbench-progress"
							variant="outline"
						>
							<Loader2 className="size-2.5 shrink-0 animate-spin" />
							<span className="truncate">Preparing audio</span>
						</Badge>
					) : null}
				</div>
			</div>
			{lane.status === "ready" ? (
				<button
					aria-label={`Seek ${identity.title} waveform lane`}
					className="relative block h-full min-h-14 min-w-0 cursor-crosshair overflow-hidden border-0 bg-workbench-lane-alt text-left"
					type="button"
				>
					<div className="absolute inset-x-0 top-1/2 h-px bg-workbench-border" />
					<WaveformSurface
						durationUs={durationUs}
						label={identity.title}
						minimumSelectionDurationUs={minimumSelectionDurationUs}
						onPlayheadSeekRequested={onPlayheadSeekRequested}
						onSelectionCommitRequested={onSelectionCommitRequested}
						onSelectionPreviewRequested={onSelectionPreviewRequested}
						samples={lane.samples}
						selection={selection}
						selectionEditingDisabled={selectionEditingDisabled}
						selectionEditInProgress={selectionEditInProgress}
					/>
				</button>
			) : (
				<button
					aria-label={`Seek ${identity.title} waveform lane`}
					className="relative block h-full min-h-14 min-w-0 cursor-crosshair overflow-hidden border-0 bg-workbench-lane-alt text-left"
					onMouseDown={(event) => {
						if (typeof window.PointerEvent === "undefined") {
							onPointerDown(event);
						}
					}}
					onPointerDown={onPointerDown}
					type="button"
				>
					<div className="absolute inset-x-0 top-1/2 h-px bg-workbench-border" />
					{lane.status === "loading" ? (
						<div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
							Loading waveform
						</div>
					) : null}
					{lane.status === "unavailable" ? (
						<div className="absolute inset-0 grid place-items-center px-4 text-xs text-muted-foreground">
							Waveform generation failed
						</div>
					) : null}
				</button>
			)}
		</div>
	);
});

function LaneStatus({
	lane,
	status,
}: {
	lane: WaveformLaneState;
	status: WaveformLaneIdentityViewModel["status"];
}) {
	if (status.tone === "ready") {
		return null;
	}

	if (lane.status === "unavailable") {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<Badge
						className="pointer-events-auto shrink-0 border-destructive/45 bg-destructive/15 px-1.5 text-[10px] text-destructive"
						tabIndex={0}
						title={status.label}
						variant="outline"
					>
						Failed
					</Badge>
				</TooltipTrigger>
				<TooltipContent className="max-w-80">{lane.reason}</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<Badge
			className="shrink-0 border-workbench-border-strong px-1.5 text-[10px] text-muted-foreground"
			title={status.label}
			variant="outline"
		>
			Loading
		</Badge>
	);
}

export function createWaveformLaneIdentityViewModel({
	status,
	track,
	trackIndex,
}: WaveformLaneIdentityInput): WaveformLaneIdentityViewModel {
	const title = track.label?.trim() || `Unnamed audio lane ${trackIndex + 1}`;

	return {
		metadata: [
			formatTrackCodec(track.codec),
			formatTrackChannels(track.channels),
		],
		status: formatWaveformLaneStatus(status),
		title,
	};
}

function formatTrackCodec(codec: string | undefined) {
	const normalizedCodec = codec?.trim();

	if (!normalizedCodec) {
		return "Codec unknown";
	}

	return normalizedCodec.toUpperCase();
}

function formatTrackChannels(channels: number | undefined) {
	if (!channels || channels <= 0) {
		return "Channels unknown";
	}

	return channels === 1 ? "1 channel" : `${channels} channels`;
}

function formatWaveformLaneStatus(
	status: WaveformLaneState["status"],
): WaveformLaneIdentityViewModel["status"] {
	switch (status) {
		case "loading":
			return {
				label: "Loading waveform",
				tone: "pending",
			};
		case "ready":
			return {
				label: "Waveform ready",
				tone: "ready",
			};
		case "unavailable":
			return {
				label: "Waveform generation failed",
				tone: "unavailable",
			};
	}
}
