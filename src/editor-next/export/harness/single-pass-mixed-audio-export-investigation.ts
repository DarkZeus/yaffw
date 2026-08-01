import {
	ALL_FORMATS,
	type AudioCodec,
	AudioSampleSink,
	BlobSource,
	CanvasSink,
	Input,
	type VideoCodec,
} from "mediabunny";

import {
	audioMixPlanHasIncludedTracks,
	createAudioMixPlan,
} from "@/editor-core/audio-mix-plan";
import type { AudioMix } from "@/editor-core/model";
import {
	resolveOutputPlan,
	resolveOutputQuality,
	resolveOutputResolution,
} from "@/editor-core/output-settings";
import { renderBrowserAudioMix } from "../../audio/engine/browser-audio-mix";
import {
	toMediabunnyAudioQuality,
	toMediabunnyQuality,
} from "../adapters/mediabunny-output-quality";
import { MEDIABUNNY_OUTPUT_SUPPORT } from "../adapters/mediabunny-output-support";
import { browserDefaultExportRunner } from "../runners/default-export-runner";
import type {
	DefaultExportRunner,
	DefaultExportRunnerRequest,
} from "../types/default-export-runner.types";
import {
	type ExportArtifactHarnessResult,
	runFullAssetExportArtifactHarness,
} from "./export-artifact-harness";
import type { ExportCorrectnessFixture } from "./export-correctness-fixtures";
import { runSinglePassMixedAudioExportPrototype } from "./single-pass-mixed-audio-export-prototype";

const SELECTION_DURATION_US = 6_000_000;
const TIMELINE_TOLERANCE_US = 50_000;
const SYNC_EVENT_SAMPLE_TIMES_US = [
	1_050_000, 2_050_000, 3_050_000, 4_050_000, 5_050_000,
];

export const SINGLE_PASS_MIXED_AUDIO_FIXTURE = {
	container: "mp4",
	expected: {
		audioTrackCount: 2,
		durationUs: 10_000_000,
		mimeTypePrefix: "video/mp4",
		videoTrackCount: 1,
	},
	fileName: "sync-flash-click-two-audio.mp4",
	id: "mp4-sync-flash-click-two-audio",
	label: "Sync flash/click MP4 with two AAC tracks",
	publicPath: "/export-correctness-fixtures/sync-flash-click-two-audio.mp4",
	selections: {
		full: { endUs: 10_000_000, startUs: 0 },
		selectedRange: { endUs: 8_000_000, startUs: 2_000_000 },
	},
} satisfies ExportCorrectnessFixture;

export const singlePassMixedAudioPrototypeRunner: DefaultExportRunner = {
	cancelSupported: true,
	run: runSinglePassMixedAudioPrototypeExport,
};

export type SinglePassMixedAudioExportInvestigationReport = {
	checks: {
		allPassed: boolean;
		avContentEventsPresent: boolean;
		avEndAlignment: boolean;
		avStartAlignment: boolean;
		candidateHasOneGeneratedAudioMix: boolean;
		containerCodecsAndDimensionsMatch: boolean;
		deliveryRemainsExplicit: boolean;
		selectionDurationMatches: boolean;
		sourceHasTwoAudioTracks: boolean;
	};
	comparison: {
		candidate: ExportMeasurement;
		current: ExportMeasurement;
		memory: {
			peakBytes: null;
			reason: string;
			status: "unavailable";
		};
	};
	fixture: {
		fileName: string;
		selectionDurationUs: number;
		sourceAudioTrackCount: number;
		sourceBytes: number;
	};
};

type ExportMeasurement = {
	artifact: ExportArtifactHarnessResult["report"]["inspection"];
	avTimeline: GeneratedMediaAvTimeline;
	cost: {
		finalBytes: number;
		intermediateBytes: number;
		outputCount: number;
		videoPipelinePasses: number;
		wallClockMs: number;
	};
	delivery: ExportArtifactHarnessResult["report"]["delivery"];
	syncEvents: GeneratedMediaSyncEvent[];
};

