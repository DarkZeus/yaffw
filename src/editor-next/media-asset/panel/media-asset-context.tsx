import { AudioLines, ChevronRight, Film, X } from "lucide-react";
import { type ReactElement, type ReactNode, cloneElement } from "react";

import { Button } from "@/components/ui/button";
import type {
	AudioMediaTrack,
	ReadyMediaAsset,
	Selection,
	VideoMediaTrack,
} from "@/editor-core/model";
import { formatMediaTime } from "../../media-time/format/media-time-presentation";

type PanelIconElement = ReactElement<{
	"aria-hidden"?: boolean;
	className?: string;
}>;

type MediaAssetContextFact = {
	label: string;
	value: string;
};

type AnalysisFactGroup = {
	facts: MediaAssetContextFact[];
	title: string;
};

export type MediaAssetContextPanelProps = {
	asset: ReadyMediaAsset;
	closeFileDisabled: boolean;
	onCloseFileRequested: () => void;
	selection: Selection;
};

export function MediaAssetContextPanel({
	asset,
	closeFileDisabled,
	onCloseFileRequested,
	selection,
}: MediaAssetContextPanelProps) {
	const primaryVideoTrack = asset.tracks.video[0];
	const primaryAudioTrack = asset.tracks.audio[0];
	const sourceFileSize = formatFileSize(asset.provenance.sizeBytes);
	const frameTiming = formatFrameTiming(asset);
	const selectionDurationUs = Math.max(0, selection.endUs - selection.startUs);
	const selectionCoverage = formatSelectionCoverage(
		selectionDurationUs,
		asset.durationUs,
	);

	return (
		<section
			aria-label="Media asset context"
			className="flex min-w-0 max-w-full flex-col overflow-hidden overflow-x-hidden rounded-md border border-workbench-border bg-workbench-inspector xl:h-full xl:min-h-0 xl:rounded-none xl:border-0"
		>
			<div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
				<SectionLabel>Source</SectionLabel>
				<div
					aria-label="Loaded media asset"
					className="mb-3 space-y-1 rounded border border-workbench-border bg-workbench-lane p-2"
				>
					<div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
						<div className="truncate text-sm font-medium text-foreground">
							{asset.label}
						</div>
						<Button
							aria-label="Close file"
							className="size-7 rounded border-workbench-border bg-workbench-viewer text-muted-foreground hover:bg-workbench-hover hover:text-foreground"
							disabled={closeFileDisabled}
							onClick={onCloseFileRequested}
							size="icon"
							title="Close file"
							type="button"
							variant="outline"
						>
							<X data-icon="inline-start" />
						</Button>
					</div>
					<div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
						<CompactMetric label="Size" value={sourceFileSize} />
						<CompactMetric
							label="Duration"
							value={formatMediaTime(asset.durationUs)}
						/>
						<CompactMetric
							label="Codec"
							value={formatAssetCodecSummary(asset)}
						/>
						<CompactMetric label="Frames" value={frameTiming} />
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
						value={formatMediaTime(selectionDurationUs)}
					/>
					<CompactTimeBox label="Coverage" value={selectionCoverage} />
				</div>

				<MediaAnalysisSection
					groups={[
						{
							facts: sourceAnalysisFactsForAsset(asset, sourceFileSize),
							title: "Source context",
						},
						{
							facts: videoAnalysisFactsForAsset(
								primaryVideoTrack,
								asset,
								frameTiming,
							),
							title: "Video facts",
						},
						{
							facts: audioAnalysisFactsForAsset(primaryAudioTrack, asset),
							title: "Audio facts",
						},
						{
							facts: selectionAnalysisFacts(
								selection,
								selectionDurationUs,
								selectionCoverage,
							),
							title: "Selection facts",
						},
					]}
				/>
			</div>
		</section>
	);
}

