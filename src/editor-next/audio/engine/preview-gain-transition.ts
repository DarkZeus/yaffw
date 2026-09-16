export const PREVIEW_GAIN_TRANSITION_SECONDS = 0.008;

export type PreviewGainParam = {
	value: number;
	cancelAndHoldAtTime: (time: number) => unknown;
	cancelScheduledValues: (time: number) => unknown;
	linearRampToValueAtTime: (value: number, time: number) => unknown;
	setValueAtTime: (value: number, time: number) => unknown;
};

/** Exclusive owner of one gain parameter's automation; times use its context clock. */
export function createPreviewGainTransition(
	param: PreviewGainParam,
	initialValue = 1,
) {
	let target = Math.fround(initialValue);
	let from = target;
	let start = 0;
	let end = 0;
	let disposed = false;
	param.value = target;

	function settle(timeSeconds: number) {
		if (disposed) return;
		param.cancelScheduledValues(timeSeconds);
		param.setValueAtTime(target, timeSeconds);
		from = target;
		start = end = timeSeconds;
	}

	return {
		setTarget(value: number, timeSeconds: number, smooth: boolean) {
			if (disposed) return;
			const next = Math.fround(value);
			if (!smooth) {
				target = next;
				settle(timeSeconds);
				return;
			}
			// Reapplying the mix must not extend an in-flight transition.
			if (next === target) return;
			const progress =
				end > start
					? Math.max(0, Math.min(1, (timeSeconds - start) / (end - start)))
					: 1;
			from = Math.fround(from + (target - from) * progress);
			// Preserve the rendered prefix, discard obsolete endpoints, and anchor
			// the new ramp now even when the previous target was reached long ago.
			param.cancelAndHoldAtTime(timeSeconds);
			param.setValueAtTime(from, timeSeconds);
			start = timeSeconds;
			end = start + PREVIEW_GAIN_TRANSITION_SECONDS;
			target = next;
			param.linearRampToValueAtTime(target, end);
		},
		settle,
		dispose(timeSeconds: number) {
			if (disposed) return;
			target = 0;
			settle(timeSeconds);
			disposed = true;
		},
	};
}