type GeneratedMediaAvTimeline = {
	audio: TrackTimeline | null;
	endDifferenceUs: number | null;
	startDifferenceUs: number | null;
	video: TrackTimeline | null;
};

type TrackTimeline = {
	durationUs: number;
	endUs: number;
	startUs: number;
};

type GeneratedMediaSyncEvent = {
	audioPeak: number;
	timestampUs: number;
	videoMeanLuma: number;
};

export async function runSinglePassMixedAudioExportInvestigation(): Promise<SinglePassMixedAudioExportInvestigationReport> {
	const currentTimer = createMeasuredRunner(browserDefaultExportRunner);
	const candidateTimer = createMeasuredRunner(
		singlePassMixedAudioPrototypeRunner,
	);
	const intermediateTimer = createMeasuredRunner(
		videoOnlyIntermediateProbeRunner,
	);
	const commonOptions = {
		fixture: SINGLE_PASS_MIXED_AUDIO_FIXTURE,
		selection: SINGLE_PASS_MIXED_AUDIO_FIXTURE.selections.selectedRange,
		selectionLabel: "selected range",
	};
	await runFullAssetExportArtifactHarness({
		...commonOptions,
		runner: singlePassMixedAudioPrototypeRunner,
		runnerLabel: "singlePassMixedAudioPrototypeWarmup",
	});
	await runFullAssetExportArtifactHarness({
		...commonOptions,
		runner: browserDefaultExportRunner,
		runnerLabel: "browserDefaultExportRunnerWarmup",
	});
	await runFullAssetExportArtifactHarness({
		...commonOptions,
		runner: currentTimer.runner,
		runnerLabel: "browserDefaultExportRunner",
	});
	await runFullAssetExportArtifactHarness({
		...commonOptions,
		runner: candidateTimer.runner,
		runnerLabel: "singlePassMixedAudioPrototypeRunner",
	});
	const candidateSecondTrial = await runFullAssetExportArtifactHarness({
		...commonOptions,
		runner: candidateTimer.runner,
		runnerLabel: "singlePassMixedAudioPrototypeRunner",
	});
	const currentSecondTrial = await runFullAssetExportArtifactHarness({
		...commonOptions,
		runner: currentTimer.runner,
		runnerLabel: "browserDefaultExportRunner",
	});
	const intermediate = await runFullAssetExportArtifactHarness({
		...commonOptions,
		runner: intermediateTimer.runner,
		runnerLabel: "currentVideoOnlyIntermediateProbe",
	});
	const [
		currentTimeline,
		candidateTimeline,
		currentSyncEvents,
		candidateSyncEvents,
	] = await Promise.all([
		inspectGeneratedMediaAvTimeline(currentSecondTrial.artifact.blob),
		inspectGeneratedMediaAvTimeline(candidateSecondTrial.artifact.blob),
		inspectGeneratedMediaSyncEvents(currentSecondTrial.artifact.blob),
		inspectGeneratedMediaSyncEvents(candidateSecondTrial.artifact.blob),
	]);
	const sourceAudioTrackCount =
		currentSecondTrial.report.source.asset.tracks.audio.length;
	const checks = {
		avContentEventsPresent:
			syncEventsPresent(currentSyncEvents) &&
			syncEventsPresent(candidateSyncEvents),
		avEndAlignment: timelinesMatch(
			candidateTimeline.endDifferenceUs,
			currentTimeline.endDifferenceUs,
		),
		avStartAlignment: timelinesMatch(
			candidateTimeline.startDifferenceUs,
			currentTimeline.startDifferenceUs,
		),
		candidateHasOneGeneratedAudioMix:
			candidateSecondTrial.report.inspection.tracks.audio.length === 1,
		containerCodecsAndDimensionsMatch: outputShapeMatches(
			currentSecondTrial,
			candidateSecondTrial,
		),
		deliveryRemainsExplicit:
			candidateSecondTrial.report.delivery.required &&
			!candidateSecondTrial.report.delivery.performed,
		selectionDurationMatches: selectionVideoDurationMatches(
			currentSecondTrial,
			candidateSecondTrial,
		),
		sourceHasTwoAudioTracks: sourceAudioTrackCount === 2,
	};

	return {
		checks: {
			...checks,
			allPassed: Object.values(checks).every(Boolean),
		},
		comparison: {
			candidate: {
				artifact: candidateSecondTrial.report.inspection,
				avTimeline: candidateTimeline,
				cost: {
					finalBytes: candidateSecondTrial.artifact.sizeBytes,
					intermediateBytes: 0,
					outputCount: 1,
					videoPipelinePasses: 1,
					wallClockMs: candidateTimer.elapsedMs(),
				},
				delivery: candidateSecondTrial.report.delivery,
				syncEvents: candidateSyncEvents,
			},
			current: {
				artifact: currentSecondTrial.report.inspection,
				avTimeline: currentTimeline,
				cost: {
					finalBytes: currentSecondTrial.artifact.sizeBytes,
					intermediateBytes: intermediate.artifact.sizeBytes,
					outputCount: 2,
					videoPipelinePasses: 2,
					wallClockMs: currentTimer.elapsedMs(),
				},
				delivery: currentSecondTrial.report.delivery,
				syncEvents: currentSyncEvents,
			},
			memory: {
				peakBytes: null,
				reason:
					"Chromium exposes no trustworthy per-operation peak-memory measurement to page JavaScript; heap snapshots and measureUserAgentSpecificMemory are point-in-time measurements.",
				status: "unavailable",
			},
		},
		fixture: {
			fileName: SINGLE_PASS_MIXED_AUDIO_FIXTURE.fileName,
			selectionDurationUs: SELECTION_DURATION_US,
			sourceAudioTrackCount,
			sourceBytes: currentSecondTrial.report.source.blob.sizeBytes,
		},
	};
}