function sourceAnalysisFactsForAsset(
	asset: ReadyMediaAsset,
	sourceFileSize: string,
): MediaAssetContextFact[] {
	return [
		{ label: "Asset identity", value: asset.id },
		{ label: "Duration", value: formatMediaTime(asset.durationUs) },
		{ label: "Size", value: sourceFileSize },
		{ label: "Type", value: formatContainerType(asset.provenance) },
	];
}

function videoAnalysisFactsForAsset(
	primaryVideoTrack: VideoMediaTrack | undefined,
	asset: ReadyMediaAsset,
	frameTiming: string,
): MediaAssetContextFact[] {
	return [
		{ label: "Video tracks", value: `${asset.tracks.video.length}` },
		{
			label: "Primary video",
			value: formatTrackLabel(primaryVideoTrack?.label, "Unnamed video track"),
		},
		{
			label: "Resolution",
			value: formatVideoResolution(primaryVideoTrack),
		},
		{
			label: "Aspect",
			value: formatAspectRatio(
				primaryVideoTrack?.width,
				primaryVideoTrack?.height,
			),
		},
		{ label: "Frame timing", value: frameTiming },
		{ label: "Codec", value: formatCodec(primaryVideoTrack?.codec) },
	];
}

function audioAnalysisFactsForAsset(
	primaryAudioTrack: AudioMediaTrack | undefined,
	asset: ReadyMediaAsset,
): MediaAssetContextFact[] {
	if (!primaryAudioTrack) {
		return [
			{ label: "Audio tracks", value: `${asset.tracks.audio.length}` },
			{ label: "Primary audio", value: "None" },
		];
	}

	return [
		{ label: "Audio tracks", value: `${asset.tracks.audio.length}` },
		{
			label: "Primary audio",
			value: formatTrackLabel(primaryAudioTrack.label, "Unnamed audio track"),
		},
		{
			label: "Channels",
			value: formatAudioChannels(primaryAudioTrack.channels),
		},
		{
			label: "Sample rate",
			value: formatSampleRate(primaryAudioTrack.sampleRate),
		},
		{ label: "Codec", value: formatCodec(primaryAudioTrack.codec) },
		{ label: "Language", value: formatLanguage(primaryAudioTrack.language) },
	];
}

