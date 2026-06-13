import { Headphones, Volume2, VolumeX } from "lucide-react";

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
	{ label: "Copy left to both", value: "duplicate-left-to-stereo" },
	{ label: "Copy right to both", value: "duplicate-right-to-stereo" },
];

export function WaveformLane({
	audioDecision,
	durationUs,
	lane,
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
	const audioIncluded = audioDecision?.include ?? true;
	const channelMode = audioDecision?.channelMode ?? "preserve";
	const soloActive = soloedAudioTrackId === lane.track.id;
	const volumePercent = clampVolumePercent(audioDecision?.volumePercent ?? 100);
	const audioControlsDisabled =
		selectionEditingDisabled ||
		(!onAudioTrackIncludedChange && !onAudioTrackVolumePercentChange);

	return (
		<div className="relative border-b border-workbench-border bg-workbench-lane">
			<div
				className="relative z-30 flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1 border-b border-workbench-border bg-workbench-ruler/90 px-3 py-2 backdrop-blur"
				data-testid={`waveform-lane-header-${lane.track.id}`}
			>
				<div className="mr-1 flex shrink-0 flex-wrap items-center gap-1">
					<Button
						aria-label={
							audioIncluded
								? `Exclude ${identity.title} from mix`
								: `Include ${identity.title} in mix`
						}
						aria-pressed={!audioIncluded}
						className={`size-7 rounded border-workbench-border bg-workbench-viewer hover:bg-workbench-hover ${
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
						className={`size-7 rounded border-workbench-border bg-workbench-viewer hover:bg-workbench-hover ${
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
						className={`flex items-center gap-1 ${
							audioIncluded ? "opacity-100" : "opacity-55"
						}`}
					>
						<span className="sr-only">{identity.title} volume</span>
						<input
							aria-label={`${identity.title} volume`}
							className="h-5 w-20 accent-primary"
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
						<span className="w-8 text-right font-mono text-[11px] text-muted-foreground">
							{volumePercent}%
						</span>
					</label>
					<label
						className={`flex items-center ${
							audioIncluded ? "opacity-100" : "opacity-55"
						}`}
					>
						<span className="sr-only">{identity.title} channel fix</span>
						<select
							aria-label={`${identity.title} channel fix`}
							className="h-7 w-44 rounded border border-workbench-border bg-workbench-viewer px-1.5 text-[11px] text-workbench-lane-foreground outline-none hover:bg-workbench-hover focus:border-workbench-progress"
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
				<span className="mr-1 truncate text-sm font-medium text-workbench-lane-foreground">
					{identity.title}
				</span>
				{identity.metadata.map((metadata) => (
					<Badge
						key={metadata}
						className="border-workbench-border-strong font-mono text-muted-foreground"
						variant="outline"
					>
						{metadata}
					</Badge>
				))}
				<LaneStatus lane={lane} status={identity.status} />
			</div>
			{lane.status === "ready" ? (
				<button
					aria-label={`Seek ${identity.title} waveform lane`}
					className="relative block h-16 w-full cursor-crosshair overflow-hidden bg-workbench-lane-alt text-left"
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
					className="relative block h-16 w-full cursor-crosshair overflow-hidden bg-workbench-lane-alt text-left"
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
						className="pointer-events-auto border-destructive/45 bg-destructive/15 text-destructive"
						tabIndex={0}
						variant="outline"
					>
						{status.label}
					</Badge>
				</TooltipTrigger>
				<TooltipContent className="max-w-80">{lane.reason}</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<Badge
			className="border-workbench-border-strong text-muted-foreground"
			variant="outline"
		>
			{status.label}
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