async function runSinglePassMixedAudioPrototypeExport(
	request: DefaultExportRunnerRequest,
) {
	request.onProgress({ phase: "preparing" });
	const resolved = request.resolvedOutput
		? { kind: "resolved" as const, plan: request.resolvedOutput }
		: resolveOutputPlan({
				asset: request.asset,
				audioMix: request.audioMix,
				outputSettings: request.outputSettings,
				support: MEDIABUNNY_OUTPUT_SUPPORT,
			});
	if (resolved.kind === "invalid") {
		throw new Error(resolved.error);
	}
	const mixPlan = createAudioMixPlan({
		audioMix: request.audioMix,
		trackIds: Object.keys(request.audioMix.tracks),
	});
	if (!audioMixPlanHasIncludedTracks(mixPlan) || !resolved.plan.audioCodec) {
		throw new Error(
			"The single-pass prototype requires a Generated audio mix.",
		);
	}
	const resolution = resolveOutputResolution({
		asset: request.asset,
		setting: request.outputSettings.resolution,
	});
	const videoQuality = resolveOutputQuality({
		mediaKind: "video",
		setting: resolved.plan.videoQuality,
	});
	const audioQuality = resolveOutputQuality({
		mediaKind: "audio",
		setting: resolved.plan.audioQuality,
	});
	if (resolution.kind === "invalid") {
		throw new Error(resolution.error);
	}
	if (videoQuality.kind === "invalid") {
		throw new Error(videoQuality.error);
	}
	if (audioQuality.kind === "invalid") {
		throw new Error(audioQuality.error);
	}

	request.onProgress({ phase: "preparing", message: "Preparing audio mix." });
	const mixedAudio = await renderBrowserAudioMix({
		audioMix: request.audioMix,
		selection: request.selection,
		signal: request.signal,
		source: request.source,
	});
	if (!mixedAudio) {
		throw new Error(
			"The representative source produced no Generated audio mix.",
		);
	}
	request.onProgress({ phase: "encoding" });
	const result = await runSinglePassMixedAudioExportPrototype({
		audioBuffer: mixedAudio.audioBuffer,
		audioCodec: resolved.plan.audioCodec as AudioCodec,
		audioQuality: toMediabunnyAudioQuality({
			codec: resolved.plan.audioCodec as AudioCodec,
			quality: audioQuality,
		}),
		containerId: resolved.plan.container.id,
		mimeType: resolved.plan.container.mimeType,
		resolution: resolution.conversionDimensions,
		selection: request.selection,
		signal: request.signal,
		source: request.source,
		videoCodec: resolved.plan.videoCodec as VideoCodec,
		videoQuality: toMediabunnyQuality(videoQuality),
	});
	request.onProgress({ completedRatio: 1, phase: "finalizing" });

	return {
		blob: result.blob,
		mimeType: resolved.plan.container.mimeType,
	};
}

