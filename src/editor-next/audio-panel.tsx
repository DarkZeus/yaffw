import {
	AudioLines,
	Headphones,
	RefreshCcw,
	Volume2,
	VolumeX,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	createDefaultAudioMix,
	createDefaultAudioMixTrackDecision,
} from "@/editor-core/audio-mix";
import type {
	AudioMediaTrack,
	AudioMix,
	AudioTrackChannelMode,
	ReadyMediaAsset,
} from "@/editor-core/model";
import {
	PreviewLevelMeter,
	type PreviewLevelMeterChannel,
	type PreviewLevelMeterState,
	previewPeakMeterVisualRange,
} from "./preview-level-meter";
import type {
	PreviewMeteringTrackState,
	PreviewMeteringTrackStates,
} from "./preview-metering-preparation.types";

export type AudioPanelProps = {
	asset: ReadyMediaAsset;
	audioEditingDisabled?: boolean;
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
	previewMetering?: {
		onTrackRetry?: (trackId: string) => void;
		trackStates: PreviewMeteringTrackStates;
	};
	onSoloedAudioTrackChange?: (trackId: string | null) => void;
	soloedAudioTrackId?: string | null;
};

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

export function AudioPanel({
	asset,
	audioEditingDisabled = false,
	audioMix = createDefaultAudioMix(asset),
	onAudioTrackChannelModeChange,
	onAudioTrackIncludedChange,
	onAudioTrackVolumePercentChange,
	previewMetering,
	onSoloedAudioTrackChange,
	soloedAudioTrackId = null,
}: AudioPanelProps) {
	const audioTracks = asset.tracks.audio;

	return (
		<section
			aria-label="Audio panel"
			className="flex min-w-0 max-w-full flex-col overflow-hidden rounded-md border border-workbench-border bg-workbench-inspector xl:h-full xl:min-h-0 xl:rounded-none xl:border-0"
		>
			<div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
				{audioTracks.length === 0 ? (
					<AudioEmptyState />
				) : (
					<div className="grid gap-2">
						{audioTracks.map((track, index) => (
							<AudioTrackStrip
								audioEditingDisabled={audioEditingDisabled}
								decision={
									audioMix.tracks[track.id] ??
									createDefaultAudioMixTrackDecision(track)
								}
								index={index}
								key={track.id}
								onAudioTrackChannelModeChange={onAudioTrackChannelModeChange}
								onAudioTrackIncludedChange={onAudioTrackIncludedChange}
								onAudioTrackVolumePercentChange={
									onAudioTrackVolumePercentChange
								}
								onPreviewMeteringRetry={previewMetering?.onTrackRetry}
								onSoloedAudioTrackChange={onSoloedAudioTrackChange}
								previewMeteringControlled={Boolean(previewMetering)}
								previewMeteringState={previewMetering?.trackStates[track.id]}
								soloActive={soloedAudioTrackId === track.id}
								track={track}
							/>
						))}
						<CombinedPreviewStrip />
					</div>
				)}
			</div>
		</section>
	);
}

