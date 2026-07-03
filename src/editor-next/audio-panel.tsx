import {
	AudioLines,
	Headphones,
	RefreshCcw,
	Volume2,
	VolumeX,
} from "lucide-react";
import { memo, useMemo } from "react";

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
} from "./preview-level-meter";
import type {
	LivePreviewMeteringClock,
	LivePreviewMeteringCombinedState,
	LivePreviewMeteringTrackState,
} from "./preview-metering-live";
import { useLivePreviewMetering } from "./use-live-preview-metering";

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
		clock?: LivePreviewMeteringClock | null;
		onTrackRetry?: (trackId: string) => void;
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

export const AudioPanel = memo(function AudioPanel({
	asset,
	audioEditingDisabled = false,
	audioMix: providedAudioMix,
	onAudioTrackChannelModeChange,
	onAudioTrackIncludedChange,
	onAudioTrackVolumePercentChange,
	previewMetering,
	onSoloedAudioTrackChange,
	soloedAudioTrackId = null,
}: AudioPanelProps) {
	const defaultAudioMix = useMemo(() => createDefaultAudioMix(asset), [asset]);
	const audioMix = providedAudioMix ?? defaultAudioMix;
	const audioTracks = asset.tracks.audio;
	const audioTrackIds = useMemo(
		() => audioTracks.map((track) => track.id),
		[audioTracks],
	);
	const livePreviewMetering = useLivePreviewMetering({
		audioMix,
		clock: previewMetering?.clock,
		enabled: Boolean(previewMetering),
		knownTrackIds: audioTrackIds,
		soloedAudioTrackId,
	});

	return (
		<section
			aria-label="Audio panel"
			className="flex min-w-0 max-w-full flex-col overflow-hidden rounded-md border border-workbench-border bg-workbench-inspector xl:h-full xl:min-h-0 xl:rounded-none xl:border-0"
		>
			<div className="min-h-0 flex-1 overflow-auto overscroll-contain px-2 py-2">
				{audioTracks.length === 0 ? (
					<AudioEmptyState />
				) : (
					<div
						aria-label="Audio channel strip bank"
						className="flex w-max items-start overflow-hidden rounded border border-workbench-border bg-workbench-viewer/35"
					>
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
								previewMeteringState={livePreviewMetering.trackStates[track.id]}
								soloActive={soloedAudioTrackId === track.id}
								track={track}
							/>
						))}
						<CombinedPreviewStrip
							previewMeteringControlled={Boolean(previewMetering)}
							previewMeteringState={livePreviewMetering.combinedState}
						/>
					</div>
				)}
			</div>
		</section>
	);
});

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
	previewMeteringState?: LivePreviewMeteringTrackState;
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
			className={`grid h-[24rem] w-32 shrink-0 grid-rows-[auto_minmax(0,1fr)_auto_auto] gap-2 border-r border-workbench-border bg-workbench-lane px-2 py-2 ${
				meterDisplay.excluded ? "opacity-70" : ""
			}`}
			data-preview-meter-excluded={meterDisplay.excluded ? "true" : undefined}
		>
			<div className="grid min-w-0 gap-1">
				<div className="flex min-w-0 items-center justify-between gap-2">
					<span className="truncate text-xs font-medium text-foreground">
						{label}
					</span>
					<span className="rounded-sm border border-workbench-border bg-workbench-viewer px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-normal text-muted-foreground">
						{meterDisplay.statusLabel}
					</span>
				</div>
				<div className="truncate text-[10px] leading-tight text-muted-foreground">
					{formatAudioTrackMeta(track)}
				</div>
			</div>
			<div className="grid min-h-0 min-w-0 grid-cols-[2.25rem_2.25rem] justify-center gap-2">
				<label className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] justify-items-center gap-1 rounded-sm border border-workbench-border bg-workbench-viewer px-1 py-2">
					<span className="font-mono text-[10px] text-workbench-progress">
						{volumePercent}%
					</span>
					<span className="sr-only">{label} track volume</span>
					<input
						aria-label={`${label} track volume`}
						aria-valuetext={`${volumePercent}%`}
						className="h-full min-h-32 w-5 [accent-color:var(--workbench-border-strong)] [writing-mode:vertical-lr]"
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
				</label>
				<div className="min-h-0 min-w-0">
					<PreviewLevelMeter
						channelWidthRem={0.7}
						channels={meterDisplay.channels}
						label={`${label} preview meter`}
						message={meterDisplay.message}
						showChannelLabels={false}
						showTickLabels={false}
						state={meterDisplay.state}
					/>
				</div>
			</div>
			<div className="grid min-w-0 gap-1">
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
					<span className="min-w-0 truncate text-center text-[10px] leading-4 text-muted-foreground">
						{meterDisplay.reason}
					</span>
				) : null}
			</div>
			<div
				aria-label={`${label} audio controls`}
				className="grid min-w-0 gap-1.5"
			>
				<label className="grid min-w-0 gap-1">
					<span className="sr-only">{label} channel handling</span>
					<select
						aria-label={`${label} channel handling`}
						className="h-7 min-w-0 rounded border border-workbench-border bg-workbench-viewer px-1.5 text-[10px] text-workbench-lane-foreground outline-none hover:bg-workbench-hover focus:border-workbench-progress"
						disabled={audioEditingDisabled || !onAudioTrackChannelModeChange}
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
				<div className="grid grid-cols-2 gap-1">
					<Button
						aria-label={
							audioIncluded
								? `Exclude ${label} from output`
								: `Include ${label} in output`
						}
						aria-pressed={audioIncluded}
						className={`h-7 min-w-0 justify-center rounded border-workbench-border bg-workbench-viewer px-1 text-[10px] hover:bg-workbench-hover ${
							audioIncluded
								? "text-workbench-lane-foreground"
								: "text-muted-foreground"
						}`}
						disabled={audioEditingDisabled || !onAudioTrackIncludedChange}
						onClick={() => {
							onAudioTrackIncludedChange?.(track.id, !audioIncluded);
						}}
						size="sm"
						title={audioIncluded ? "Output included" : "Output excluded"}
						type="button"
						variant="outline"
					>
						{audioIncluded ? (
							<Volume2 aria-hidden="true" className="size-3" />
						) : (
							<VolumeX aria-hidden="true" className="size-3" />
						)}
						<span className="sr-only">
							{audioIncluded ? "Output included" : "Output excluded"}
						</span>
					</Button>
					<Button
						aria-label={
							soloActive
								? `Clear ${label} preview solo`
								: `Solo ${label} for preview`
						}
						aria-pressed={soloActive}
						className={`h-7 min-w-0 justify-center rounded border-workbench-border bg-workbench-viewer px-1 text-[10px] hover:bg-workbench-hover ${
							soloActive
								? "border-workbench-progress/50 bg-workbench-progress/15 text-workbench-progress"
								: "text-muted-foreground"
						}`}
						disabled={!onSoloedAudioTrackChange}
						onClick={() => {
							onSoloedAudioTrackChange?.(soloActive ? null : track.id);
						}}
						size="sm"
						title={soloActive ? "Clear preview solo" : "Preview solo"}
						type="button"
						variant="outline"
					>
						<Headphones aria-hidden="true" className="size-3" />
						<span className="sr-only">Preview solo</span>
					</Button>
				</div>
			</div>
		</section>
	);
}