function selectionAnalysisFacts(
	selection: Selection,
	durationUs: number,
	coverage: string,
): MediaAssetContextFact[] {
	return [
		{ label: "Selection start", value: formatMediaTime(selection.startUs) },
		{ label: "Selection end", value: formatMediaTime(selection.endUs) },
		{ label: "Selection duration", value: formatMediaTime(durationUs) },
		{ label: "Asset coverage", value: coverage },
	];
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
}: {
	icon: PanelIconElement;
	label: string;
	meta: string;
}) {
	return (
		<div className="grid grid-cols-[28px_minmax(0,1fr)] items-center gap-2 rounded border border-workbench-border bg-workbench-lane px-2 py-1.5">
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

function MediaAnalysisSection({ groups }: { groups: AnalysisFactGroup[] }) {
	const visibleGroups = groups.filter((group) => group.facts.length > 0);

	if (visibleGroups.length === 0) {
		return null;
	}

	return (
		<details
			aria-label="Media analysis"
			className="group mt-3 rounded border border-workbench-border bg-workbench-lane/65 pb-1"
		>
			<summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-2 rounded-t px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:bg-workbench-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-workbench-selected marker:hidden [&::-webkit-details-marker]:hidden">
				<span>Analysis</span>
				<ChevronRight
					aria-hidden="true"
					className="size-3 shrink-0 text-workbench-progress transition-transform group-open:rotate-90"
				/>
			</summary>
			<div className="space-y-2 px-2 pb-2">
				{visibleGroups.map((group) => (
					<section aria-label={group.title} key={group.title}>
						<h3 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
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
		</details>
	);
}

function formatAssetCodecSummary(asset: ReadyMediaAsset): string {
	const videoCodec = formatCodec(asset.tracks.video[0]?.codec);
	const audioCodec = formatCodec(asset.tracks.audio[0]?.codec);

	return `${videoCodec.toUpperCase()} / ${audioCodec.toUpperCase()}`;
}

function formatVideoTrackMeta(
	track: ReadyMediaAsset["tracks"]["video"][number],
): string {
	return formatVideoResolution(track, " x ", "Resolution unknown");
}

function formatAudioTrackMeta(
	track: ReadyMediaAsset["tracks"]["audio"][number],
): string {
	const facts = [
		formatAudioChannels(track.channels),
		formatSampleRate(track.sampleRate),
	].filter((fact) => fact !== "Unknown");

	return facts.length > 0 ? facts.join(", ") : "Audio track";
}

function formatAudioChannels(channels?: number): string {
	if (!channels || channels <= 0) {
		return "Unknown";
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
	selectionDurationUs: number,
	assetDurationUs: number,
): string {
	const coveragePercent =
		assetDurationUs > 0 ? (selectionDurationUs / assetDurationUs) * 100 : 0;

	return `${formatNumber(coveragePercent)}%`;
}

function formatNumber(value: number): string {
	if (Number.isInteger(value)) {
		return `${value}`;
	}

	return value.toFixed(2).replace(/\.?0+$/, "");
}

function formatFrameTiming(asset: ReadyMediaAsset): string {
	const fps = formatNumber(asset.frameTiming.fps);

	return asset.frameTiming.source === "estimated"
		? `${fps} fps estimated`
		: `${fps} fps`;
}

function formatFileSize(bytes: number): string {
	if (bytes <= 0) {
		return "0 B";
	}

	const units = ["B", "KB", "MB", "GB", "TB"];
	const unitIndex = Math.min(
		units.length - 1,
		Math.floor(Math.log(bytes) / Math.log(1024)),
	);
	const value = bytes / 1024 ** unitIndex;

	return `${formatNumber(value)} ${units[unitIndex]}`;
}

function formatContainerType(
	provenance: ReadyMediaAsset["provenance"],
): string {
	const mimeSubtype = provenance.mimeType?.split("/")[1]?.trim();

	if (mimeSubtype) {
		return mimeSubtype.toUpperCase();
	}

	const lastDotIndex = provenance.fileName.lastIndexOf(".");
	const extension =
		lastDotIndex > 0 && lastDotIndex < provenance.fileName.length - 1
			? provenance.fileName.slice(lastDotIndex + 1)
			: undefined;

	return extension ? extension.toUpperCase() : "Unknown";
}

function formatVideoResolution(
	track: VideoMediaTrack | undefined,
	separator = "x",
	fallback = "Unknown",
): string {
	if (!track?.width || !track.height) {
		return fallback;
	}

	return `${track.width}${separator}${track.height}`;
}

function formatAspectRatio(width?: number, height?: number): string {
	if (!width || !height) {
		return "Unknown";
	}

	const divisor = greatestCommonDivisor(width, height);

	return `${width / divisor}:${height / divisor}`;
}

function formatSampleRate(sampleRate?: number): string {
	if (!sampleRate || sampleRate <= 0) {
		return "Unknown";
	}

	return sampleRate >= 1_000
		? `${formatNumber(sampleRate / 1_000)} kHz`
		: `${sampleRate} Hz`;
}

function formatCodec(codec?: string, fallback = "Unknown"): string {
	return codec?.trim() || fallback;
}

function formatLanguage(language?: string): string {
	const normalizedLanguage = language?.trim();

	if (!normalizedLanguage || normalizedLanguage.toLowerCase() === "und") {
		return "Unknown";
	}

	return normalizedLanguage;
}

function formatTrackLabel(label: string | undefined, fallback: string): string {
	return label?.trim() || fallback;
}

function greatestCommonDivisor(first: number, second: number): number {
	let a = Math.abs(first);
	let b = Math.abs(second);

	while (b !== 0) {
		const next = b;
		b = a % b;
		a = next;
	}

	return a || 1;
}
