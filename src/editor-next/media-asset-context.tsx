import { AudioLines, FileVideo, Film, X } from "lucide-react";
import { type ReactElement, type ReactNode, cloneElement } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ReadyMediaAsset, Selection } from "@/editor-core/model";
import {
	type MediaAssetContextFact,
	createMediaAssetContextViewModel,
} from "./media-asset-context-presenter";
import type { MediaAssetContextPanelProps } from "./media-asset-context.types";
import { formatMediaTime } from "./media-time-presentation";

type PanelIconElement = ReactElement<{
	"aria-hidden"?: boolean;
	className?: string;
}>;

type AnalyticsFactGroup = {
	facts: MediaAssetContextFact[];
	title: string;
};

export function MediaAssetContextPanel({
	asset,
	closeFileDisabled,
	onCloseFileRequested,
	selection,
}: MediaAssetContextPanelProps) {
	const viewModel = createMediaAssetContextViewModel({
		asset,
		closeDisabled: closeFileDisabled,
		selection,
	});
	const sourceAnalyticsFacts = viewModel.provenanceFacts.filter(
		(fact) => fact.label !== "Source file",
	);

	return (
		<section
			aria-label="Media asset context"
			className="flex min-w-0 max-w-full flex-col overflow-hidden overflow-x-hidden rounded-md border border-workbench-border bg-workbench-inspector xl:h-full xl:min-h-0 xl:rounded-none xl:border-0"
		>
			<PanelHeader
				icon={<FileVideo />}
				title="Media asset"
				trailing={
					<Button
						aria-label={viewModel.closeFile.label}
						className="size-7 rounded border-workbench-border bg-workbench-viewer text-muted-foreground hover:bg-workbench-hover hover:text-foreground"
						disabled={viewModel.closeFile.disabled}
						onClick={onCloseFileRequested}
						size="icon"
						title={viewModel.closeFile.label}
						type="button"
						variant="outline"
					>
						<X data-icon="inline-start" />
					</Button>
				}
			/>
			<div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
				<SectionLabel>Source</SectionLabel>
				<div
					aria-label="Loaded media asset"
					className="mb-3 space-y-1 rounded border border-workbench-border bg-workbench-lane p-2"
				>
					<div className="truncate text-sm font-medium text-foreground">
						{viewModel.identity.name}
					</div>
					<div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
						<CompactMetric
							label="Size"
							value={factValue(viewModel.provenanceFacts, "Size")}
						/>
						<CompactMetric
							label="Duration"
							value={formatMediaTime(asset.durationUs)}
						/>
						<CompactMetric
							label="Codec"
							value={formatAssetCodecSummary(asset)}
						/>
						<CompactMetric label="Frames" value={formatFrameTiming(asset)} />
					</div>
				</div>

				<SectionLabel>Tracks</SectionLabel>
				<div className="mb-3 space-y-1.5">
					{asset.tracks.video.map((track, trackIndex) => (
						<CompactTrackRow
							icon={<Film />}
							key={track.id}
							label={track.label ?? `Video ${trackIndex + 1}`}
							meta={formatVideoTrackMeta(track)}
							status="Preview"
						/>
					))}
					{asset.tracks.audio.map((track, trackIndex) => (
						<CompactTrackRow
							icon={<AudioLines />}
							key={track.id}
							label={track.label ?? `Audio ${trackIndex + 1}`}
							meta={formatAudioTrackMeta(track)}
						/>
					))}
					{asset.tracks.audio.length === 0 ? (
						<CompactTrackRow
							icon={<AudioLines />}
							label="Audio"
							meta="No audio tracks"
							status="none"
						/>
					) : null}
				</div>

				<SectionLabel>Selection</SectionLabel>
				<div className="grid grid-cols-2 gap-2 text-[11px]">
					<CompactTimeBox
						label="Start"
						value={formatMediaTime(selection.startUs)}
					/>
					<CompactTimeBox
						label="End"
						value={formatMediaTime(selection.endUs)}
					/>
					<CompactTimeBox
						label="Duration"
						value={formatMediaTime(selection.endUs - selection.startUs)}
					/>
					<CompactTimeBox
						label="Coverage"
						value={formatSelectionCoverage(selection, asset)}
					/>
				</div>

				<MediaAnalyticsSection
					groups={[
						{
							facts: sourceAnalyticsFacts,
							title: "Source context",
						},
						{
							facts: viewModel.videoFacts,
							title: "Video facts",
						},
						{
							facts: viewModel.audioFacts,
							title: "Audio facts",
						},
						{
							facts: viewModel.selectionFacts,
							title: "Selection facts",
						},
					]}
				/>
			</div>
		</section>
	);
}

function PanelHeader({
	icon,
	trailing,
	title,
}: {
	icon: PanelIconElement;
	trailing?: ReactNode;
	title: string;
}) {
	return (
		<div className="flex h-[42px] shrink-0 items-center justify-between border-b border-workbench-border px-3">
			<div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
				{cloneElement(icon, {
					"aria-hidden": true,
					className: "size-4 text-workbench-selected",
				})}
				<span className="truncate">{title}</span>
			</div>
			{trailing ? <div className="shrink-0">{trailing}</div> : null}
		</div>
	);
}