function clampVolumePercent(volumePercent: number) {
	if (!Number.isFinite(volumePercent)) {
		return 100;
	}

	return Math.max(0, Math.min(100, Math.round(volumePercent)));
}

function CombinedPreviewStrip({
	previewMeteringControlled,
	previewMeteringState,
}: {
	previewMeteringControlled: boolean;
	previewMeteringState?: LivePreviewMeteringCombinedState;
}) {
	const meterDisplay = createCombinedMeterDisplay({
		controlled: previewMeteringControlled,
		state: previewMeteringState,
	});

	return (
		<section
			aria-label="Combined preview strip"
			className="grid h-[24rem] w-28 shrink-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-2 border-r border-workbench-border-strong bg-workbench-lane-alt px-2 py-2"
		>
			<div className="grid min-w-0 gap-1">
				<div className="flex min-w-0 items-center justify-between gap-2">
					<span className="truncate text-xs font-medium text-foreground">
						Combined preview
					</span>
					<span className="rounded-sm border border-workbench-border bg-workbench-viewer px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-normal text-muted-foreground">
						{meterDisplay.statusLabel}
					</span>
				</div>
				<div className="truncate text-[10px] leading-tight text-muted-foreground">
					Monitored output
				</div>
			</div>
			<div className="mx-auto min-h-0 w-9">
				<PreviewLevelMeter
					channelWidthRem={0.7}
					channels={meterDisplay.channels}
					label="Combined preview output meter"
					message={meterDisplay.message}
					showChannelLabels={false}
					showTickLabels={false}
					state={meterDisplay.state}
				/>
			</div>
			<div className="grid min-w-0 gap-1">
				{meterDisplay.reason ? (
					<span className="min-w-0 truncate text-center text-[10px] leading-4 text-muted-foreground">
						{meterDisplay.reason}
					</span>
				) : null}
			</div>
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
	state?: LivePreviewMeteringTrackState;
	track: AudioMediaTrack;
	trackIndex: number;
}): {
	channels: PreviewLevelMeterChannel[];
	excluded: boolean;
	message?: string;
	reason?: string;
	state: PreviewLevelMeterState;
	statusLabel: string;
} {
	if (!controlled) {
		return {
			channels: createStaticTrackMeterChannels(track, trackIndex),
			excluded: false,
			state: "ready",
			statusLabel: "Ready",
		};
	}

	if (!state || state.status === "preparing") {
		return {
			channels: [],
			excluded: false,
			message: "Preparing preview meters",
			state: "preparing",
			statusLabel: "Preparing",
		};
	}

	if (state.status === "unavailable") {
		return {
			channels: [],
			excluded: false,
			message: "Meter unavailable",
			reason: state.reason,
			state: "unavailable",
			statusLabel: "Unavailable",
		};
	}

	return {
		channels: state.channels,
		excluded: state.excluded,
		state: "ready",
		statusLabel: state.excluded ? "Excluded" : "Ready",
	};
}

function createCombinedMeterDisplay({
	controlled,
	state,
}: {
	controlled: boolean;
	state?: LivePreviewMeteringCombinedState;
}): {
	channels: PreviewLevelMeterChannel[];
	message?: string;
	reason?: string;
	state: PreviewLevelMeterState;
	statusLabel: string;
} {
	if (!controlled) {
		return {
			channels: [
				{ clipHeld: false, label: "Left", peakDb: -16 },
				{ clipHeld: false, label: "Right", peakDb: -18 },
			],
			state: "ready",
			statusLabel: "Ready",
		};
	}

	if (!state || state.status === "preparing") {
		return {
			channels: [],
			message: state?.reason ?? "Preparing monitored output",
			reason: state?.reason,
			state: "preparing",
			statusLabel: "Preparing",
		};
	}

	if (state.status === "unavailable") {
		return {
			channels: [],
			message: "Output meter unavailable",
			reason: state.reason,
			state: "unavailable",
			statusLabel: "Unavailable",
		};
	}

	return {
		channels: state.channels,
		reason: state.reason,
		state: "ready",
		statusLabel: state.partial ? "Partial" : "Ready",
	};
}
