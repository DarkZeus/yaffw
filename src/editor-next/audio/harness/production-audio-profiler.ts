export type Distribution = {
	count: number;
	maxMs: number;
	medianMs: number;
	p95Ms: number;
	over50Ms: number;
};

export function distribution(values: readonly number[]): Distribution {
	const sorted = [...values].sort((a, b) => a - b);
	return {
		count: sorted.length,
		maxMs: sorted.at(-1) ?? 0,
		medianMs: percentile(sorted, 0.5),
		p95Ms: percentile(sorted, 0.95),
		over50Ms: sorted.filter((value) => value > 50).length,
	};
}

function percentile(sorted: number[], percentile: number) {
	return sorted[Math.max(0, Math.ceil(sorted.length * percentile) - 1)] ?? 0;
}

/** Measures renderer responsiveness independently of the engine's own pump. */
export function createProductionAudioProfiler() {
	const intervals: number[] = [];
	const naturalIntervals: number[] = [];
	const longTasks: number[] = [];
	const stalls: { requestedMs: number; actualMs: number }[] = [];
	let previous = performance.now();
	let intervalContainsStall = false;
	const timer = setInterval(() => {
		const now = performance.now();
		const interval = now - previous;
		intervals.push(interval);
		if (!intervalContainsStall) naturalIntervals.push(interval);
		intervalContainsStall = false;
		previous = now;
	}, 10);
	const longTasksSupported =
		typeof PerformanceObserver !== "undefined" &&
		PerformanceObserver.supportedEntryTypes.includes("longtask");
	const observer = longTasksSupported
		? new PerformanceObserver((list) => {
				longTasks.push(...list.getEntries().map((entry) => entry.duration));
			})
		: null;
	observer?.observe({ type: "longtask" });
	return {
		stall(durationMs: number) {
			intervalContainsStall = true;
			const start = performance.now();
			while (performance.now() - start < durationMs) {
				// Deliberately block the renderer to test the accepted stall budget.
			}
			stalls.push({
				requestedMs: durationMs,
				actualMs: performance.now() - start,
			});
		},
		stop() {
			clearInterval(timer);
			if (observer) {
				longTasks.push(
					...observer.takeRecords().map((entry) => entry.duration),
				);
				observer.disconnect();
			}
			return {
				allTimerIntervals: distribution(intervals),
				naturalTimerIntervals: distribution(naturalIntervals),
				longTasks: longTasksSupported ? distribution(longTasks) : null,
				stalls,
			};
		},
	};
}

export function delay(ms: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function waitUntil(check: () => boolean, timeoutMs = 5_000) {
	const start = performance.now();
	while (!check()) {
		if (performance.now() - start >= timeoutMs) {
			throw new Error(`Condition did not become true within ${timeoutMs} ms.`);
		}
		await delay(10);
	}
}
