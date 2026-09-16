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
