import {
	estimateOutputTime,
	isFirstFlashFrame,
	mergeBursts,
	scheduledBursts,
	signedOffset,
	summarize,
} from "./analysis";
import type { Capture } from "./collector";
import fixture from "./fixture-manifest.json";

export function reportTrial(capture: Capture, rate: number) {
	if (
		capture.frames.some(
			(frame, index) =>
				!Number.isFinite(frame.mediaTime) ||
				!Number.isFinite(frame.expectedDisplayTime) ||
				(index > 0 &&
					(frame.mediaTime < capture.frames[index - 1].mediaTime ||
						frame.expectedDisplayTime <
							capture.frames[index - 1].expectedDisplayTime)),
		)
	)
		throw new Error("Nonfinite or nonmonotonic visual timestamps");
	const contexts = capture.contexts.filter(
		(context) => context.sources.length > 0,
	);
	if (
		contexts.length !== 1 ||
		!capture.video.muted ||
		capture.video.playbackRate !== rate
	)
		throw new Error(
			"Expected one active audio engine and muted native video at the selected rate",
		);
	const context = contexts[0];
	if (context.sources.some((source) => source.rate !== rate))
		throw new Error("Scheduled source rate differs from selected rate");
	if (context.states.some(({ state }) => state !== "running"))
		throw new Error("Context interrupted during baseline trial");
	const lateSources = context.sources.filter(
		(source) =>
			source.bursts.length > 0 &&
			source.calledAt - source.when > 128 / source.sampleRate,
	);
	if (lateSources.length > 0)
		throw new Error(
			"Late audio scheduling exceeds one render quantum; baseline trial unusable",
		);
	const clicks = mergeBursts(
		context.sources.flatMap(scheduledBursts),
		0.05 / rate,
	);
	if (clicks.length !== fixture.events.length)
		throw new Error(`Expected nine scheduled clicks, found ${clicks.length}`);
	const flashes = capture.frames.filter(
		(frame, i) => frame.bright && (i === 0 || !capture.frames[i - 1].bright),
	);
	const events = fixture.events.map((event, i) => {
		const flash = flashes.find(
			(frame) =>
				frame.mediaTime >= event.videoTimeSeconds - 0.001 &&
				frame.mediaTime < event.videoTimeSeconds + 0.1,
		);
		const output = estimateOutputTime(clicks[i].start, context.pairs);
		const exact =
			flash && isFirstFlashFrame(flash.mediaTime, event.videoTimeSeconds);
		const before = flash
			? capture.frames[capture.frames.indexOf(flash) - 1]
			: undefined;
		const visualInterval =
			flash &&
			(exact ||
				(before && !before.bright && before.mediaTime < event.videoTimeSeconds))
				? {
						lowerMs: exact
							? flash.expectedDisplayTime
							: (before?.expectedDisplayTime ?? flash.expectedDisplayTime),
						upperMs: flash.expectedDisplayTime,
						kind: exact
							? "onset frame observed"
							: "onset bounded by last dark and first bright frames",
					}
				: null;
		const rejected = !flash
			? "flash not observed"
			: !visualInterval || visualInterval.upperMs - visualInterval.lowerMs > 100
				? "flash onset cannot be bounded within 100 ms"
				: output.kind === "unavailable"
					? output.reason
					: null;
		if (rejected || !flash || !visualInterval || output.kind !== "estimate")
			return { id: event.id, rejected, flash: flash ?? null, click: clicks[i] };
		return {
			id: event.id,
			rejected: null,
			flash,
			click: clicks[i],
			output,
			visualInterval,
			visualBracketHalfWidthMs:
				(visualInterval.upperMs - visualInterval.lowerMs) / 2,
			...signedOffset(
				output.performanceTime,
				(visualInterval.lowerMs + visualInterval.upperMs) / 2,
				event.fixtureOffsetMs,
				rate,
			),
		};
	});
	const offsets = events.flatMap((event) =>
		"pathOffsetMs" in event ? [event.pathOffsetMs] : [],
	);
	// A conservative browser-observation screening budget, NOT physical calibration.
	const observationBudgetMs =
		1000 / fixture.frameRate / rate +
		128000 / context.sampleRate +
		5 +
		1 / rate +
		Math.max(
			0,
			...events.flatMap((event) =>
				"visualBracketHalfWidthMs" in event
					? [event.visualBracketHalfWidthMs]
					: [],
			),
		);
	return {
		rate,
		acceptedEvents: offsets.length,
		exactOnsetEvents: events.filter(
			(event) =>
				"visualBracketHalfWidthMs" in event &&
				event.visualBracketHalfWidthMs === 0,
		).length,
		rejectedEvents: events.length - offsets.length,
		coverageGatePassed: offsets.length >= 7,
		pathOffsetMs: offsets.length ? summarize(offsets) : null,
		observationBudgetMs,
		physicalAlignment: "unmeasured" as const,
		events,
		diagnostics: {
			sourceCount: context.sources.length,
			maxPcmScanMs: context.maxScanMs,
			sampleRate: context.sampleRate,
			baseLatency: context.baseLatency,
			outputLatency: context.outputLatency,
			outputPairCount: context.pairs.length,
			frameCallbacks: capture.frames.length,
			states: context.states,
			maxCallbackLatenessMs: Math.max(
				0,
				...capture.frames.map(
					(frame) => frame.callbackTime - frame.expectedDisplayTime,
				),
			),
		},
	};
}

export function summarizeBaseline(trials: ReturnType<typeof reportTrial>[]) {
	return [0.5, 1, 2].map((rate) => {
		const matching = trials.filter((trial) => trial.rate === rate);
		const qualified = matching.filter((trial) => trial.coverageGatePassed);
		const medianStats = qualified.length
			? summarize(
					qualified.map((trial) => {
						if (!trial.pathOffsetMs)
							throw new Error("Qualified trial lacks observations");
						return trial.pathOffsetMs.median;
					}),
				)
			: null;
		const budget = matching.length
			? Math.max(...matching.map((trial) => trial.observationBudgetMs))
			: null;
		return {
			rate,
			totalTrials: matching.length,
			qualifiedTrials: qualified.length,
			coverageGatePassed: qualified.length >= 5,
			trialMedianOffsetMs: medianStats,
			observationBudgetMs: budget,
			physicalMeaningfulOffset: "unknown",
			outsideBrowserObservationBudget:
				medianStats && budget !== null
					? Math.abs(medianStats.median) > budget
					: null,
		};
	});
}
