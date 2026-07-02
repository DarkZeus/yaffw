import { AudioLines } from "lucide-react";

import type { AudioMediaTrack, ReadyMediaAsset } from "@/editor-core/model";
import {
	PreviewLevelMeter,
	type PreviewLevelMeterChannel,
} from "./preview-level-meter";

export type AudioPanelProps = {
	asset: ReadyMediaAsset;
};

export function AudioPanel({ asset }: AudioPanelProps) {
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
							<AudioTrackStrip index={index} key={track.id} track={track} />
						))}
						<CombinedPreviewStrip />
					</div>
				)}
			</div>
		</section>
	);
}

function AudioTrackStrip({
	index,
	track,
}: {
	index: number;
	track: AudioMediaTrack;
}) {
	const label = track.label ?? `Audio ${index + 1}`;

	return (
		<section
			aria-label={`Audio track strip ${label}`}
			className="grid min-h-36 min-w-0 grid-cols-[minmax(0,1fr)_4.75rem] gap-2 rounded border border-workbench-border bg-workbench-lane p-2"
		>
			<div className="flex min-w-0 flex-col justify-between gap-3">
				<div className="min-w-0">
					<div className="truncate text-xs font-medium text-foreground">
						{label}
					</div>
					<div className="mt-0.5 truncate text-[10px] leading-tight text-muted-foreground">
						{formatAudioTrackMeta(track)}
					</div>
				</div>
				<div className="flex flex-wrap gap-1.5">
					<span className="rounded-sm border border-workbench-border bg-workbench-viewer px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-normal text-muted-foreground">
						Track meter
					</span>
				</div>
			</div>
			<PreviewLevelMeter
				channels={createStaticTrackMeterChannels(track, index)}
				label={`${label} preview meter`}
				showTickLabels={false}
				state="ready"
			/>
		</section>
	);
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
