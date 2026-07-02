import { AudioLines } from "lucide-react";

import type { AudioMediaTrack, ReadyMediaAsset } from "@/editor-core/model";

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
					<span className="rounded-sm border border-workbench-border bg-workbench-viewer px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-normal text-muted-foreground">
						Scaffold
					</span>
				</div>
			</div>
			<MeterScaffold label={`Meter scaffold for ${label}`} />
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
					<span className="rounded-sm border border-workbench-border bg-workbench-viewer px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-normal text-muted-foreground">
						Scaffold
					</span>
				</div>
			</div>
			<MeterScaffold label="Meter scaffold for combined preview output" />
		</section>
	);
}

function MeterScaffold({ label }: { label: string }) {
	return (
		<div
			aria-label={label}
			className="grid h-full min-h-28 w-[4.25rem] grid-cols-2 gap-1 overflow-hidden rounded-sm border border-workbench-border bg-workbench-viewer p-1"
		>
			<div className="relative min-h-0 rounded-sm bg-workbench-lane">
				<div className="absolute inset-x-0 bottom-0 h-2/5 rounded-sm bg-workbench-progress/35" />
			</div>
			<div className="relative min-h-0 rounded-sm bg-workbench-lane">
				<div className="absolute inset-x-0 bottom-0 h-1/3 rounded-sm bg-workbench-progress/25" />
			</div>
		</div>
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
