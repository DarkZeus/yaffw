import { readFileSync, writeFileSync } from "node:fs";
const evidence = JSON.parse(
	readFileSync(process.argv[2] || "tmp/copy-boundaries/evidence.json", "utf8"),
);
function endpoints(frames) {
	return { count: frames.length, first: frames[0], last: frames.at(-1) };
}
const summary = {
	...evidence,
	fixtures: evidence.fixtures.map((fixture) => ({
		...fixture,
		source: {
			...fixture.source,
			video: {
				...fixture.source.video,
				frames: endpoints(fixture.source.video.frames),
			},
		},
	})),
	results: evidence.results.map((result) => ({
		...result,
		report: {
			boundaryEvidence: result.report.boundaryEvidence,
			rangeAccuracy: result.report.rangeAccuracy,
			exportReview: result.report.exportReview,
			inspection: result.report.inspection,
			frameTiming: result.report.source.asset.frameTiming,
			progress: {
				count: result.report.execution.progress.length,
				phases: [
					...new Set(
						result.report.execution.progress.map((event) => event.phase),
					),
				],
			},
		},
		artifact: {
			...result.artifact,
			presented: {
				...result.artifact.presented,
				frames: endpoints(result.artifact.presented.frames),
			},
			encoded: Object.fromEntries(
				Object.entries(result.artifact.encoded).map(([key, value]) => [
					key,
					Array.isArray(value) ? endpoints(value) : value,
				]),
			),
		},
	})),
	measurement: {
		boundary:
			"First source-frame identity quantization; final source-frame PTS plus its actual output presentation duration. Source interval coverage, video output duration, audio PCM tail and native duration are distinct records.",
		native:
			"Chromium endpoint seeks confirm visible identities for MP4, MOV and WebM. A held last image at an audio-driven native duration does not prove a video endpoint.",
		cost: "exportElapsedMs wraps the unchanged production runner; elapsedMs additionally includes source analysis and artifact metadata inspection. Both exclude native endpoint checks and independent ffmpeg analysis.",
		scope:
			"Synthetic AVC/B-frame CFR and VFR inputs in Chromium 151 with Mediabunny1.65.2. WebM uses compatible VP8/Opus; other outputs AVC/AAC. No physical playback, universal codec or exact-boundary guarantee.",
	},
};
writeFileSync(
	process.argv[3] || "tmp/copy-boundaries/summary.json",
	`${JSON.stringify(summary, null, 2)}\n`,
);
console.log(`${summary.results.length} trials summarized`);
