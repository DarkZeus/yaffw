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
