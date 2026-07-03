import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

export type PreviewLevelMeterState = "preparing" | "ready" | "unavailable";

export type PreviewLevelMeterOrientation = "vertical" | "horizontal";

export type PreviewLevelMeterChannel = {
	clipHeld: boolean;
	label?: string;
	peakDb: number;
};

export type PreviewLevelMeterVisualRange = {
	ceilingDb: number;
	floorDb: number;
};

export type PreviewLevelMeterZone = {
	className: string;
	fromDb: number;
	id: string;
	label: string;
	toDb: number;
};

export type PreviewLevelMeterProps = {
	channelWidthRem?: number;
	channels: PreviewLevelMeterChannel[];
	label: string;
	message?: string;
	orientation?: PreviewLevelMeterOrientation;
	showChannelLabels?: boolean;
	showTickLabels?: boolean;
	state: PreviewLevelMeterState;
	ticks?: number[];
	visualRange?: PreviewLevelMeterVisualRange;
	zones?: PreviewLevelMeterZone[];
};

export const previewPeakMeterVisualRange = {
	ceilingDb: 0,
	floorDb: -72,
} satisfies PreviewLevelMeterVisualRange;

export const previewPeakMeterClipDb = 0;

export const previewPeakMeterZones = [
	{
		className: "bg-emerald-500/80",
		fromDb: -72,
		id: "green",
		label: "Green",
		toDb: -20,
	},
	{
		className: "bg-yellow-400/85",
		fromDb: -20,
		id: "yellow",
		label: "Yellow",
		toDb: -9,
	},
	{
		className: "bg-red-500/85",
		fromDb: -9,
		id: "red",
		label: "Red",
		toDb: 0,
	},
] satisfies PreviewLevelMeterZone[];

const defaultPreviewLevelMeterTicks = [0, -9, -20, -40, -72];

export function PreviewLevelMeter({
	channelWidthRem,
	channels,
	label,
	message,
	orientation = "vertical",
	showChannelLabels = true,
	showTickLabels = true,
	state,
	ticks = defaultPreviewLevelMeterTicks,
	visualRange = previewPeakMeterVisualRange,
	zones = previewPeakMeterZones,
}: PreviewLevelMeterProps) {
	const range = normalizeVisualRange(visualRange);

	return (
		<section
			aria-label={label}
			className={cn(
				"grid min-w-0 rounded-sm border border-workbench-border bg-workbench-viewer p-1",
				orientation === "vertical"
					? "h-full min-h-28 w-full"
					: "min-h-16 w-full",
			)}
			data-orientation={orientation}
			data-state={state}
		>
			{state === "ready" ? (
				<ReadyPreviewLevelMeter
					channels={channels}
					channelWidthRem={channelWidthRem}
					label={label}
					orientation={orientation}
					range={range}
					showChannelLabels={showChannelLabels}
					showTickLabels={showTickLabels}
					ticks={ticks}
					zones={zones}
				/>
			) : (
				<NonReadyPreviewLevelMeter message={message} state={state} />
			)}
		</section>
	);
}

function ReadyPreviewLevelMeter({
	channels,
	channelWidthRem,
	label,
	orientation,
	range,
	showChannelLabels,
	showTickLabels,
	ticks,
	zones,
}: {
	channels: PreviewLevelMeterChannel[];
	channelWidthRem?: number;
	label: string;
	orientation: PreviewLevelMeterOrientation;
	range: PreviewLevelMeterVisualRange;
	showChannelLabels: boolean;
	showTickLabels: boolean;
	ticks: number[];
	zones: PreviewLevelMeterZone[];
}) {
	return (
		<div aria-label={`${label} channels`} className="min-w-0 overflow-x-auto">
			<div
				className={cn(
					"relative grid h-full min-h-0 gap-1",
					orientation === "vertical"
						? "grid-flow-col items-stretch"
						: "auto-rows-[1.5rem]",
				)}
				style={meterChannelsStyle(
					channels.length,
					orientation,
					channelWidthRem,
				)}
			>
				<ZoneDescriptions zones={zones} />
				{showTickLabels ? (
					<TickLabels orientation={orientation} range={range} ticks={ticks} />
				) : null}
				{channels.map((channel, channelIndex) => (
					<PreviewLevelMeterChannelBar
						channel={channel}
						channelIndex={channelIndex}
						key={`${channel.label ?? "channel"}-${channelIndex}`}
						orientation={orientation}
						range={range}
						showChannelLabel={showChannelLabels}
						zones={zones}
					/>
				))}
			</div>
		</div>
	);
}