const videoOnlyIntermediateProbeRunner: DefaultExportRunner = {
	cancelSupported: true,
	run(request) {
		return browserDefaultExportRunner.run({
			...request,
			audioMix: excludeEveryAudioTrack(request.audioMix),
		});
	},
};

function excludeEveryAudioTrack(audioMix: AudioMix): AudioMix {
	return {
		...audioMix,
		tracks: Object.fromEntries(
			Object.entries(audioMix.tracks).map(([trackId, decision]) => [
				trackId,
				{ ...decision, include: false },
			]),
		),
	};
}

function createMeasuredRunner(runner: DefaultExportRunner) {
	const measurementsMs: number[] = [];

	return {
		elapsedMs: () => roundMeasurement(median(measurementsMs)),
		runner: {
			cancelSupported: runner.cancelSupported,
			async run(request: DefaultExportRunnerRequest) {
				const startMs = performance.now();
				try {
					return await runner.run(request);
				} finally {
					measurementsMs.push(performance.now() - startMs);
				}
			},
		} satisfies DefaultExportRunner,
	};
}

async function inspectGeneratedMediaAvTimeline(
	blob: Blob,
): Promise<GeneratedMediaAvTimeline> {
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(blob),
	});

	try {
		const [videoTrack, audioTrack] = await Promise.all([
			input.getPrimaryVideoTrack(),
			input.getPrimaryAudioTrack(),
		]);
		const [video, audio] = await Promise.all([
			videoTrack ? inspectTrackTimeline(videoTrack) : null,
			audioTrack ? inspectTrackTimeline(audioTrack) : null,
		]);

		return {
			audio,
			endDifferenceUs:
				audio && video ? Math.abs(audio.endUs - video.endUs) : null,
			startDifferenceUs:
				audio && video ? Math.abs(audio.startUs - video.startUs) : null,
			video,
		};
	} finally {
		input.dispose();
	}
}

async function inspectGeneratedMediaSyncEvents(
	blob: Blob,
): Promise<GeneratedMediaSyncEvent[]> {
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(blob),
	});

	try {
		const [videoTrack, audioTrack] = await Promise.all([
			input.getPrimaryVideoTrack(),
			input.getPrimaryAudioTrack(),
		]);
		if (!videoTrack || !audioTrack) {
			return [];
		}
		const videoSink = new CanvasSink(videoTrack);
		const audioSink = new AudioSampleSink(audioTrack);
		const events: GeneratedMediaSyncEvent[] = [];

		for (const timestampUs of SYNC_EVENT_SAMPLE_TIMES_US) {
			const timestampSeconds = timestampUs / 1_000_000;
			const [wrappedCanvas, audioSample] = await Promise.all([
				videoSink.getCanvas(timestampSeconds),
				audioSink.getSample(timestampSeconds),
			]);
			if (!wrappedCanvas || !audioSample) {
				return [];
			}

			try {
				events.push({
					audioPeak: roundMeasurement(
						peakAudioBuffer(audioSample.toAudioBuffer()),
					),
					timestampUs,
					videoMeanLuma: roundMeasurement(meanCanvasLuma(wrappedCanvas.canvas)),
				});
			} finally {
				audioSample.close();
			}
		}

		return events;
	} finally {
		input.dispose();
	}
}