function SectionLabel({ children }: { children: ReactNode }) {
	return (
		<div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
			{children}
		</div>
	);
}

function CompactMetric({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0">
			<div className="truncate leading-tight text-muted-foreground/75">
				{label}
			</div>
			<div className="truncate font-mono leading-tight text-foreground">
				{value}
			</div>
		</div>
	);
}

function CompactTrackRow({
	icon,
	label,
	meta,
	status,
}: {
	icon: PanelIconElement;
	label: string;
	meta: string;
	status?: string;
}) {
	return (
		<div className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 rounded border border-workbench-border bg-workbench-lane px-2 py-1.5">
			<div className="text-muted-foreground">
				{cloneElement(icon, {
					"aria-hidden": true,
					className: "size-4",
				})}
			</div>
			<div className="min-w-0">
				<div className="truncate text-xs font-medium leading-tight text-foreground">
					{label}
				</div>
				<div className="truncate text-[10px] leading-tight text-muted-foreground">
					{meta}
				</div>
			</div>
			{status ? (
				<Badge
					className="border-workbench-border bg-workbench-hover text-[10px] text-workbench-progress"
					variant="outline"
				>
					{status}
				</Badge>
			) : null}
		</div>
	);
}

function CompactTimeBox({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded border border-workbench-border bg-workbench-lane p-1.5">
			<div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
				{label}
			</div>
			<div className="truncate font-mono text-xs text-foreground">{value}</div>
		</div>
	);
}

function MediaAnalyticsSection({ groups }: { groups: AnalyticsFactGroup[] }) {
	return (
		<section aria-label="Media analytics" className="mt-3 space-y-2 pb-1">
			<SectionLabel>Analytics</SectionLabel>
			<div className="space-y-2">
				{groups.map((group) => (
					<section
						aria-label={group.title}
						className="rounded border border-workbench-border bg-workbench-lane/65 p-2"
						key={group.title}
					>
						<h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
							{group.title}
						</h3>
						<dl className="grid gap-1 text-[10px] leading-4">
							{group.facts.map((fact) => (
								<div
									className="grid min-w-0 grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-2"
									key={`${group.title}-${fact.label}`}
								>
									<dt className="min-w-0 truncate text-muted-foreground/80">
										{fact.label}
									</dt>
									<dd
										className="min-w-0 break-words text-right font-mono text-foreground [overflow-wrap:anywhere]"
										title={fact.value}
									>
										{fact.value}
									</dd>
								</div>
							))}
						</dl>
					</section>
				))}
			</div>
		</section>
	);
}

function factValue(facts: MediaAssetContextFact[], label: string): string {
	return facts.find((fact) => fact.label === label)?.value ?? "Unknown";
}

function formatAssetCodecSummary(asset: ReadyMediaAsset): string {
	const videoCodec = asset.tracks.video[0]?.codec?.trim() || "Video";
	const audioCodec = asset.tracks.audio[0]?.codec?.trim() || "Audio";

	return `${videoCodec.toUpperCase()} / ${audioCodec.toUpperCase()}`;
}

function formatVideoTrackMeta(
	track: ReadyMediaAsset["tracks"]["video"][number],
): string {
	if (track.width && track.height) {
		return `${track.width} x ${track.height}`;
	}

	return "Resolution unknown";
}

function formatAudioTrackMeta(
	track: ReadyMediaAsset["tracks"]["audio"][number],
): string {
	const facts = [
		formatAudioChannels(track.channels),
		track.sampleRate ? `${formatNumber(track.sampleRate / 1000)} kHz` : null,
	].filter((fact): fact is string => Boolean(fact));

	return facts.length > 0 ? facts.join(", ") : "Audio track";
}

function formatAudioChannels(channels?: number): string | null {
	if (!channels || channels <= 0) {
		return null;
	}

	if (channels === 1) {
		return "Mono";
	}

	if (channels === 2) {
		return "Stereo";
	}

	return `${channels} channels`;
}

function formatSelectionCoverage(
	selection: Selection,
	asset: ReadyMediaAsset,
): string {
	const durationUs = Math.max(0, selection.endUs - selection.startUs);
	const coveragePercent =
		asset.durationUs > 0 ? (durationUs / asset.durationUs) * 100 : 0;

	return `${formatNumber(coveragePercent)}%`;
}

function formatNumber(value: number): string {
	if (Number.isInteger(value)) {
		return `${value}`;
	}

	return value.toFixed(2).replace(/\.?0+$/, "");
}

function formatFrameTiming(asset: ReadyMediaAsset): string {
	const fps = Number.isInteger(asset.frameTiming.fps)
		? String(asset.frameTiming.fps)
		: asset.frameTiming.fps.toFixed(2);

	return asset.frameTiming.source === "estimated"
		? `${fps} fps estimated`
		: `${fps} fps`;
}