function PreviewLevelMeterChannelBar({
	channel,
	channelIndex,
	orientation,
	range,
	showChannelLabel,
	zones,
}: {
	channel: PreviewLevelMeterChannel;
	channelIndex: number;
	orientation: PreviewLevelMeterOrientation;
	range: PreviewLevelMeterVisualRange;
	showChannelLabel: boolean;
	zones: PreviewLevelMeterZone[];
}) {
	const channelLabel = channel.label ?? `Channel ${channelIndex + 1}`;
	const peakDb = clampDb(channel.peakDb, range);
	const peakText = `${formatDb(peakDb)} dBFS`;

	return (
		<div
			className={cn(
				"relative z-10 grid min-w-0 gap-1",
				orientation === "vertical"
					? showChannelLabel
						? "grid-rows-[minmax(0,1fr)_auto]"
						: "grid-rows-[minmax(0,1fr)]"
					: showChannelLabel
						? "grid-cols-[3rem_minmax(0,1fr)] items-center"
						: "items-center",
			)}
		>
			{orientation === "horizontal" && showChannelLabel ? (
				<div className="truncate text-[10px] leading-none text-muted-foreground">
					{channelLabel}
				</div>
			) : null}
			<div
				aria-label={`${channelLabel} level`}
				aria-valuemax={range.ceilingDb}
				aria-valuemin={range.floorDb}
				aria-valuenow={peakDb}
				aria-valuetext={`${peakText}${channel.clipHeld ? ", clip held" : ""}`}
				className={cn(
					"relative min-h-0 overflow-hidden rounded-sm border border-workbench-border/80 bg-workbench-lane",
					orientation === "vertical" ? "min-h-20" : "h-4",
				)}
				role="meter"
			>
				{zones.map((zone) => (
					<div
						aria-hidden="true"
						className={cn("absolute opacity-25", zone.className)}
						data-zone={zone.id}
						key={`background-${zone.id}`}
						style={zoneStyle(zone, range, orientation)}
					/>
				))}
				{zones.map((zone) => {
					const style = filledZoneStyle(zone, peakDb, range, orientation);

					return style ? (
						<div
							aria-hidden="true"
							className={cn("absolute", zone.className)}
							data-filled-zone={zone.id}
							key={`filled-${zone.id}`}
							style={style}
						/>
					) : null;
				})}
				{channel.clipHeld ? (
					<span
						aria-label={`${channelLabel} clip held`}
						className="absolute right-0.5 top-0.5 rounded-sm bg-red-500 px-0.5 font-mono text-[8px] font-bold leading-3 text-white"
					>
						CLIP
					</span>
				) : null}
			</div>
			{orientation === "vertical" && showChannelLabel ? (
				<div className="truncate text-center text-[10px] leading-none text-muted-foreground">
					{channelLabel}
				</div>
			) : null}
		</div>
	);
}

function NonReadyPreviewLevelMeter({
	message,
	state,
}: {
	message?: string;
	state: Exclude<PreviewLevelMeterState, "ready">;
}) {
	const fallbackMessage =
		state === "preparing" ? "Preparing meter" : "Meter unavailable";

	return (
		<div className="grid min-h-24 place-items-center rounded-sm border border-workbench-border border-dashed bg-workbench-lane/60 p-2 text-center text-[10px] leading-4 text-muted-foreground">
			{message ?? fallbackMessage}
		</div>
	);
}

function TickLabels({
	orientation,
	range,
	ticks,
}: {
	orientation: PreviewLevelMeterOrientation;
	range: PreviewLevelMeterVisualRange;
	ticks: number[];
}) {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute inset-0 z-20"
		>
			{ticks.map((tick) => (
				<div
					className={cn(
						"absolute border-workbench-border-strong/50",
						orientation === "vertical"
							? "left-0 right-0 border-t"
							: "bottom-0 top-0 border-l",
					)}
					key={tick}
					style={tickStyle(tick, range, orientation)}
				>
					<span
						className={cn(
							"absolute rounded-sm bg-workbench-viewer/80 px-0.5 font-mono text-[8px] leading-3 text-muted-foreground",
							orientation === "vertical"
								? "right-0 top-0 -translate-y-1/2"
								: "bottom-0 left-0 -translate-x-1/2",
						)}
					>
						{formatDb(tick)} dBFS
					</span>
				</div>
			))}
		</div>
	);
}

