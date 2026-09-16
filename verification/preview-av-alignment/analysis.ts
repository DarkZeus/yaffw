/** Verification-only signal analysis. No production clocks or commands are changed. */
export type Burst = { start: number; end: number };
export type OutputPair = {
	contextTime: number;
	performanceTime: number;
	observedAt: number;
};

export type ScheduledSignal = {
	bursts: Burst[];
	when: number;
	calledAt: number;
	offset: number;
	duration: number;
	rate: number;
	stoppedAt: number | null;
	sampleRate: number;
};

export function scheduledBursts(signal: ScheduledSignal): Burst[] {
	const start = Math.max(signal.when, signal.calledAt);
	return signal.bursts.flatMap((burst) => {
		const from = Math.max(burst.start, signal.offset);
		const to = Math.min(burst.end, signal.offset + signal.duration);
		const contextFrom = start + (from - signal.offset) / signal.rate;
		const contextTo = Math.min(
			start + (to - signal.offset) / signal.rate,
			signal.stoppedAt ?? Number.POSITIVE_INFINITY,
		);
		return to > from && contextTo > contextFrom
			? [{ start: contextFrom, end: contextTo }]
			: [];
	});
}

export function isFirstFlashFrame(
	observedMediaTime: number,
	expectedMediaTime: number,
) {
	return (
		Number.isFinite(observedMediaTime) &&
		Math.abs(observedMediaTime - expectedMediaTime) < 0.001
	);
}

// Group carrier peaks separated by less than 50 ms, preserving the first sample.
export function detectBursts(
	samples: Float32Array,
	sampleRate: number,
	threshold: number,
): Burst[] {
	const bursts: Burst[] = [];
	let last = Number.NEGATIVE_INFINITY;
	for (let i = 0; i < samples.length; i++) {
		if (Math.abs(samples[i]) <= threshold) continue;
		if (i - last > sampleRate * 0.05)
			bursts.push({ start: i / sampleRate, end: (i + 1) / sampleRate });
		else bursts[bursts.length - 1].end = (i + 1) / sampleRate;
		last = i;
	}
	return bursts;
}

export function mergeBursts(bursts: Burst[], gapSeconds: number): Burst[] {
	const merged: Burst[] = [];
	for (const burst of [...bursts].sort((a, b) => a.start - b.start)) {
		const previous = merged.at(-1);
		if (previous && burst.start - previous.end <= gapSeconds)
			previous.end = Math.max(previous.end, burst.end);
		else merged.push({ ...burst });
	}
	return merged;
}

export function summarize(values: number[]) {
	if (values.length === 0 || values.some((value) => !Number.isFinite(value)))
		throw new Error("Expected finite observations");
	const sorted = [...values].sort((a, b) => a - b);
	const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
	return {
		count: values.length,
		mean,
		median:
			(sorted[Math.floor((sorted.length - 1) / 2)] +
				sorted[Math.floor(sorted.length / 2)]) /
			2,
		min: sorted[0],
		max: sorted[sorted.length - 1],
		sampleStandardDeviation:
			values.length > 1
				? Math.sqrt(
						values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
							(values.length - 1),
					)
				: null,
	};
}

export function estimateOutputTime(contextTime: number, pairs: OutputPair[]) {
	// Use nearby output pairs, never currentTime minus contextTime as latency.
	const nearby = pairs.filter(
		(pair) =>
			Number.isFinite(pair.contextTime) &&
			Number.isFinite(pair.performanceTime) &&
			Number.isFinite(pair.observedAt) &&
			pair.contextTime > 0 &&
			pair.performanceTime > 0 &&
			pair.observedAt - pair.performanceTime >= -5 &&
			pair.observedAt - pair.performanceTime <= 250 &&
			Math.abs(pair.contextTime - contextTime) <= 0.1,
	);
	const distinct = nearby.filter(
		(pair, i) =>
			!nearby
				.slice(0, i)
				.some((other) => other.contextTime === pair.contextTime),
	);
	if (distinct.length < 2)
		return {
			kind: "unavailable" as const,
			reason: "missing or stale output timestamps",
		};
	const estimates = distinct.map(
		(pair) => pair.performanceTime + (contextTime - pair.contextTime) * 1000,
	);
	const stats = summarize(estimates);
	if (stats.max - stats.min > 5)
		return {
			kind: "unavailable" as const,
			reason: "discontinuous output timestamp mapping",
		};
	return {
		kind: "estimate" as const,
		performanceTime: stats.median,
		spreadMs: stats.max - stats.min,
		pairs: distinct,
	};
}

export function signedOffset(
	audioPerformanceMs: number,
	visualPerformanceMs: number,
	fixtureOffsetMs: number,
	rate: number,
) {
	if (
		!(rate > 0) ||
		![audioPerformanceMs, visualPerformanceMs, fixtureOffsetMs, rate].every(
			Number.isFinite,
		)
	)
		throw new Error("Invalid event timing");
	return {
		rawOffsetMs: audioPerformanceMs - visualPerformanceMs,
		pathOffsetMs:
			audioPerformanceMs - visualPerformanceMs - fixtureOffsetMs / rate,
	};
}
