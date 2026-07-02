import { Headphones, Loader2, Volume2, VolumeX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AudioTrackChannelMode } from "@/editor-core/model";

import type {
	WaveformLaneIdentityInput,
	WaveformLaneIdentityViewModel,
	WaveformLaneProps,
} from "./selection-waveform-lane.types";
import type { WaveformLaneState } from "./selection-waveform-lanes.types";
import { WaveformSurface } from "./selection-waveform-surface";

const AUDIO_CHANNEL_MODE_OPTIONS: Array<{
	label: string;
	value: AudioTrackChannelMode;
}> = [
	{ label: "Auto-fix quiet side", value: "auto-one-sided-stereo" },
	{ label: "Keep as recorded", value: "preserve" },
	{ label: "Center left-side audio", value: "use-left-as-mono" },
	{ label: "Center right-side audio", value: "use-right-as-mono" },
	{ label: "Center both sides", value: "average-to-mono" },
];

export function WaveformLane({
	audioDecision,
	audioPreviewPreparing,
	durationUs,
	lane,
	laneHeaderWidthPx,
	minimumSelectionDurationUs,
	onAudioTrackChannelModeChange,
	onAudioTrackIncludedChange,
	onAudioTrackVolumePercentChange,
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
	const channelMode = audioDecision?.channelMode ?? "preserve";
	const soloActive = soloedAudioTrackId === lane.track.id;
	const volumePercent = clampVolumePercent(audioDecision?.volumePercent ?? 100);
	const audioControlsDisabled =
		selectionEditingDisabled ||
		(!onAudioTrackIncludedChange && !onAudioTrackVolumePercentChange);

	return (
		<div
			className="relative grid border-b border-workbench-border bg-workbench-lane"
			style={{
				gridTemplateColumns: `${laneHeaderWidthPx}px minmax(0, 1fr)`,
			}}
		>
			<div
				className="sticky left-0 z-40 flex min-h-24 min-w-0 flex-col gap-1.5 border-r border-workbench-border bg-workbench-ruler/95 px-2.5 py-2 backdrop-blur"
				data-testid={`waveform-lane-header-${lane.track.id}`}
			>
				<div className="flex min-w-0 items-start justify-between gap-1.5">
					<div className="min-w-0">
						<div className="truncate text-sm font-medium text-workbench-lane-foreground">
							{identity.title}
						</div>
						<div className="truncate font-mono text-[10px] leading-4 text-muted-foreground">
							{metadataLabel}
						</div>
					</div>
					<LaneStatus lane={lane} status={identity.status} />
				</div>
				<div className="flex min-w-0 flex-wrap items-center gap-1">
					<Button
						aria-label={
							audioIncluded
								? `Exclude ${identity.title} from mix`
								: `Include ${identity.title} in mix`
						}
						aria-pressed={!audioIncluded}
						className={`size-6 rounded border-workbench-border bg-workbench-viewer hover:bg-workbench-hover ${
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
							<Volume2 data-icon="inline-start" />
						) : (
							<VolumeX data-icon="inline-start" />
						)}
					</Button>
					<Button
						aria-label={
							soloActive ? `Unsolo ${identity.title}` : `Solo ${identity.title}`
						}
						aria-pressed={soloActive}
						className={`size-6 rounded border-workbench-border bg-workbench-viewer hover:bg-workbench-hover ${
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
						<Headphones data-icon="inline-start" />
					</Button>
					<label
						className={`flex min-w-0 flex-1 items-center gap-1 ${
							audioIncluded ? "opacity-100" : "opacity-55"
						}`}
					>
						<span className="sr-only">{identity.title} volume</span>
						<input
							aria-label={`${identity.title} volume`}
							className="h-5 min-w-10 flex-1 accent-primary"
							disabled={
								audioControlsDisabled || !onAudioTrackVolumePercentChange
							}
							max="100"
							min="0"
							onChange={(event) => {
								onAudioTrackVolumePercentChange?.(
									lane.track.id,
									Number.parseInt(event.currentTarget.value, 10),
								);
							}}
							onClick={(event) => event.stopPropagation()}
							onPointerDown={(event) => event.stopPropagation()}
							type="range"
							value={volumePercent}
						/>
						<span className="w-7 text-right font-mono text-[10px] text-muted-foreground">
							{volumePercent}%
						</span>
					</label>
					<label
						className={`flex min-w-0 flex-1 basis-full items-center ${
							audioIncluded ? "opacity-100" : "opacity-55"
						}`}
					>
						<span className="sr-only">{identity.title} channel fix</span>
						<select
							aria-label={`${identity.title} channel fix`}
							className="h-6 w-full rounded border border-workbench-border bg-workbench-viewer px-1.5 text-[10px] text-workbench-lane-foreground outline-none hover:bg-workbench-hover focus:border-workbench-progress"
							disabled={
								selectionEditingDisabled || !onAudioTrackChannelModeChange
							}
							onChange={(event) => {
								onAudioTrackChannelModeChange?.(
									lane.track.id,
									event.currentTarget.value as AudioTrackChannelMode,
								);
							}}
							onPointerDown={(event) => event.stopPropagation()}
							value={channelMode}
						>
							{AUDIO_CHANNEL_MODE_OPTIONS.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</label>
				</div>
				{audioPreviewPreparing ? (
					<Badge
						className="w-fit gap-1 border-workbench-progress/45 bg-workbench-progress/15 text-workbench-progress"
						variant="outline"
					>
						<Loader2 className="size-3 animate-spin" />
						Preparing audio
					</Badge>
				) : null}
			</div>
			{lane.status === "ready" ? (
				<button
					aria-label={`Seek ${identity.title} waveform lane`}
					className="relative block h-full min-h-24 min-w-0 cursor-crosshair overflow-hidden border-0 bg-workbench-lane-alt text-left"
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
					className="relative block h-full min-h-24 min-w-0 cursor-crosshair overflow-hidden border-0 bg-workbench-lane-alt text-left"
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
}

function clampVolumePercent(volumePercent: number) {
	if (!Number.isFinite(volumePercent)) {
		return 100;
	}

	return Math.max(0, Math.min(100, Math.round(volumePercent)));
}

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