function ZoneDescriptions({ zones }: { zones: PreviewLevelMeterZone[] }) {
	return (
		<div className="sr-only">
			{zones.map((zone) => (
				<div key={zone.id}>
					{zone.label} zone {formatDb(zone.fromDb)} to {formatDb(zone.toDb)}{" "}
					dBFS
				</div>
			))}
		</div>
	);
}

function meterChannelsStyle(
	channelCount: number,
	orientation: PreviewLevelMeterOrientation,
	channelWidthRem?: number,
): CSSProperties {
	if (orientation === "vertical" && Number.isFinite(channelWidthRem)) {
		const fixedChannelWidthRem = Math.max(channelWidthRem ?? 0, 0.375);

		return {
			gridTemplateColumns: `repeat(${Math.max(channelCount, 1)}, ${fixedChannelWidthRem}rem)`,
		};
	}

	const minimumChannelWidthRem = orientation === "vertical" ? 1.375 : 0;
	const minimumWidthRem =
		orientation === "vertical" && channelCount > 2
			? channelCount * minimumChannelWidthRem
			: undefined;

	return {
		gridTemplateColumns:
			orientation === "vertical"
				? `repeat(${Math.max(channelCount, 1)}, minmax(1.375rem, 1fr))`
				: undefined,
		minWidth: minimumWidthRem ? `${minimumWidthRem}rem` : undefined,
	};
}

function zoneStyle(
	zone: PreviewLevelMeterZone,
	range: PreviewLevelMeterVisualRange,
	orientation: PreviewLevelMeterOrientation,
): CSSProperties {
	const startPercent = percentForDb(zone.fromDb, range);
	const endPercent = percentForDb(zone.toDb, range);
	const sizePercent = Math.max(0, endPercent - startPercent);

	return orientation === "vertical"
		? {
				bottom: `${startPercent}%`,
				height: `${sizePercent}%`,
				left: 0,
				right: 0,
			}
		: {
				bottom: 0,
				left: `${startPercent}%`,
				top: 0,
				width: `${sizePercent}%`,
			};
}

function filledZoneStyle(
	zone: PreviewLevelMeterZone,
	peakDb: number,
	range: PreviewLevelMeterVisualRange,
	orientation: PreviewLevelMeterOrientation,
): CSSProperties | null {
	const filledToDb = Math.min(peakDb, zone.toDb, range.ceilingDb);
	const filledFromDb = Math.max(zone.fromDb, range.floorDb);

	if (filledToDb <= filledFromDb) {
		return null;
	}

	const startPercent = percentForDb(filledFromDb, range);
	const endPercent = percentForDb(filledToDb, range);
	const sizePercent = Math.max(0, endPercent - startPercent);

	return orientation === "vertical"
		? {
				bottom: `${startPercent}%`,
				height: `${sizePercent}%`,
				left: 0,
				right: 0,
			}
		: {
				bottom: 0,
				left: `${startPercent}%`,
				top: 0,
				width: `${sizePercent}%`,
			};
}

function tickStyle(
	tick: number,
	range: PreviewLevelMeterVisualRange,
	orientation: PreviewLevelMeterOrientation,
): CSSProperties {
	const percent = percentForDb(tick, range);

	return orientation === "vertical"
		? { bottom: `${percent}%` }
		: { left: `${percent}%` };
}

function percentForDb(
	db: number,
	{ ceilingDb, floorDb }: PreviewLevelMeterVisualRange,
): number {
	const clamped = Math.min(Math.max(db, floorDb), ceilingDb);

	return ((clamped - floorDb) / (ceilingDb - floorDb)) * 100;
}

function clampDb(
	db: number,
	{ ceilingDb, floorDb }: PreviewLevelMeterVisualRange,
): number {
	if (!Number.isFinite(db)) {
		return floorDb;
	}

	return Math.min(Math.max(db, floorDb), ceilingDb);
}

function normalizeVisualRange({
	ceilingDb,
	floorDb,
}: PreviewLevelMeterVisualRange): PreviewLevelMeterVisualRange {
	if (
		Number.isFinite(floorDb) &&
		Number.isFinite(ceilingDb) &&
		floorDb < ceilingDb
	) {
		return { ceilingDb, floorDb };
	}

	return previewPeakMeterVisualRange;
}

function formatDb(db: number): string {
	const rounded = Number.isInteger(db) ? db : Number(db.toFixed(1));

	return Object.is(rounded, -0) ? "0" : `${rounded}`;
}
