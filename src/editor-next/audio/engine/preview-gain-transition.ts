export const PREVIEW_GAIN_TRANSITION_SECONDS = 0.008;

export type PreviewGainChangeMode = "immediate" | "ramp";

export type PreviewGainParam = {
	value: number;
	cancelAndHoldAtTime: (time: number) => unknown;
	cancelScheduledValues: (time: number) => unknown;
	linearRampToValueAtTime: (value: number, time: number) => unknown;
	setValueAtTime: (value: number, time: number) => unknown;
};

type GainTransition =
	| { status: "settled"; target: number }
	| {
			status: "ramping";
			from: number;
			target: number;
			start: number;
			end: number;
	  }
	| { status: "disposed" };

/** Exclusive owner of one gain parameter's automation; times use its context clock. */
export function createPreviewGainTransition(
	param: PreviewGainParam,
	initialValue = 1,
) {
	const initialTarget = Math.fround(initialValue);
	let transition: GainTransition = { status: "settled", target: initialTarget };
	param.value = initialTarget;

	function retireCompletedRamp(timeSeconds: number) {
		if (transition.status === "ramping" && timeSeconds >= transition.end) {
			transition = { status: "settled", target: transition.target };
		}
	}

	function writeImmediateGain(target: number, timeSeconds: number) {
		param.cancelScheduledValues(timeSeconds);
		param.setValueAtTime(target, timeSeconds);
	}

	return {
		setTarget(value: number, timeSeconds: number, mode: PreviewGainChangeMode) {
			retireCompletedRamp(timeSeconds);
			if (transition.status === "disposed") return;
			const target = Math.fround(value);
			if (mode === "immediate") {
				if (transition.status === "settled" && target === transition.target)
					return;
				writeImmediateGain(target, timeSeconds);
				transition = { status: "settled", target };
				return;
			}

			// Reapplying the mix preserves the current endpoint and its timing.
			if (target === transition.target) return;
			const from = gainAtTime(transition, timeSeconds);
			const end = timeSeconds + PREVIEW_GAIN_TRANSITION_SECONDS;
			param.cancelAndHoldAtTime(timeSeconds);
			param.setValueAtTime(from, timeSeconds);
			param.linearRampToValueAtTime(target, end);
			transition = { status: "ramping", from, target, start: timeSeconds, end };
		},
		settle(timeSeconds: number) {
			retireCompletedRamp(timeSeconds);
			if (transition.status !== "ramping") return;
			const { target } = transition;
			writeImmediateGain(target, timeSeconds);
			transition = { status: "settled", target };
		},
		dispose(timeSeconds: number) {
			if (transition.status === "disposed") return;
			transition = { status: "disposed" };
			writeImmediateGain(0, timeSeconds);
		},
	};
}

function gainAtTime(
	transition: Exclude<GainTransition, { status: "disposed" }>,
	timeSeconds: number,
) {
	if (transition.status === "settled") return transition.target;
	const progress = Math.max(
		0,
		(timeSeconds - transition.start) / (transition.end - transition.start),
	);
	return Math.fround(
		transition.from + (transition.target - transition.from) * progress,
	);
}
