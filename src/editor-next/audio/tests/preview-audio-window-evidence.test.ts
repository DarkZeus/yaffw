/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";

import {
	PREVIEW_AUDIO_COUNTERBALANCED_ORDER,
	PREVIEW_AUDIO_EVIDENCE_STRATEGIES,
	type PreviewAudioEvidenceConfig,
	type PreviewAudioEvidenceFixture,
	type PreviewAudioEvidenceTrial,
	assertCompletePreviewAudioEvidence,
	runPreviewAudioEvidence,
} from "../prototype/playhead-window/preview-audio-evidence-harness";

const fixture: PreviewAudioEvidenceFixture = {
	durationSeconds: 120,
	fileName: "long-two-aac.mp4",
	mimeType: "video/mp4",
	sha256: "fixture-sha-256",
	sizeBytes: 4,
	trackCount: 2,
};

const config: PreviewAudioEvidenceConfig = {
	chunkTargetSeconds: 0.2,
	initialPlayheadSeconds: 12,
	lookaheadSeconds: 1.5,
	playbackRate: 1,
	playbackSeconds: 30,
	pumpIntervalMs: 50,
	stallSchedule: [{ atPlaybackSeconds: 10, durationMs: 500 }],
	windowSeconds: 2,
};

describe("Preview audio window evidence record", () => {
	it("runs five complete counterbalanced comparisons per strategy on one fixture", async () => {
		const requests: Array<{ round: number; strategy: string }> = [];
		const source = new Blob([new Uint8Array(fixture.sizeBytes)], {
			type: fixture.mimeType,
		});
		const record = await runPreviewAudioEvidence({
			config,
			executeTrial: async (request) => {
				requests.push({ round: request.round, strategy: request.strategy });
				expect(request.source).toBe(source);
				expect(request.fixture).toBe(fixture);
				expect(request.config).toBe(config);
				return createTrial(request.round, request.strategy);
			},
			fixture,
			gitSha: "abc123",
			mediabunnyVersion: "1.52.2",
			recordedAt: "2026-08-16T00:00:00.000Z",
			source,
		});

		expect(requests).toEqual(
			PREVIEW_AUDIO_COUNTERBALANCED_ORDER.flatMap((strategies, roundIndex) =>
				strategies.map((strategy) => ({
					round: roundIndex + 1,
					strategy,
				})),
			),
		);
		expect(record.trials).toHaveLength(15);
		expect(record.fixture).toEqual(fixture);
		expect(record.config).toEqual(config);
		expect(record.config).not.toBe(config);
		for (const strategy of PREVIEW_AUDIO_EVIDENCE_STRATEGIES) {
			expect(
				record.trials.filter((trial) => trial.strategy === strategy),
			).toHaveLength(5);
			expect(record.summariesByStrategy[strategy]).toMatchObject({
				cleanupPassed: true,
				trialCount: 5,
			});
		}
		expect(
			record.trials.every(
				(trial) =>
					trial.fixtureSha256 === fixture.sha256 &&
					trial.pcm.afterCleanupBytes === 0 &&
					trial.cleanup.residualNodes === 0 &&
					trial.cleanup.residualPcmBytes === 0 &&
					trial.cleanup.residualTimers === 0,
			),
		).toBe(true);
		expect(JSON.parse(JSON.stringify(record))).toEqual(record);
	});

	it("rejects a record that retains PCM after teardown", async () => {
		const source = new Blob([new Uint8Array(fixture.sizeBytes)]);
		const record = await runPreviewAudioEvidence({
			config,
			executeTrial: async (request) =>
				createTrial(request.round, request.strategy),
			fixture,
			source,
		});
		const firstTrial = record.trials[0];
		if (!firstTrial) throw new Error("Expected a controlled trial.");
		firstTrial.cleanup.residualPcmBytes = 4;

		expect(() => assertCompletePreviewAudioEvidence(record)).toThrow(
			/cleanup gate/,
		);
	});

	it("rejects a record whose strategy failed before producing evidence", async () => {
		const source = new Blob([new Uint8Array(fixture.sizeBytes)]);
		const record = await runPreviewAudioEvidence({
			config,
			executeTrial: async (request) =>
				createTrial(request.round, request.strategy),
			fixture,
			source,
		});
		const bridgeTrial = record.trials.find(
			(trial) => trial.strategy === "remux-decode-bridge",
		);
		if (!bridgeTrial) throw new Error("Expected a bridge trial.");
		bridgeTrial.errors.push("Remux failed before measurement.");

		expect(() => assertCompletePreviewAudioEvidence(record)).toThrow(
			/recorded errors/,
		);
	});

	it("rejects a complete record that misses the continuity decision gate", async () => {
		const source = new Blob([new Uint8Array(fixture.sizeBytes)]);
		const record = await runPreviewAudioEvidence({
			config,
			executeTrial: async ({ round, strategy }) => createTrial(round, strategy),
			fixture,
			recordedAt: "2026-08-16T00:00:00.000Z",
			source,
		});
		record.summariesByStrategy["playhead-window"].totalUnderruns = 1;

		expect(() => assertCompletePreviewAudioEvidence(record)).toThrow(
			/continuity gate/,
		);
	});
});