function AudioTrackStrip({
	audioEditingDisabled,
	decision,
	index,
	onAudioTrackChannelModeChange,
	onAudioTrackIncludedChange,
	onAudioTrackVolumePercentChange,
	onPreviewMeteringRetry,
	onSoloedAudioTrackChange,
	previewMeteringControlled,
	previewMeteringState,
	soloActive,
	track,
}: {
	audioEditingDisabled: boolean;
	decision: AudioMix["tracks"][string];
	index: number;
	onAudioTrackChannelModeChange?: (
		trackId: string,
		channelMode: AudioTrackChannelMode,
	) => void;
	onAudioTrackIncludedChange?: (trackId: string, include: boolean) => void;
	onAudioTrackVolumePercentChange?: (
		trackId: string,
		volumePercent: number,
	) => void;
	onPreviewMeteringRetry?: (trackId: string) => void;
	onSoloedAudioTrackChange?: (trackId: string | null) => void;
	previewMeteringControlled: boolean;
	previewMeteringState?: PreviewMeteringTrackState;
	soloActive: boolean;
	track: AudioMediaTrack;
}) {
	const label = track.label ?? `Audio ${index + 1}`;
	const audioIncluded = decision.include;
	const volumePercent = clampVolumePercent(decision.volumePercent);
	const meterDisplay = createTrackMeterDisplay({
		controlled: previewMeteringControlled,
		state: previewMeteringState,
		track,
		trackIndex: index,
	});

	return (
		<section
			aria-label={`Audio track strip ${label}`}
			className="grid min-h-40 min-w-0 grid-cols-[minmax(0,1fr)_2.75rem_4.75rem] gap-2 rounded border border-workbench-border bg-workbench-lane p-2"
		>
			<div className="flex min-w-0 flex-col justify-between gap-3">
				<div className="grid min-w-0 gap-2">
					<div className="min-w-0">
						<div className="truncate text-xs font-medium text-foreground">
							{label}
						</div>
						<div className="mt-0.5 truncate text-[10px] leading-tight text-muted-foreground">
							{formatAudioTrackMeta(track)}
						</div>
					</div>
					<div className="grid gap-1.5">
						<div className="flex min-w-0 flex-wrap items-center gap-1.5">
							<Button
								aria-label={
									audioIncluded
										? `Exclude ${label} from output`
										: `Include ${label} in output`
								}
								aria-pressed={audioIncluded}
								className={`h-6 rounded border-workbench-border bg-workbench-viewer px-1.5 text-[10px] hover:bg-workbench-hover ${
									audioIncluded
										? "text-workbench-lane-foreground"
										: "text-muted-foreground"
								}`}
								disabled={audioEditingDisabled || !onAudioTrackIncludedChange}
								onClick={() => {
									onAudioTrackIncludedChange?.(track.id, !audioIncluded);
								}}
								size="sm"
								type="button"
								variant="outline"
							>
								{audioIncluded ? (
									<Volume2 data-icon="inline-start" />
								) : (
									<VolumeX data-icon="inline-start" />
								)}
								{audioIncluded ? "Output included" : "Output excluded"}
							</Button>
							<Button
								aria-label={
									soloActive
										? `Clear ${label} preview solo`
										: `Solo ${label} for preview`
								}
								aria-pressed={soloActive}
								className={`h-6 rounded border-workbench-border bg-workbench-viewer px-1.5 text-[10px] hover:bg-workbench-hover ${
									soloActive
										? "border-workbench-progress/50 bg-workbench-progress/15 text-workbench-progress"
										: "text-muted-foreground"
								}`}
								disabled={!onSoloedAudioTrackChange}
								onClick={() => {
									onSoloedAudioTrackChange?.(soloActive ? null : track.id);
								}}
								size="sm"
								type="button"
								variant="outline"
							>
								<Headphones data-icon="inline-start" />
								Preview solo
							</Button>
						</div>
						<label className="grid min-w-0 gap-1">
							<span className="text-[10px] font-medium uppercase tracking-normal text-muted-foreground">
								Channel handling
							</span>
							<select
								aria-label={`${label} channel handling`}
								className="h-7 min-w-0 rounded border border-workbench-border bg-workbench-viewer px-1.5 text-[10px] text-workbench-lane-foreground outline-none hover:bg-workbench-hover focus:border-workbench-progress"
								disabled={
									audioEditingDisabled || !onAudioTrackChannelModeChange
								}
								onChange={(event) => {
									onAudioTrackChannelModeChange?.(
										track.id,
										event.currentTarget.value as AudioTrackChannelMode,
									);
								}}
								value={decision.channelMode}
							>
								{AUDIO_CHANNEL_MODE_OPTIONS.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
						</label>
					</div>
				</div>
				<div className="flex min-w-0 flex-wrap items-center gap-1.5">
					<span className="rounded-sm border border-workbench-border bg-workbench-viewer px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-normal text-muted-foreground">
						Track meter
					</span>
					<span className="rounded-sm border border-workbench-border bg-workbench-viewer px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-normal text-muted-foreground">
						{meterDisplay.statusLabel}
					</span>
					{meterDisplay.state === "unavailable" && onPreviewMeteringRetry ? (
						<Button
							aria-label={`Retry ${label} preview meter`}
							className="h-6 rounded border-workbench-border bg-workbench-viewer px-1.5 text-[10px] text-muted-foreground hover:bg-workbench-hover"
							onClick={() => {
								onPreviewMeteringRetry(track.id);
							}}
							size="sm"
							type="button"
							variant="outline"
						>
							<RefreshCcw data-icon="inline-start" />
							Retry
						</Button>
					) : null}
					{meterDisplay.reason ? (
						<span className="min-w-0 truncate text-[10px] leading-4 text-muted-foreground">
							{meterDisplay.reason}
						</span>
					) : null}
				</div>
			</div>
			<label className="flex min-w-0 flex-col items-center justify-between gap-2 rounded-sm border border-workbench-border bg-workbench-viewer px-1.5 py-2">
				<span className="sr-only">{label} track volume</span>
				<input
					aria-label={`${label} track volume`}
					aria-valuetext={`${volumePercent}%`}
					className="h-24 w-5 accent-primary [writing-mode:vertical-lr]"
					disabled={audioEditingDisabled || !onAudioTrackVolumePercentChange}
					max="100"
					min="0"
					onChange={(event) => {
						onAudioTrackVolumePercentChange?.(
							track.id,
							Number.parseInt(event.currentTarget.value, 10),
						);
					}}
					style={{ direction: "rtl" }}
					type="range"
					value={volumePercent}
				/>
				<span className="font-mono text-[10px] text-muted-foreground">
					{volumePercent}%
				</span>
			</label>
			<PreviewLevelMeter
				channels={meterDisplay.channels}
				label={`${label} preview meter`}
				message={meterDisplay.message}
				showTickLabels={false}
				state={meterDisplay.state}
			/>
		</section>
	);
}

function clampVolumePercent(volumePercent: number) {
	if (!Number.isFinite(volumePercent)) {
		return 100;
	}

	return Math.max(0, Math.min(100, Math.round(volumePercent)));
}

function CombinedPreviewStrip() {
	return (
		<section
			aria-label="Combined preview strip"
			className="grid min-h-36 min-w-0 grid-cols-[minmax(0,1fr)_4.75rem] gap-2 rounded border border-workbench-border-strong bg-workbench-lane-alt p-2"
		>
			<div className="flex min-w-0 flex-col justify-between gap-3">
				<div className="min-w-0">
					<div className="truncate text-xs font-medium text-foreground">
						Combined preview
					</div>
					<div className="mt-0.5 truncate text-[10px] leading-tight text-muted-foreground">
						Monitored output
					</div>
				</div>
				<div className="flex flex-wrap gap-1.5">
					<span className="rounded-sm border border-workbench-border bg-workbench-viewer px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-normal text-muted-foreground">
						Output meter
					</span>
				</div>
			</div>
			<PreviewLevelMeter
				channels={[
					{ clipHeld: false, label: "Left", peakDb: -16 },
					{ clipHeld: false, label: "Right", peakDb: -18 },
				]}
				label="Combined preview output meter"
				showTickLabels={false}
				state="ready"
			/>
		</section>
	);
}

function AudioEmptyState() {
	return (
		<div className="grid min-h-36 place-items-center rounded border border-dashed border-workbench-border-strong bg-workbench-lane p-4 text-center">
			<div className="grid max-w-56 justify-items-center gap-2">
				<div className="flex size-8 items-center justify-center rounded border border-workbench-border bg-workbench-viewer text-workbench-progress">
					<AudioLines aria-hidden="true" className="size-4" />
				</div>
				<div className="text-sm font-medium text-foreground">
					No audio tracks
				</div>
				<p className="text-xs leading-5 text-muted-foreground">
					This media asset has no audio tracks available for preview monitoring.
				</p>
			</div>
		</div>
	);
}

function formatAudioTrackMeta(track: AudioMediaTrack): string {
	const parts = [
		track.codec ? track.codec.toUpperCase() : "Codec unknown",
		formatChannels(track.channels),
		track.language,
	].filter((part): part is string => Boolean(part));

	return parts.join(" / ");
}

function formatChannels(channels: number | undefined): string {
	if (typeof channels !== "number") {
		return "Channel layout unknown";
	}

	return channels === 1 ? "1 channel" : `${channels} channels`;
}

function createStaticTrackMeterChannels(
	track: AudioMediaTrack,
	trackIndex: number,
): PreviewLevelMeterChannel[] {
	const channelCount = normalizePreviewMeterChannelCount(track.channels);

	return Array.from({ length: channelCount }, (_, channelIndex) => ({
		clipHeld: false,
		label: formatPreviewMeterChannelLabel(channelCount, channelIndex),
		peakDb: Math.max(-72, -18 - trackIndex * 4 - channelIndex * 3),
	}));
}

function normalizePreviewMeterChannelCount(
	channels: number | undefined,
): number {
	if (!Number.isFinite(channels) || typeof channels !== "number") {
		return 2;
	}

	return Math.min(Math.max(Math.round(channels), 1), 8);
}

function formatPreviewMeterChannelLabel(
	channelCount: number,
	channelIndex: number,
): string {
	if (channelCount === 1) {
		return "Mono";
	}

	if (channelCount === 2) {
		return channelIndex === 0 ? "Left" : "Right";
	}

	return `Ch ${channelIndex + 1}`;
}

function createTrackMeterDisplay({
	controlled,
	state,
	track,
	trackIndex,
}: {
	controlled: boolean;
	state?: PreviewMeteringTrackState;
	track: AudioMediaTrack;
	trackIndex: number;
}): {
	channels: PreviewLevelMeterChannel[];
	message?: string;
	reason?: string;
	state: PreviewLevelMeterState;
	statusLabel: string;
} {
	if (!controlled) {
		return {
			channels: createStaticTrackMeterChannels(track, trackIndex),
			state: "ready",
			statusLabel: "Ready",
		};
	}

	if (!state || state.status === "preparing") {
		return {
			channels: [],
			message: "Preparing decoded samples",
			state: "preparing",
			statusLabel: "Preparing",
		};
	}

	if (state.status === "unavailable") {
		return {
			channels: [],
			message: "Meter unavailable",
			reason: state.reason,
			state: "unavailable",
			statusLabel: "Unavailable",
		};
	}

	return {
		channels: state.prepared.channelLabels.map((channelLabel) => ({
			clipHeld: false,
			label: channelLabel,
			peakDb: previewPeakMeterVisualRange.floorDb,
		})),
		state: "ready",
		statusLabel: "Ready",
	};
}
