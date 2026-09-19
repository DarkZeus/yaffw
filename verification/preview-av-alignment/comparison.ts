import { summarize } from "./analysis";
import type { reportTrial } from "./report";

export type ComparisonTrial = {
	repetition: number;
	variant: "baseline" | "candidate";
	rate: number;
	failure?: string;
} & Partial<ReturnType<typeof reportTrial>>;

/** Browser diagnostics never satisfy the calibrated physical enablement gate. */
export function summarizeComparison(trials: ComparisonTrial[]) {
	return [0.5, 1, 2].map((rate) => {
		const matching = trials.filter((trial) => trial.rate === rate);
		const repetitions = [...new Set(matching.map((trial) => trial.repetition))];
		const pairs = repetitions.map((repetition) => {
			const members = matching.filter(
				(trial) => trial.repetition === repetition,
			);
			const baselines = members.filter((trial) => trial.variant === "baseline");
			const candidates = members.filter(
				(trial) => trial.variant === "candidate",
			);
			const baseline = baselines[0];
			const candidate = candidates[0];
			const qualified =
				baselines.length === 1 &&
				candidates.length === 1 &&
				[baseline, candidate].every(
					(trial) =>
						!trial.failure &&
						trial.coverageGatePassed &&
						(trial.acceptedEvents ?? 0) >= 7 &&
						Number.isFinite(trial.pathOffsetMs?.median) &&
						Number.isFinite(trial.observationBudgetMs),
				);
			const baselineMs = qualified ? baseline.pathOffsetMs?.median : undefined;
			const candidateMs = qualified
				? candidate.pathOffsetMs?.median
				: undefined;
			return {
				repetition,
				qualified,
				baselineSignedMs: baselineMs ?? null,
				candidateSignedMs: candidateMs ?? null,
				baselineAbsoluteMs:
					baselineMs === undefined ? null : Math.abs(baselineMs),
				candidateAbsoluteMs:
					candidateMs === undefined ? null : Math.abs(candidateMs),
				absoluteImprovementMs:
					baselineMs === undefined || candidateMs === undefined
						? null
						: Math.abs(baselineMs) - Math.abs(candidateMs),
				combinedBrowserBudgetMs: qualified
					? (baseline.observationBudgetMs ?? 0) +
						(candidate.observationBudgetMs ?? 0)
					: null,
			};
		});
		const stats = (values: (number | null)[]) => {
			const known = values.filter((value): value is number => value !== null);
			return known.length ? summarize(known) : null;
		};
		return {
			rate,
			totalPairs: pairs.length,
			qualifiedPairs: pairs.filter((pair) => pair.qualified).length,
			coverageGatePassed: pairs.filter((pair) => pair.qualified).length >= 5,
			baselineSignedMs: stats(pairs.map((pair) => pair.baselineSignedMs)),
			candidateSignedMs: stats(pairs.map((pair) => pair.candidateSignedMs)),
			baselineAbsoluteMs: stats(pairs.map((pair) => pair.baselineAbsoluteMs)),
			candidateAbsoluteMs: stats(pairs.map((pair) => pair.candidateAbsoluteMs)),
			pairedAbsoluteImprovementMs: stats(
				pairs.map((pair) => pair.absoluteImprovementMs),
			),
			pairs,
			physicalUncertaintyMs: null,
			physicalGate:
				"inconclusive: calibrated physical paired measurements unavailable" as const,
			candidateEnablement: false as const,
		};
	});
}
