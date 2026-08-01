import {
	type CSSProperties,
	type RefObject,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import { cn } from "@/lib/utils";
import type {
	PreviewLevelMeterChannel,
	PreviewLevelMeterOrientation,
	PreviewLevelMeterState,
	PreviewLevelMeterVisualRange,
	PreviewLevelMeterZone,
} from "../types/preview-level-meter.types";
import { selectPreviewLevelMeterTicksForHeight } from "./preview-level-meter-scale";
import {
	previewPeakMeterVisualRange,
	previewPeakMeterZones,
} from "./preview-level-meter.constants";

export type {
	PreviewLevelMeterChannel,
	PreviewLevelMeterOrientation,
	PreviewLevelMeterState,
	PreviewLevelMeterVisualRange,
	PreviewLevelMeterZone,
} from "../types/preview-level-meter.types";

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

export function PreviewLevelMeter({
	channelWidthRem,
	channels,
	label,
	message,
	orientation = "vertical",
	showChannelLabels = true,
	showTickLabels = true,
	state,
	ticks,
	visualRange = previewPeakMeterVisualRange,
	zones = previewPeakMeterZones,
}: PreviewLevelMeterProps) {
	const range = normalizeVisualRange(visualRange);
	const resolvedTicks = ticks ?? createDefaultPreviewLevelMeterTicks(range);

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
					ticks={resolvedTicks}
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
	const gridRef = useRef<HTMLDivElement>(null);
	const shouldMeasureVerticalTicks =
		showTickLabels && orientation === "vertical";
	const measuredHeightPx = useElementHeightPx(
		gridRef,
		shouldMeasureVerticalTicks,
	);
	const visibleTicks = useMemo(
		() =>
			selectPreviewLevelMeterTicksForHeight({
				heightPx: measuredHeightPx,
				orientation,
				range,
				ticks,
			}),
		[measuredHeightPx, orientation, range, ticks],
	);

	return (
		<div aria-label={`${label} channels`} className="min-w-0 overflow-x-auto">
			<div
				className={cn(
					"relative grid h-full min-h-0 gap-1",
					orientation === "vertical"
						? "grid-flow-col items-stretch"
						: "auto-rows-[1.5rem]",
					showTickLabels && orientation === "vertical" ? "pr-9" : "",
				)}
				style={meterChannelsStyle(
					channels.length,
					orientation,
					channelWidthRem,
				)}
				ref={gridRef}
			>
				<ZoneDescriptions zones={zones} />
				{showTickLabels ? (
					<TickLabels
						orientation={orientation}
						range={range}
						ticks={visibleTicks}
					/>
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

function useElementHeightPx(
	ref: RefObject<HTMLElement | null>,
	enabled: boolean,
): number | null {
	const [heightPx, setHeightPx] = useState<number | null>(null);

	useEffect(() => {
		if (!enabled) {
			return;
		}

		const element = ref.current;

		if (!element) {
			return;
		}

		function commitHeight(nextHeightPx: number) {
			if (!Number.isFinite(nextHeightPx) || nextHeightPx <= 0) {
				return;
			}

			setHeightPx((previousHeightPx) =>
				previousHeightPx !== null &&
				Math.abs(previousHeightPx - nextHeightPx) < 0.5
					? previousHeightPx
					: nextHeightPx,
			);
		}

		commitHeight(element.getBoundingClientRect().height);

		if (typeof ResizeObserver === "undefined") {
			return;
		}

		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			commitHeight(
				entry?.contentRect.height ?? element.getBoundingClientRect().height,
			);
		});

		observer.observe(element);

		return () => {
			observer.disconnect();
		};
	}, [enabled, ref]);

	return heightPx;
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
			className={cn(
				"pointer-events-none absolute z-20",
				orientation === "vertical" ? "bottom-0 right-0 top-0 w-8" : "inset-0",
			)}
		>
			{orientation === "vertical" ? (
				<span className="absolute right-0 top-0 font-mono text-[7px] uppercase leading-3 text-muted-foreground/60">
					dBFS
				</span>
			) : null}
			{ticks.map((tick) => (
				<div
					className={cn(
						"absolute",
						orientation === "vertical"
							? "left-0 right-0"
							: "bottom-0 top-0 border-l",
					)}
					key={tick}
					style={tickStyle(tick, range, orientation)}
				>
					{orientation === "vertical" ? (
						<span className="absolute left-0 top-0 h-px w-1.5 bg-workbench-border-strong/45" />
					) : null}
					<span
						className={cn(
							"absolute font-mono text-[8px] leading-3 text-muted-foreground",
							orientation === "vertical"
								? verticalTickLabelClassName(tick, range)
								: "bottom-0 left-0 -translate-x-1/2 rounded-sm bg-workbench-viewer/85 px-0.5",
						)}
					>
						{orientation === "vertical"
							? formatDb(tick)
							: `${formatDb(tick)} dBFS`}
					</span>
				</div>
			))}
		</div>
	);
}

function verticalTickLabelClassName(
	tick: number,
	{ ceilingDb, floorDb }: PreviewLevelMeterVisualRange,
): string {
	const baseClassName =
		"left-2 text-[9px] tabular-nums text-muted-foreground/75";

	if (tick >= ceilingDb) {
		return `${baseClassName} top-0`;
	}

	if (tick <= floorDb) {
		return `${baseClassName} bottom-0`;
	}

	return `${baseClassName} top-0 -translate-y-1/2`;
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

function createDefaultPreviewLevelMeterTicks({
	ceilingDb,
	floorDb,
}: PreviewLevelMeterVisualRange): number[] {
	const ticks = [ceilingDb];
	const denseScaleFloorDb = Math.max(floorDb, -40);

	for (let tick = ceilingDb - 4; tick >= denseScaleFloorDb; tick -= 4) {
		ticks.push(tick);
	}

	const firstWideTick = Math.floor((denseScaleFloorDb - 10) / 10) * 10;
	for (let tick = firstWideTick; tick >= floorDb; tick -= 10) {
		ticks.push(tick);
	}

	if (!ticks.includes(floorDb)) {
		ticks.push(floorDb);
	}

	return Array.from(
		new Set(
			ticks.filter(
				(tick) => Number.isFinite(tick) && tick <= ceilingDb && tick >= floorDb,
			),
		),
	).sort((left, right) => right - left);
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
