export function normalizePreviewMeterChannelCount(
	channels: number | undefined,
) {
	if (typeof channels !== "number" || !Number.isFinite(channels)) return 2;
	return Math.max(1, Math.min(8, Math.round(channels)));
}

export function formatPreviewMeterChannelLabel(
	channelCount: number,
	channelIndex: number,
) {
	if (channelCount === 1) return "Mono";
	if (channelCount === 2) return channelIndex === 0 ? "Left" : "Right";
	return `Ch ${channelIndex + 1}`;
}

export function createPreviewMeterChannelLabels(channelCount: number) {
	return Array.from({ length: channelCount }, (_, channelIndex) =>
		formatPreviewMeterChannelLabel(channelCount, channelIndex),
	);
}