function createTrial(
	round: number,
	strategy: PreviewAudioEvidenceTrial["strategy"],
): PreviewAudioEvidenceTrial {
	const strategyOffset =
		PREVIEW_AUDIO_EVIDENCE_STRATEGIES.indexOf(strategy) * 10;
	return {
		cleanup: {
			contextsClosed: 1,
			generationsCancelled: strategy === "playhead-window" ? 1 : 0,
			inputsDisposed: 1,
			providersDisposed: strategy === "playhead-window" ? 1 : 0,
			residualNodes: 0,
			residualPcmBytes: 0,
			residualTimers: 0,
			staleCompletionsDropped: 0,
		},
		continuity: {
			maxUnderrunMs: 0,
			minLeadMs: 1_000,
			totalUnderrunMs: 0,
			underrunCount: 0,
		},
		decoderWork: {
			decodeAudioDataCalls: strategy === "remux-decode-bridge" ? 2 : 0,
			decodedFrames: 192_000,
			decodedMediaSeconds: 4,
			decodedOutputChunks: strategy === "playhead-window" ? 10 : 0,
			decodedSamples: strategy === "remux-decode-bridge" ? 0 : 188,
			metadataPacketScans: 0,
			rangeRequests: strategy === "remux-decode-bridge" ? 0 : 2,
			remuxedBytes: strategy === "remux-decode-bridge" ? 1024 : 0,
			remuxedPackets: strategy === "remux-decode-bridge" ? 188 : 0,
			windowPulls: strategy === "playhead-window" ? 3 : 0,
		},
		errors: [],
		fixtureSha256: fixture.sha256,
		id: `round-${round}-${strategy}`,
		pcm: {
			afterCleanupBytes: 0,
			atReadinessBytes: 1_536_000 + strategyOffset,
			peakBytes: 1_536_000 + strategyOffset,
		},
		readiness: {
			explicitFailureTrackCount: 0,
			knownSilenceTrackCount: 0,
			playableTrackCount: 2,
			prepareToReadyMs:
				strategy === "playhead-window"
					? 10 + round
					: 100 + round + strategyOffset,
			readyToSharedEpochMs: 1,
		},
		responsiveness: {
			longTaskCount: 0,
			longTaskMaxMs: 0,
			longTaskTotalMs: 0,
			timerIntervals: {
				count: 10,
				intervalsOver25Ms: 0,
				intervalsOver50Ms: 0,
				maxMs: 11,
				medianMs: 10,
				p95Ms: 11,
			},
		},
		round,
		sourceChurn: {
			nodesCreated: 2,
			nodesDisconnected: 2,
			nodesEnded: 2,
			nodesStarted: 2,
			nodesStopped: 0,
			peakLiveNodes: 2,
		},
		strategy,
	};
}
