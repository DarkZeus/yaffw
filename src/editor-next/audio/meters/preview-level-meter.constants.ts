import type {
	PreviewLevelMeterVisualRange,
	PreviewLevelMeterZone,
} from "../types/preview-level-meter.types";

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