function peakAudioBuffer(audioBuffer: AudioBuffer) {
	let peak = 0;

	for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
		const channelData = audioBuffer.getChannelData(channel);
		for (const sample of channelData) {
			peak = Math.max(peak, Math.abs(sample));
		}
	}

	return peak;
}

function meanCanvasLuma(canvas: HTMLCanvasElement | OffscreenCanvas) {
	const context = canvas.getContext("2d");
	if (!context) {
		return 0;
	}
	const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
	let total = 0;

	for (let index = 0; index < pixels.length; index += 4) {
		total +=
			0.2126 * (pixels[index] ?? 0) +
			0.7152 * (pixels[index + 1] ?? 0) +
			0.0722 * (pixels[index + 2] ?? 0);
	}

	return total / (pixels.length / 4);
}

function syncEventsPresent(events: readonly GeneratedMediaSyncEvent[]) {
	return (
		events.length === SYNC_EVENT_SAMPLE_TIMES_US.length &&
		events.every(
			(event) => event.audioPeak >= 0.02 && event.videoMeanLuma >= 200,
		)
	);
}

async function inspectTrackTimeline(track: {
	computeDuration: () => Promise<number>;
	getFirstTimestamp: () => Promise<number>;
}): Promise<TrackTimeline> {
	const [durationSeconds, startSeconds] = await Promise.all([
		track.computeDuration(),
		track.getFirstTimestamp(),
	]);
	const durationUs = Math.round(durationSeconds * 1_000_000);
	const startUs = Math.round(startSeconds * 1_000_000);

	return { durationUs, endUs: startUs + durationUs, startUs };
}

function outputShapeMatches(
	current: ExportArtifactHarnessResult,
	candidate: ExportArtifactHarnessResult,
) {
	const currentVideo = current.report.inspection.tracks.video[0];
	const candidateVideo = candidate.report.inspection.tracks.video[0];
	const currentAudio = current.report.inspection.tracks.audio[0];
	const candidateAudio = candidate.report.inspection.tracks.audio[0];

	return (
		current.report.inspection.container ===
			candidate.report.inspection.container &&
		currentVideo?.codec === candidateVideo?.codec &&
		currentVideo?.width === candidateVideo?.width &&
		currentVideo?.height === candidateVideo?.height &&
		currentAudio?.codec === candidateAudio?.codec
	);
}

function timelinesMatch(candidateUs: number | null, currentUs: number | null) {
	return (
		candidateUs !== null &&
		currentUs !== null &&
		Math.abs(candidateUs - currentUs) <= TIMELINE_TOLERANCE_US
	);
}

function selectionVideoDurationMatches(
	current: ExportArtifactHarnessResult,
	candidate: ExportArtifactHarnessResult,
) {
	const currentDurationUs =
		current.report.inspection.tracks.video[0]?.durationUs;
	const candidateDurationUs =
		candidate.report.inspection.tracks.video[0]?.durationUs;

	return (
		currentDurationUs !== undefined &&
		candidateDurationUs !== undefined &&
		Math.abs(currentDurationUs - SELECTION_DURATION_US) <=
			TIMELINE_TOLERANCE_US &&
		Math.abs(candidateDurationUs - currentDurationUs) <= TIMELINE_TOLERANCE_US
	);
}

function median(values: readonly number[]) {
	if (values.length === 0) {
		return 0;
	}

	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) {
		return sorted[middle] ?? 0;
	}

	return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function roundMeasurement(value: number) {
	return Math.round(value * 100) / 100;
}
