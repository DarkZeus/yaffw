import type {
	PreviewLevelMeterOrientation,
	PreviewLevelMeterVisualRange,
} from "../types/preview-level-meter.types";

export function selectPreviewLevelMeterTicksForHeight({
	heightPx,
	orientation,
	range,
	ticks,
}: {
	heightPx: number | null;
	orientation: PreviewLevelMeterOrientation;
	range: PreviewLevelMeterVisualRange;
	ticks: number[];
}): number[] {
	if (orientation !== "vertical" || heightPx === null || heightPx <= 0) {
		return ticks;
	}

	const sortedTicks = normalizeTickList(ticks, range);

	if (sortedTicks.length <= 2) {
		return sortedTicks;
	}

	const minimumSpacingPx = minimumVerticalTickSpacingPx(heightPx);
	const selectedTicks: number[] = [];
	let lastSelectedOffsetPx = Number.NEGATIVE_INFINITY;

	for (const tick of sortedTicks) {
		const offsetPx = verticalTickOffsetPx(tick, range, heightPx);

		if (
			selectedTicks.length === 0 ||
			offsetPx - lastSelectedOffsetPx >= minimumSpacingPx
		) {
			selectedTicks.push(tick);
			lastSelectedOffsetPx = offsetPx;
		}
	}

	const floorTick = sortedTicks.at(-1);

	if (typeof floorTick === "number" && !selectedTicks.includes(floorTick)) {
		const floorOffsetPx = verticalTickOffsetPx(floorTick, range, heightPx);
		const lastSelectedTick = selectedTicks.at(-1);
		const lastSelectedTickOffsetPx =
			typeof lastSelectedTick === "number"
				? verticalTickOffsetPx(lastSelectedTick, range, heightPx)
				: Number.NEGATIVE_INFINITY;

		if (
			selectedTicks.length > 1 &&
			floorOffsetPx - lastSelectedTickOffsetPx < minimumSpacingPx
		) {
			selectedTicks.pop();
		}

		selectedTicks.push(floorTick);
	}

	return selectedTicks;
}

function normalizeTickList(
	ticks: number[],
	{ ceilingDb, floorDb }: PreviewLevelMeterVisualRange,
): number[] {
	return Array.from(
		new Set(
			ticks.filter(
				(tick) => Number.isFinite(tick) && tick <= ceilingDb && tick >= floorDb,
			),
		),
	).sort((left, right) => right - left);
}

function minimumVerticalTickSpacingPx(heightPx: number): number {
	if (heightPx < 240) {
		return 44;
	}

	if (heightPx < 380) {
		return 34;
	}

	if (heightPx < 520) {
		return 28;
	}

	return 18;
}

function verticalTickOffsetPx(
	tick: number,
	{ ceilingDb, floorDb }: PreviewLevelMeterVisualRange,
	heightPx: number,
): number {
	return ((ceilingDb - tick) / (ceilingDb - floorDb)) * heightPx;
}
